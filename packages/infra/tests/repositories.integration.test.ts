import {
  AssertionRule,
  CheckResult,
  ConflictException,
  EncryptedSecret,
  EndpointUrl,
  FailureCategory,
  HttpMethod,
  Incident,
  Monitor,
  TriggerType,
  UUIDv7,
} from "@sentinel/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DrizzleDatabase } from "../src/db/connection.js";
import { closePgPool, createDrizzleDb, createPgPool } from "../src/db/connection.js";
import {
  checkResults,
  incidents,
  monitors,
  notificationConfigs,
  notificationDeliveries,
  sessions,
  users,
  workerHeartbeats,
} from "../src/db/schema/index.js";
import { DrizzleCheckResultRepository } from "../src/repositories/drizzle-check-result-repository.js";
import { DrizzleHeartbeatRepository } from "../src/repositories/drizzle-heartbeat-repository.js";
import { DrizzleIncidentRepository } from "../src/repositories/drizzle-incident-repository.js";
import { DrizzleMonitorRepository } from "../src/repositories/drizzle-monitor-repository.js";
import { DrizzleNotificationConfigRepository } from "../src/repositories/drizzle-notification-config-repository.js";
import { DrizzleNotificationDeliveryRepository } from "../src/repositories/drizzle-notification-delivery-repository.js";
import { DrizzleSessionRepository } from "../src/repositories/drizzle-session-repository.js";
import { DrizzleUserRepository } from "../src/repositories/drizzle-user-repository.js";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://sentinel_user:sentinel_password@localhost:5433/api_sentinel_dev";

