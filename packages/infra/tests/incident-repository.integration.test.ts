import {
  EndpointUrl,
  FailureCategory,
  HttpMethod,
  Incident,
  Monitor,
  UUIDv7,
} from "@sentinel/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DrizzleDatabase } from "../src/db/connection.js";
import { closePgPool, createDrizzleDb, createPgPool } from "../src/db/connection.js";
import { incidents, monitors } from "../src/db/schema/index.js";
import { DrizzleIncidentRepository } from "../src/repositories/drizzle-incident-repository.js";
import { DrizzleMonitorRepository } from "../src/repositories/drizzle-monitor-repository.js";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel_dev";

describe("P17.3 — DrizzleIncidentRepository Pagination & Filtering Integration", () => {
  let pool: ReturnType<typeof createPgPool>;
  let db: DrizzleDatabase;
  let incidentRepo: DrizzleIncidentRepository;
  let monitorRepo: DrizzleMonitorRepository;

  const monitorId1 = "018f0000-0000-7000-8000-000000000101";
  const monitorId2 = "018f0000-0000-7000-8000-000000000102";

  beforeAll(() => {
    pool = createPgPool({
      connectionString: TEST_DB_URL,
      applicationName: "incident_repo_test",
      max: 5,
    });
    db = createDrizzleDb(pool);
    incidentRepo = new DrizzleIncidentRepository(db);
    monitorRepo = new DrizzleMonitorRepository(db);
  });

  afterAll(async () => {
    await closePgPool(pool);
  });

  beforeEach(async () => {
    await db.delete(incidents);
    await db.delete(monitors);

    for (const id of [monitorId1, monitorId2]) {
      await monitorRepo.save(
        new Monitor({
          id: UUIDv7.fromString(id),
          name: `Monitor ${id}`,
          url: new EndpointUrl("https://example.com/test"),
          method: HttpMethod.GET,
          intervalSeconds: 60,
          timeoutMs: 5000,
          nextRunAt: new Date(),
        }),
      );
    }
  });

  it("findOpenByMonitorId returns open incident or null when resolved", async () => {
    const incId = "018f0000-0000-7000-8000-000000000110";
    const incident = new Incident({
      id: UUIDv7.fromString(incId),
      monitorId: UUIDv7.fromString(monitorId1),
      startedAt: new Date("2026-10-27T08:00:00Z"),
      causeCategory: FailureCategory.HTTP_STATUS_MISMATCH,
      initialErrorMessage: "HTTP 502",
    });
    await incidentRepo.save(incident);

    const open = await incidentRepo.findOpenByMonitorId(monitorId1);
    expect(open).not.toBeNull();
    expect(open?.id.toString()).toBe(incId);
    expect(open?.isResolved).toBe(false);

    // Resolve incident
    incident.resolve(new Date("2026-10-27T08:15:00Z"));
    await incidentRepo.update(incident);

    const afterResolve = await incidentRepo.findOpenByMonitorId(monitorId1);
    expect(afterResolve).toBeNull();
  });

  it("filters incidents by isOpen status and monitorId with cursor pagination", async () => {
    const now = Date.now();
    // Seed 4 incidents: monitor1 (1 open, 1 resolved), monitor2 (1 open, 1 resolved)
    const inc1 = new Incident({
      id: UUIDv7.fromString("018f0000-0000-7000-8000-000000000121"),
      monitorId: UUIDv7.fromString(monitorId1),
      startedAt: new Date(now - 40000),
      causeCategory: FailureCategory.CONNECTION_TIMEOUT,
      initialErrorMessage: "Timeout",
    });
    const inc2 = new Incident({
      id: UUIDv7.fromString("018f0000-0000-7000-8000-000000000122"),
      monitorId: UUIDv7.fromString(monitorId2),
      startedAt: new Date(now - 30000),
      causeCategory: FailureCategory.HTTP_STATUS_MISMATCH,
      initialErrorMessage: "500",
    });
    const inc3 = new Incident({
      id: UUIDv7.fromString("018f0000-0000-7000-8000-000000000123"),
      monitorId: UUIDv7.fromString(monitorId1),
      startedAt: new Date(now - 20000),
      recoveredAt: new Date(now - 10000),
      isResolved: true,
      causeCategory: FailureCategory.CONNECTION_REFUSED,
      initialErrorMessage: "ECONNREFUSED",
    });
    const inc4 = new Incident({
      id: UUIDv7.fromString("018f0000-0000-7000-8000-000000000124"),
      monitorId: UUIDv7.fromString(monitorId2),
      startedAt: new Date(now - 10000),
      recoveredAt: new Date(now - 5000),
      isResolved: true,
      causeCategory: FailureCategory.DNS_RESOLUTION_FAILED,
      initialErrorMessage: "ENOTFOUND",
    });

    await incidentRepo.save(inc1);
    await incidentRepo.save(inc2);
    await incidentRepo.save(inc3);
    await incidentRepo.save(inc4);

    // Filter by monitorId
    const mon1Incidents = await incidentRepo.findAll({ monitorId: monitorId1 });
    expect(mon1Incidents).toHaveLength(2);

    // Filter by isOpen: true
    const openIncidents = await incidentRepo.findAll({ isOpen: true });
    expect(openIncidents).toHaveLength(2);

    // Filter by isOpen: false
    const resolvedIncidents = await incidentRepo.findAll({ isOpen: false });
    expect(resolvedIncidents).toHaveLength(2);

    // Test cursor pagination: page 1 with limit 2
    const page1 = await incidentRepo.findWithFilter({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeDefined();

    // Page 2 using cursor from page 1
    const page2 = await incidentRepo.findWithFilter({ limit: 2, cursor: page1.nextCursor });
    expect(page2.items).toHaveLength(2);
  });

  it("streams incidents across time boundaries", async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await incidentRepo.save(
        new Incident({
          id: UUIDv7.fromString(`018f0000-0000-7000-8000-00000000013${i}`),
          monitorId: UUIDv7.fromString(monitorId1),
          startedAt: new Date(now - (5 - i) * 60000),
          recoveredAt: new Date(now - (5 - i) * 60000 + 10000),
          isResolved: true,
          causeCategory: FailureCategory.CONNECTION_TIMEOUT,
          initialErrorMessage: `Err ${i}`,
        }),
      );
    }

    const streamed: Incident[] = [];
    for await (const inc of incidentRepo.streamIncidents({
      monitorId: UUIDv7.fromString(monitorId1),
      from: new Date(now - 10 * 60000),
      to: new Date(now + 60000),
    })) {
      streamed.push(inc);
    }

    expect(streamed).toHaveLength(5);
    expect(streamed[0]?.initialErrorMessage).toBe("Err 0");
  });
});
