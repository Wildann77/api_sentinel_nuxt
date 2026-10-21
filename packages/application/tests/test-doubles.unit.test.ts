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
import { describe, expect, it } from "vitest";
import {
  FakeCipher,
  FakeClock,
  FakeLogger,
  FakeNotification,
  FakePasswordHasher,
  FakeProbe,
  FakePubSub,
  FakeQueue,
  FakeRateLimiter,
  FakeUnitOfWork,
  InMemoryCheckResultRepository,
  InMemoryIncidentRepository,
  InMemoryMetricsRepository,
  InMemoryMonitorRepository,
  InMemoryNotificationConfigRepository,
  InMemoryNotificationDeliveryRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  SequentialIdGenerator,
} from "../src/test-doubles/index.js";

describe("P3.4 — In-Memory Test Doubles", () => {
  it("FakeClock controls and advances time deterministically", () => {
    const clock = new FakeClock("2026-10-23T10:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-10-23T10:00:00.000Z");

    clock.advanceSeconds(90);
    expect(clock.now().toISOString()).toBe("2026-10-23T10:01:30.000Z");

    clock.setTime("2026-10-23T12:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-10-23T12:00:00.000Z");
  });

  it("SequentialIdGenerator yields deterministic sequential or queued UUIDv7s", () => {
    const idGen = new SequentialIdGenerator();
    const id1 = idGen.generate();
    const id2 = idGen.generate();

    expect(id1).toBe("018f0000-0000-7000-8000-000000000001");
    expect(id2).toBe("018f0000-0000-7000-8000-000000000002");

    idGen.queueIds("custom-id-99");
    expect(idGen.generate()).toBe("custom-id-99");
    expect(idGen.generate()).toBe("018f0000-0000-7000-8000-000000000003");
  });

  it("FakeCipher encrypts, decrypts, and enforces AEAD context validation", async () => {
    const cipher = new FakeCipher();
    const encrypted = await cipher.encrypt("secret_token_123", "aad:monitor:1");
    expect(encrypted.startsWith("v1:mock:")).toBe(true);

    const decrypted = await cipher.decrypt(encrypted, "aad:monitor:1");
    expect(decrypted).toBe("secret_token_123");

    await expect(cipher.decrypt(encrypted, "aad:wrong_context")).rejects.toThrow(
      /AEAD verification failed/,
    );
  });

  it("FakeProbe records probe history and serves scripted or default responses", async () => {
    const probe = new FakeProbe();
    const res1 = await probe.probe({
      url: "https://api.sentinel.dev/health",
      method: "GET",
      timeoutMs: 5000,
    });

    expect(res1.statusCode).toBe(200);
    expect(probe.history).toHaveLength(1);

    probe.enqueueResponse({
      statusCode: 504,
      errorCategory: FailureCategory.CONNECTION_TIMEOUT,
      errorMessage: "Gateway timeout",
    });

    const res2 = await probe.probe({
      url: "https://api.sentinel.dev/slow",
      method: "POST",
      timeoutMs: 3000,
    });

    expect(res2.statusCode).toBe(504);
    expect(res2.errorCategory).toBe("CONNECTION_TIMEOUT");
    expect(probe.history).toHaveLength(2);
  });

  it("FakeQueue records jobs and handles singleton key policy", async () => {
    const queue = new FakeQueue();
    queue.rejectDuplicateSingletonKey = true;

    const id1 = await queue.send("probe:check", { monitorId: "m1" }, { singletonKey: "m1" });
    expect(id1).toBe("job_1");

    const id2 = await queue.send("probe:check", { monitorId: "m1" }, { singletonKey: "m1" });
    expect(id2).toBeNull();

    expect(queue.findJobs("probe:check")).toHaveLength(1);
  });

  it("FakeUnitOfWork simulates transaction execution, commit, and rollback", async () => {
    const uow = new FakeUnitOfWork();

    const result = await uow.runInTransaction(async (tx) => {
      expect(tx).toHaveProperty("txId");
      return "committed_data";
    });

    expect(result).toBe("committed_data");
    expect(uow.committedCount).toBe(1);
    expect(uow.rolledBackCount).toBe(0);

    await expect(
      uow.runInTransaction(async () => {
        throw new Error("DB Error");
      }),
    ).rejects.toThrow("DB Error");

    expect(uow.rolledBackCount).toBe(1);
  });

  it("FakeRateLimiter tracks sliding window limits per key", async () => {
    const limiter = new FakeRateLimiter();

    const r1 = await limiter.consume("user:123", 2, 60);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = await limiter.consume("user:123", 2, 60);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);

    const r3 = await limiter.consume("user:123", 2, 60);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("FakeLogger and FakeNotification capture dispatched actions", async () => {
    const logger = new FakeLogger();
    logger.info("Probe executed", { monitorId: "m1" });
    expect(logger.logs).toHaveLength(1);
    expect(logger.logs[0]?.msg).toBe("Probe executed");

    const notifier = new FakeNotification();
    const sent = await notifier.sendTelegram("bot123", "chat456", "*ALERT* Down");
    expect(sent.success).toBe(true);
    expect(notifier.sentMessages).toHaveLength(1);
    expect(notifier.sentMessages[0]?.chatId).toBe("chat456");
  });

  it("FakePasswordHasher and FakePubSub function in-memory", async () => {
    const hasher = new FakePasswordHasher();
    const hashed = await hasher.hash("secure_pass_123");
    expect(await hasher.verify("secure_pass_123", hashed)).toBe(true);
    expect(await hasher.verify("wrong_pass", hashed)).toBe(false);

    const pubsub = new FakePubSub();
    const received: string[] = [];
    const unsubscribe = await pubsub.subscribe("events", (payload) => received.push(payload));

    await pubsub.publish("events", '{"event":"monitor.up"}');
    expect(received).toEqual(['{"event":"monitor.up"}']);

    await unsubscribe();
    await pubsub.publish("events", '{"event":"monitor.down"}');
    expect(received).toHaveLength(1);
  });

  it("InMemory repositories perform CRUD operations accurately", async () => {
    const monitorRepo = new InMemoryMonitorRepository();
    const monitorId = new UUIDv7("018f0000-0000-7000-8000-000000000001");
    const monitor = new Monitor({
      id: monitorId,
      name: "API Checkout",
      url: new EndpointUrl("https://api.example.com/checkout"),
      method: HttpMethod.GET,
      intervalSeconds: 60,
      timeoutMs: 5000,
      nextRunAt: new Date("2026-10-23T10:00:00.000Z"),
    });

    await monitorRepo.save(monitor);
    expect(await monitorRepo.findById(monitor.id)).not.toBeNull();
    expect(
      await monitorRepo.findDueMonitors(new Date("2026-10-23T10:05:00.000Z"), 10),
    ).toHaveLength(1);

    const incidentRepo = new InMemoryIncidentRepository();
    const incidentId = new UUIDv7("018f0000-0000-7000-8000-000000000002");
    const incident = Incident.open(
      incidentId,
      monitor.id,
      FailureCategory.HTTP_STATUS_MISMATCH,
      "Expected 200 got 500",
      new Date(),
    );
    await incidentRepo.save(incident);
    expect(await incidentRepo.findOpenByMonitorId(monitor.id)).not.toBeNull();

    const checkRepo = new InMemoryCheckResultRepository();
    const checkId = new UUIDv7("018f0000-0000-7000-8000-000000000003");
    const check = new CheckResult({
      id: checkId,
      monitorId: monitor.id,
      incidentId: incident.id,
      triggerType: TriggerType.SCHEDULED,
      scheduledFor: new Date(),
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 45,
      isSuccess: true,
      statusCode: 200,
      failureCategory: null,
      assertionResults: [],
      correlationId: "corr-1",
      pinnedIp: "93.184.216.34",
    });
    await checkRepo.save(check);
    expect(await checkRepo.findByMonitorId(monitor.id, 10)).toHaveLength(1);

    const sessionRepo = new InMemorySessionRepository();
    await sessionRepo.create({
      tokenHash: "hash123",
      userId: "u1",
      idleExpiresAt: new Date(Date.now() + 60000),
      absoluteExpiresAt: new Date(Date.now() + 120000),
      createdAt: new Date(),
      lastActiveAt: new Date(),
    });
    expect(await sessionRepo.findByTokenHash("hash123")).not.toBeNull();

    const userRepo = new InMemoryUserRepository();
    await userRepo.createOwner({
      id: "u1",
      username: "admin",
      passwordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await userRepo.getOwner()).not.toBeNull();

    const notifConfigRepo = new InMemoryNotificationConfigRepository();
    await notifConfigRepo.saveTelegramConfig({
      id: "cfg1",
      encryptedBotToken: "enc_token",
      chatId: "12345",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await notifConfigRepo.getTelegramConfig()).not.toBeNull();

    const notifDeliveryRepo = new InMemoryNotificationDeliveryRepository();
    await notifDeliveryRepo.save({
      id: "del1",
      incidentId: incident.id.toString(),
      channel: "TELEGRAM",
      status: "SENT",
      attemptCount: 1,
      lastAttemptAt: new Date(),
      lastError: null,
      createdAt: new Date(),
    });
    expect(await notifDeliveryRepo.findByIncidentId(incident.id.toString())).toHaveLength(1);

    const metricsRepo = new InMemoryMetricsRepository();
    const summary = await metricsRepo.getSummary();
    expect(summary.totalMonitors).toBe(0);
    expect(summary.averageUptimePercentage).toBeNull();
  });
});