describe("P4.5 — Drizzle Repositories Integration", () => {
  let pool: ReturnType<typeof createPgPool>;
  let db: DrizzleDatabase;

  let userRepo: DrizzleUserRepository;
  let sessionRepo: DrizzleSessionRepository;
  let monitorRepo: DrizzleMonitorRepository;
  let incidentRepo: DrizzleIncidentRepository;
  let checkResultRepo: DrizzleCheckResultRepository;
  let notifConfigRepo: DrizzleNotificationConfigRepository;
  let notifDeliveryRepo: DrizzleNotificationDeliveryRepository;
  let heartbeatRepo: DrizzleHeartbeatRepository;

  beforeAll(() => {
    pool = createPgPool({
      connectionString: TEST_DB_URL,
      applicationName: "api_sentinel_repo_test",
      max: 5,
    });
    db = createDrizzleDb(pool);

    userRepo = new DrizzleUserRepository(db);
    sessionRepo = new DrizzleSessionRepository(db);
    monitorRepo = new DrizzleMonitorRepository(db);
    incidentRepo = new DrizzleIncidentRepository(db);
    checkResultRepo = new DrizzleCheckResultRepository(db);
    notifConfigRepo = new DrizzleNotificationConfigRepository(db);
    notifDeliveryRepo = new DrizzleNotificationDeliveryRepository(db);
    heartbeatRepo = new DrizzleHeartbeatRepository(db);
  });

  afterAll(async () => {
    await closePgPool(pool);
  });

  beforeEach(async () => {
    await db.delete(notificationDeliveries);
    await db.delete(checkResults);
    await db.delete(incidents);
    await db.delete(monitors);
    await db.delete(sessions);
    await db.delete(users);
    await db.delete(notificationConfigs);
    await db.delete(workerHeartbeats);
  });

  describe("UserRepository & SessionRepository", () => {
    it("creates owner and verifies single owner constraint", async () => {
      const ownerId = "018d0000-0000-7000-8000-000000000001";
      await userRepo.createOwner({
        id: ownerId,
        username: "admin",
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const owner = await userRepo.getOwner();
      expect(owner).not.toBeNull();
      expect(owner?.username).toBe("admin");

      const foundById = await userRepo.findById(ownerId);
      expect(foundById?.id).toBe(ownerId);

      const foundByName = await userRepo.findByUsername("admin");
      expect(foundByName?.username).toBe("admin");

      // Verify single owner guard
      await expect(
        userRepo.createOwner({
          id: "018d0000-0000-7000-8000-000000000002",
          username: "second_admin",
          passwordHash: "$argon2id$hash",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).rejects.toThrow();

      // Update password hash
      await userRepo.updatePasswordHash(ownerId, "$argon2id$newhash");
      const updated = await userRepo.findById(ownerId);
      expect(updated?.passwordHash).toBe("$argon2id$newhash");
    });

    it("creates, touches, revokes and deletes expired sessions", async () => {
      const userId = "018d0000-0000-7000-8000-000000000001";
      await userRepo.createOwner({
        id: userId,
        username: "admin",
        passwordHash: "hash",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const tokenHash = "a".repeat(64);
      const idleExpiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const absoluteExpiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

      await sessionRepo.create({
        tokenHash,
        userId,
        idleExpiresAt,
        absoluteExpiresAt,
        lastActiveAt: new Date(),
        createdAt: new Date(),
      });

      const session = await sessionRepo.findByTokenHash(tokenHash);
      expect(session).not.toBeNull();
      expect(session?.userId).toBe(userId);

      // Touch session
      const newIdle = new Date(Date.now() + 48 * 3600 * 1000);
      await sessionRepo.touch(tokenHash, newIdle);
      const touched = await sessionRepo.findByTokenHash(tokenHash);
      expect(touched?.idleExpiresAt.getTime()).toBeCloseTo(newIdle.getTime(), -3);

      // Revoke session
      await sessionRepo.revoke(tokenHash);
      expect(await sessionRepo.findByTokenHash(tokenHash)).toBeNull();

      // Create expired session and delete
      const expiredHash = "b".repeat(64);
      await sessionRepo.create({
        tokenHash: expiredHash,
        userId,
        idleExpiresAt: new Date(Date.now() - 1000),
        absoluteExpiresAt,
        lastActiveAt: new Date(),
        createdAt: new Date(),
      });
      const deletedCount = await sessionRepo.deleteExpired();
      expect(deletedCount).toBe(1);
    });
  });

  describe("MonitorRepository", () => {
    function makeDummyMonitor(id: string, name: string, nextRunAt = new Date()): Monitor {
      return new Monitor({
        id: UUIDv7.fromString(id),
        name,
        url: new EndpointUrl("https://api.example.com/health"),
        method: HttpMethod.GET,
        encryptedHeaders: EncryptedSecret.parse(
          "v1:k1:0123456789abcdef0123456789abcdef0123456789abcdef:0123456789abcdef0123456789abcdef",
        ),
        headerKeys: ["Authorization"],
        assertionRules: [
          new AssertionRule({
            type: "status",
            operator: "equals",
            expected: 200,
          }),
        ],
        intervalSeconds: 60,
        timeoutMs: 5000,
        nextRunAt,
      });
    }

    it("saves, finds, and deletes monitors", async () => {
      const monitor = makeDummyMonitor("018d0000-0000-7000-8000-000000000010", "Stripe Gateway");
      await monitorRepo.save(monitor);

      const found = await monitorRepo.findById(monitor.id);
      expect(found).not.toBeNull();
      expect(found?.name).toBe("Stripe Gateway");
      expect(found?.headerKeys).toEqual(["Authorization"]);
      expect(found?.assertionRules).toHaveLength(1);

      const all = await monitorRepo.findAll();
      expect(all).toHaveLength(1);

      const deleted = await monitorRepo.delete(monitor.id);
      expect(deleted).toBe(true);
      expect(await monitorRepo.findById(monitor.id)).toBeNull();
    });

    it("enforces OCC version conflict checks (ARCH §6.3.B)", async () => {
      const monitor = makeDummyMonitor("018d0000-0000-7000-8000-000000000011", "Auth Service");
      await monitorRepo.save(monitor);

      // First update succeeds (monitor.version is 1 -> sets version to 2)
      monitor.pause(); // increments monitor.version to 2
      await monitorRepo.update(monitor);

      const updated = await monitorRepo.findById(monitor.id);
      expect(updated?.version).toBe(2);
      expect(updated?.healthStatus).toBe("PAUSED");

      // Attempting to update with an obsolete version should throw ConflictException
      const staleMonitor = makeDummyMonitor("018d0000-0000-7000-8000-000000000011", "Auth Service");
      staleMonitor.version = 1; // Stale client version

      await expect(monitorRepo.update(staleMonitor)).rejects.toThrow(ConflictException);
    });

    it("claims due monitors with FOR UPDATE SKIP LOCKED", async () => {
      const past = new Date(Date.now() - 5000);
      const future = new Date(Date.now() + 60000);

      const due1 = makeDummyMonitor("018d0000-0000-7000-8000-000000000012", "Due 1", past);
      const due2 = makeDummyMonitor("018d0000-0000-7000-8000-000000000013", "Due 2", past);
      const notDue = makeDummyMonitor("018d0000-0000-7000-8000-000000000014", "Not Due", future);

      await monitorRepo.save(due1);
      await monitorRepo.save(due2);
      await monitorRepo.save(notDue);

      const claimed = await monitorRepo.claimDue(10);
      expect(claimed).toHaveLength(2);
      expect(claimed.map((m) => m.name)).toContain("Due 1");
      expect(claimed.map((m) => m.name)).toContain("Due 2");
    });

    it("filters and paginates monitors with cursor", async () => {
      for (let i = 1; i <= 5; i++) {
        const m = makeDummyMonitor(`018d0000-0000-7000-8000-00000000002${i}`, `Service ${i}`);
        await monitorRepo.save(m);
      }

      const page1 = await monitorRepo.findWithFilter({ limit: 3 });
      expect(page1.items).toHaveLength(3);
      expect(page1.nextCursor).toBeDefined();

      if (page1.nextCursor) {
        const page2 = await monitorRepo.findWithFilter({
          limit: 3,
          cursor: page1.nextCursor,
        });
        expect(page2.items).toHaveLength(2);
      }

      // Search filter
      const searchResult = await monitorRepo.findWithFilter({ search: "Service 3" });
      expect(searchResult.items).toHaveLength(1);
      expect(searchResult.items[0].name).toBe("Service 3");
    });
  });

  describe("IncidentRepository", () => {
    it("creates, finds, resolves, and enforces single open incident", async () => {
      const monitorId = "018d0000-0000-7000-8000-000000000030";
      const monitor = new Monitor({
        id: UUIDv7.fromString(monitorId),
        name: "Database Service",
        url: new EndpointUrl("https://db.example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        nextRunAt: new Date(),
      });
      await monitorRepo.save(monitor);

      const incidentId1 = "018d0000-0000-7000-8000-000000000031";
      const incident = new Incident({
        id: UUIDv7.fromString(incidentId1),
        monitorId: UUIDv7.fromString(monitorId),
        startedAt: new Date(),
        causeCategory: FailureCategory.HTTP_STATUS_MISMATCH,
        initialErrorMessage: "HTTP 500 Internal Server Error",
      });

      await incidentRepo.save(incident);

      const openIncident = await incidentRepo.findOpenByMonitorId(monitorId);
      expect(openIncident).not.toBeNull();
      expect(openIncident?.id.toString()).toBe(incidentId1);

      // Verify unique open incident constraint
      const incident2 = new Incident({
        id: UUIDv7.fromString("018d0000-0000-7000-8000-000000000032"),
        monitorId: UUIDv7.fromString(monitorId),
        startedAt: new Date(),
        causeCategory: FailureCategory.CONNECTION_TIMEOUT,
        initialErrorMessage: "Timeout",
      });
      await expect(incidentRepo.save(incident2)).rejects.toThrow();

      // Resolve incident
      incident.resolve(new Date());
      await incidentRepo.update(incident);

      const resolved = await incidentRepo.findById(incidentId1);
      expect(resolved?.isResolved).toBe(true);
      expect(resolved?.recoveredAt).not.toBeNull();

      expect(await incidentRepo.findOpenByMonitorId(monitorId)).toBeNull();
    });
  });

  describe("CheckResultRepository", () => {
    it("inserts partitioned results, finds sparkline, and streams checks", async () => {
      const monitorId = "018d0000-0000-7000-8000-000000000040";
      const monitor = new Monitor({
        id: UUIDv7.fromString(monitorId),
        name: "Search API",
        url: new EndpointUrl("https://search.example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        nextRunAt: new Date(),
      });
      await monitorRepo.save(monitor);

      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        const time = new Date(now - (5 - i) * 60000);
        const check = new CheckResult({
          id: UUIDv7.fromString(`018d0000-0000-7000-8000-00000000005${i}`),
          monitorId: UUIDv7.fromString(monitorId),
          incidentId: null,
          triggerType: TriggerType.SCHEDULED,
          scheduledFor: time,
          startedAt: time,
          finishedAt: new Date(time.getTime() + 120),
          durationMs: 120 + i * 10,
          isSuccess: true,
          statusCode: 200,
          failureCategory: null,
          assertionResults: [],
          diagnostic: "OK",
          correlationId: `018d0000-0000-7000-8000-00000000008${i}`,
          pinnedIp: "93.184.216.34",
        });
        await checkResultRepo.save(check);
      }

      // Sparkline
      const sparkline = await checkResultRepo.findSparkline(monitorId, 5);
      expect(sparkline).toHaveLength(5);
      expect(sparkline[0].durationMs).toBe(120);

      // Find by monitor ID
      const results = await checkResultRepo.findByMonitorId(monitorId, 3);
      expect(results).toHaveLength(3);

      // Stream checks
      const streamed: CheckResult[] = [];
      for await (const c of checkResultRepo.streamChecks({
        monitorId,
        from: new Date(now - 10 * 60000),
        to: new Date(now + 60000),
      })) {
        streamed.push(c);
      }
      expect(streamed).toHaveLength(5);
    });
  });

  describe("Notification & Heartbeat Repositories", () => {
    it("manages Telegram config and notification deliveries", async () => {
      await notifConfigRepo.saveTelegramConfig({
        id: "018d0000-0000-7000-8000-000000000060",
        chatId: "123456789",
        encryptedBotToken:
          "v1:k1:0123456789abcdef0123456789abcdef0123456789abcdef:0123456789abcdef0123456789abcdef",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const config = await notifConfigRepo.getTelegramConfig();
      expect(config?.chatId).toBe("123456789");

      // Deliveries need incident parent
      const monitorId = "018d0000-0000-7000-8000-000000000070";
      await monitorRepo.save(
        new Monitor({
          id: UUIDv7.fromString(monitorId),
          name: "Notif Test Monitor",
          url: new EndpointUrl("https://example.com"),
          method: HttpMethod.GET,
          intervalSeconds: 60,
          timeoutMs: 5000,
          nextRunAt: new Date(),
        }),
      );

      const incidentId = "018d0000-0000-7000-8000-000000000071";
      await incidentRepo.save(
        new Incident({
          id: UUIDv7.fromString(incidentId),
          monitorId: UUIDv7.fromString(monitorId),
          startedAt: new Date(),
          causeCategory: FailureCategory.HTTP_STATUS_MISMATCH,
          initialErrorMessage: "Err",
        }),
      );

      await notifDeliveryRepo.save({
        id: "018d0000-0000-7000-8000-000000000072",
        incidentId,
        channel: "TELEGRAM",
        status: "PENDING",
        attemptCount: 1,
        lastAttemptAt: new Date(),
        lastError: null,
        createdAt: new Date(),
      });

      const deliveries = await notifDeliveryRepo.findByIncidentId(incidentId);
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].status).toBe("PENDING");
    });

    it("upserts worker heartbeats and prunes stale workers", async () => {
      const workerId = "worker-node-1";
      await heartbeatRepo.upsert({
        workerId,
        lastSeenAt: new Date(),
        runningJobs: 2,
      });

      const active = await heartbeatRepo.findActive(new Date(Date.now() - 10000));
      expect(active).toHaveLength(1);
      expect(active[0].workerId).toBe(workerId);

      // Prune stale
      const pruned = await heartbeatRepo.deleteStale(new Date(Date.now() + 10000));
      expect(pruned).toBe(1);
    });
  });
});
