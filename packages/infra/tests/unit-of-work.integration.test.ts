import {
  CheckResult,
  EndpointUrl,
  FailureCategory,
  HttpMethod,
  Incident,
  Monitor,
  TriggerType,
  UUIDv7,
} from "@sentinel/domain";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DrizzleDatabase } from "../src/db/connection.js";
import { closePgPool, createDrizzleDb, createPgPool } from "../src/db/connection.js";
import { DrizzleUnitOfWorkAdapter } from "../src/db/drizzle-unit-of-work.js";
import { checkResults, incidents, monitors } from "../src/db/schema/index.js";
import { PgBossQueueAdapter } from "../src/queue/pg-boss-queue-adapter.js";
import { DrizzleCheckResultRepository } from "../src/repositories/drizzle-check-result-repository.js";
import { DrizzleIncidentRepository } from "../src/repositories/drizzle-incident-repository.js";
import { DrizzleMonitorRepository } from "../src/repositories/drizzle-monitor-repository.js";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel_dev";

let seq = 1000;
function genUUIDv7(): string {
  const s = (seq++).toString(16).padStart(12, "0");
  return `018d0000-0000-7000-8000-${s}`;
}

describe("P4.6 — DrizzleUnitOfWorkAdapter Integration", () => {
  let pool: ReturnType<typeof createPgPool>;
  let db: DrizzleDatabase;
  let uow: DrizzleUnitOfWorkAdapter;

  let monitorRepo: DrizzleMonitorRepository;
  let incidentRepo: DrizzleIncidentRepository;
  let checkResultRepo: DrizzleCheckResultRepository;
  let boss: PgBoss;
  let queueAdapter: PgBossQueueAdapter;

  beforeAll(async () => {
    pool = createPgPool({
      connectionString: TEST_DB_URL,
      applicationName: "api_sentinel_uow_test",
      max: 5,
    });
    db = createDrizzleDb(pool);
    uow = new DrizzleUnitOfWorkAdapter(db);

    monitorRepo = new DrizzleMonitorRepository(db);
    incidentRepo = new DrizzleIncidentRepository(db);
    checkResultRepo = new DrizzleCheckResultRepository(db);

    boss = new PgBoss({
      connectionString: TEST_DB_URL,
      schema: "pgboss",
    });
    await boss.start();
    await boss.createQueue("notification_send", { policy: "stately" });

    queueAdapter = new PgBossQueueAdapter(boss);
  });

  afterAll(async () => {
    await boss.stop();
    await closePgPool(pool);
  });

  beforeEach(async () => {
    await boss.deleteAllJobs();
    await db.delete(checkResults);
    await db.delete(incidents);
    await db.delete(monitors);
  });

  it("commits atomically across monitor, check_result, incident and queue (No Dual-Write)", async () => {
    const monitorId = genUUIDv7();
    const initialMonitor = new Monitor({
      id: UUIDv7.fromString(monitorId),
      name: "Checkout Service",
      url: new EndpointUrl("https://checkout.example.com"),
      method: HttpMethod.POST,
      intervalSeconds: 60,
      timeoutMs: 5000,
      nextRunAt: new Date(),
    });
    await monitorRepo.save(initialMonitor);

    const checkId = genUUIDv7();
    const incidentId = genUUIDv7();

    // Run UoW transaction
    await uow.runInTransaction(async (tx) => {
      // 1. Lock monitor for update (ARCH §6.3.A)
      const lockedMonitor = await monitorRepo.lockForUpdate(monitorId, tx);
      expect(lockedMonitor).not.toBeNull();

      // 2. Create incident
      const incident = new Incident({
        id: UUIDv7.fromString(incidentId),
        monitorId: UUIDv7.fromString(monitorId),
        startedAt: new Date(),
        causeCategory: FailureCategory.HTTP_STATUS_MISMATCH,
        initialErrorMessage: "Service Unavailable",
      });
      await incidentRepo.save(incident, tx);

      // 3. Insert check result into partition
      const checkResult = new CheckResult({
        id: UUIDv7.fromString(checkId),
        monitorId: UUIDv7.fromString(monitorId),
        incidentId: UUIDv7.fromString(incidentId),
        triggerType: TriggerType.SCHEDULED,
        scheduledFor: new Date(),
        startedAt: new Date(),
        finishedAt: new Date(),
        durationMs: 340,
        isSuccess: false,
        statusCode: 503,
        failureCategory: FailureCategory.HTTP_STATUS_MISMATCH,
        assertionResults: [],
        diagnostic: "Service Unavailable",
        correlationId: "018d0000-0000-7000-8000-000000000199",
        pinnedIp: "93.184.216.34",
      });
      await checkResultRepo.save(checkResult, tx);

      // 4. Mutate monitor state
      if (lockedMonitor) {
        lockedMonitor.recordCheckFailure(checkResult, UUIDv7.fromString(incidentId));
        await monitorRepo.update(lockedMonitor, tx);
      }

      // 5. Enqueue notification using tx via fromDrizzle (D-01)
      const jobId = await queueAdapter.send(
        "notification_send",
        { incidentId, type: "INCIDENT_OPENED" },
        {
          db: tx,
          singletonKey: `${incidentId}:INCIDENT_OPENED`,
        },
      );
      expect(jobId).not.toBeNull();

      // 6. Issue NOTIFY in tx
      await uow.notify(
        tx,
        "sentinel_events",
        JSON.stringify({ event: "INCIDENT_OPENED", incidentId }),
      );
    });

    // Verify all records exist post-commit
    const committedCheck = await checkResultRepo.findById(checkId);
    expect(committedCheck).not.toBeNull();

    const committedIncident = await incidentRepo.findById(incidentId);
    expect(committedIncident).not.toBeNull();

    const updatedMonitor = await monitorRepo.findById(monitorId);
    expect(updatedMonitor?.version).toBe(1);
    expect(updatedMonitor?.consecutiveFailures).toBe(1);
  });

  it("rolls back completely on error leaving zero orphan check_results or ghost incidents", async () => {
    const monitorId = genUUIDv7();
    const initialMonitor = new Monitor({
      id: UUIDv7.fromString(monitorId),
      name: "Payment Gateway",
      url: new EndpointUrl("https://pay.example.com"),
      method: HttpMethod.POST,
      intervalSeconds: 60,
      timeoutMs: 5000,
      nextRunAt: new Date(),
    });
    await monitorRepo.save(initialMonitor);

    const checkId = genUUIDv7();
    const incidentId = genUUIDv7();

    // Transaction that throws error halfway
    const failedTx = uow.runInTransaction(async (tx) => {
      // 1. Insert check result
      const checkResult = new CheckResult({
        id: UUIDv7.fromString(checkId),
        monitorId: UUIDv7.fromString(monitorId),
        incidentId: null,
        triggerType: TriggerType.SCHEDULED,
        scheduledFor: new Date(),
        startedAt: new Date(),
        finishedAt: new Date(),
        durationMs: 500,
        isSuccess: false,
        statusCode: 500,
        failureCategory: FailureCategory.HTTP_STATUS_MISMATCH,
        assertionResults: [],
        diagnostic: "Simulated error",
        correlationId: "018d0000-0000-7000-8000-000000000299",
        pinnedIp: "93.184.216.34",
      });
      await checkResultRepo.save(checkResult, tx);

      // 2. Insert incident
      const incident = new Incident({
        id: UUIDv7.fromString(incidentId),
        monitorId: UUIDv7.fromString(monitorId),
        startedAt: new Date(),
        causeCategory: FailureCategory.HTTP_STATUS_MISMATCH,
        initialErrorMessage: "Simulated error",
      });
      await incidentRepo.save(incident, tx);

      // 3. Throw simulated error before commit
      throw new Error("Simulated system failure during UnitOfWork");
    });

    await expect(failedTx).rejects.toThrow("Simulated system failure during UnitOfWork");

    // Verify atomic rollback: no check result, no incident, monitor version untouched
    const orphanCheck = await checkResultRepo.findById(checkId);
    expect(orphanCheck).toBeNull();

    const ghostIncident = await incidentRepo.findById(incidentId);
    expect(ghostIncident).toBeNull();

    const unmodifiedMonitor = await monitorRepo.findById(monitorId);
    expect(unmodifiedMonitor?.version).toBe(1);
  });
});
