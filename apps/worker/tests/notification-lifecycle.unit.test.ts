/**
 * P10.5 — Pengujian Notifikasi & Siklus Hidup Insiden
 *
 * PANDUAN PENGUJIAN INTEGRASI MANUAL KE BOT TELEGRAM NYATA:
 * ==============================================================================
 * 1. Buat bot baru melalui @BotFather di Telegram:
 *    - Kirim: /newbot
 *    - Beri nama dan username bot, dapatkan bot token (format: 123456789:ABCdefGHIjklMNO...).
 * 2. Dapatkan chat ID target:
 *    - Untuk grup/channel: masukkan bot ke grup, kirim pesan apa saja, panggil:
 *      https://api.telegram.org/bot<TOKEN>/getUpdates
 *      Catat chat ID (biasanya bernilai negatif untuk grup/supergrup, misal: -100123456789).
 *    - Untuk private chat: kirim /start ke bot, cari "id" pada object "chat" di getUpdates.
 * 3. Simpan konfigurasi Telegram di API Sentinel:
 *    - Masuk ke dashboard /dashboard/settings
 *    - Isi Bot Token dan Chat ID target
 *    - Klik [TEST PING BOT] -> pastikan pesan uji coba masuk ke chat Telegram.
 * 4. Pengujian Otomatis Insiden:
 *    - Daftarkan monitor API pengujian yang sengaja mengembalikan HTTP 500.
 *    - Tunggu threshold 3x kegagalan berturut-turut.
 *    - Verifikasi notifikasi "API Sentinel — INSIDEN TERBUKA" masuk tepat 1 kali.
 *    - Biarkan kegagalan berulang terjadi, verifikasi TIDAK ADA notifikasi duplikat.
 *    - Pulihkan endpoint API agar mengembalikan HTTP 200 (2x berturut-turut).
 *    - Verifikasi notifikasi "API Sentinel — INSIDEN DIPULIHKAN" masuk tepat 1 kali.
 * ==============================================================================
 */

import {
  AssertionRule,
  EndpointUrl,
  FailureCategory,
  HttpMethod,
  Incident,
  Monitor,
  UUIDv7,
} from "@sentinel/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { formatNotificationConfigAad } from "../../../packages/application/src/ports/out/index.js";
import {
  FakeCipher,
  FakeClock,
  FakeLogger,
  FakeProbe,
  FakeQueue,
  FakeUnitOfWork,
  InMemoryCheckResultRepository,
  InMemoryIncidentRepository,
  InMemoryMonitorRepository,
  InMemoryNotificationConfigRepository,
  InMemoryNotificationDeliveryRepository,
  SequentialIdGenerator,
} from "../../../packages/application/src/test-doubles/index.js";
import { DispatchNotification } from "../../../packages/application/src/use-cases/incidents/dispatch-notification.use-case.js";
import { ExecuteScheduledCheck } from "../../../packages/application/src/use-cases/monitors/execute-scheduled-check.use-case.js";
import { TelegramBotNotificationAdapter } from "../../../packages/infra/src/notification/telegram-bot.adapter.js";
import { MockTelegramServer } from "../../../tests/helpers/mock-telegram.js";

describe("P10.5 — Notification Lifecycle & Resilience Integration Suite", () => {
  let mockTelegramServer: MockTelegramServer;
  let telegramBaseUrl: string;

  let monitorRepo: InMemoryMonitorRepository;
  let checkResultRepo: InMemoryCheckResultRepository;
  let incidentRepo: InMemoryIncidentRepository;
  let notifConfigRepo: InMemoryNotificationConfigRepository;
  let deliveryRepo: InMemoryNotificationDeliveryRepository;
  let uow: FakeUnitOfWork;
  let probe: FakeProbe;
  let cipher: FakeCipher;
  let queue: FakeQueue;
  let idGen: SequentialIdGenerator;
  let clock: FakeClock;
  let logger: FakeLogger;

  let checkUseCase: ExecuteScheduledCheck;
  let dispatchUseCase: DispatchNotification;
  let telegramAdapter: TelegramBotNotificationAdapter;

  const rawBotToken = "987654321:AASecretTelegramBotTokenXYZ_DoNotLeak";
  const targetChatId = "-1001999888777";
  const configId = "cfg-telegram-production";

  beforeAll(async () => {
    mockTelegramServer = new MockTelegramServer();
    telegramBaseUrl = await mockTelegramServer.start();
  });

  afterAll(async () => {
    await mockTelegramServer.stop();
  });

  beforeEach(async () => {
    mockTelegramServer.clearSentMessages();
    mockTelegramServer.setMode({ type: "success" });

    monitorRepo = new InMemoryMonitorRepository();
    checkResultRepo = new InMemoryCheckResultRepository();
    incidentRepo = new InMemoryIncidentRepository();
    notifConfigRepo = new InMemoryNotificationConfigRepository();
    deliveryRepo = new InMemoryNotificationDeliveryRepository();
    uow = new FakeUnitOfWork();
    probe = new FakeProbe();
    cipher = new FakeCipher();
    queue = new FakeQueue();
    idGen = new SequentialIdGenerator();
    clock = new FakeClock(new Date("2026-10-24T10:00:00.000Z"));
    logger = new FakeLogger();

    telegramAdapter = new TelegramBotNotificationAdapter({
      baseUrl: telegramBaseUrl,
      timeoutMs: 3000,
    });

    checkUseCase = new ExecuteScheduledCheck(
      monitorRepo,
      checkResultRepo,
      incidentRepo,
      deliveryRepo,
      uow,
      probe,
      cipher,
      queue,
      idGen,
      clock,
      logger,
    );

    dispatchUseCase = new DispatchNotification(
      notifConfigRepo,
      incidentRepo,
      monitorRepo,
      deliveryRepo,
      telegramAdapter,
      cipher,
      clock,
      logger,
      idGen,
    );

    // Save encrypted Telegram configuration with AAD D-21
    const aad = formatNotificationConfigAad(configId, "botToken");
    const encryptedBotToken = await cipher.encrypt(rawBotToken, aad);

    await notifConfigRepo.saveTelegramConfig({
      id: configId,
      chatId: targetChatId,
      encryptedBotToken,
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
  });

  const createTestMonitor = () => {
    return Monitor.create({
      id: UUIDv7.fromString(idGen.generate()),
      name: "Payment Gateway API",
      url: EndpointUrl.create("https://api.payment.internal/v1/charge"),
      method: HttpMethod.POST,
      intervalSeconds: 60,
      timeoutMs: 5000,
      isActive: true,
      healthStatus: "UP",
      assertionRules: [new AssertionRule({ type: "status", expected: [200] })],
    });
  };

  it("produces exactly 1 event on opening, 0 on repeated failures, and exactly 1 on recovery", async () => {
    const monitor = createTestMonitor();
    await monitorRepo.save(monitor);

    // Failure 1 & 2 -> DEGRADED, no incident, no notification job queued
    probe.enqueueResponse({ statusCode: 500, headers: {}, bodySnippet: "Err 1", durationMs: 50 });
    await checkUseCase.execute({ monitorId: monitor.id.toString() });

    probe.enqueueResponse({ statusCode: 500, headers: {}, bodySnippet: "Err 2", durationMs: 50 });
    await checkUseCase.execute({ monitorId: monitor.id.toString() });

    expect(queue.jobs).toHaveLength(0);
    expect(mockTelegramServer.getSentMessages()).toHaveLength(0);

    // Failure 3 -> DOWN! Incident opened!
    probe.enqueueResponse({
      statusCode: 503,
      headers: {},
      bodySnippet: "Unavailable",
      durationMs: 80,
    });
    const res3 = await checkUseCase.execute({ monitorId: monitor.id.toString() });

    expect(res3.healthStatus).toBe("DOWN");
    expect(queue.jobs).toHaveLength(1);
    const openedJob = queue.jobs[0];
    expect(openedJob).toBeDefined();
    if (!openedJob) throw new Error("Expected opened job");
    expect(openedJob.queueName).toBe("notification:send");
    expect(openedJob.options?.singletonKey).toContain(":OPENED");

    // Process notification job for OPENED incident
    const payloadOpened = openedJob.payload as {
      incidentId: string;
      type: "OPENED";
      deliveryId?: string;
    };
    await dispatchUseCase.execute(payloadOpened);

    expect(mockTelegramServer.getSentMessages()).toHaveLength(1);
    const firstSent = mockTelegramServer.getSentMessages()[0];
    expect(firstSent).toBeDefined();
    if (!firstSent) throw new Error("Expected sent message");
    expect(firstSent.chatId).toBe(targetChatId);
    expect(firstSent.text).toContain("INSIDEN TERBUKA");
    expect(firstSent.text).toContain("Payment Gateway API");
    expect(firstSent.token).toBe(rawBotToken);

    // Repeated failures 4, 5, 6 -> Still DOWN, no new jobs queued, no new telegram messages
    for (let i = 4; i <= 6; i++) {
      probe.enqueueResponse({
        statusCode: 503,
        headers: {},
        bodySnippet: `Err ${i}`,
        durationMs: 60,
      });
      await checkUseCase.execute({ monitorId: monitor.id.toString() });
    }

    // Queue still has only the initial 1 job! No duplicate dispatch!
    expect(queue.jobs).toHaveLength(1);
    expect(mockTelegramServer.getSentMessages()).toHaveLength(1);

    // Recovery step 1 (success 1) -> Still DOWN, consecutiveSuccesses = 1
    probe.enqueueResponse({ statusCode: 200, headers: {}, bodySnippet: "{}", durationMs: 30 });
    const rec1 = await checkUseCase.execute({ monitorId: monitor.id.toString() });
    expect(rec1.healthStatus).toBe("DOWN");
    expect(queue.jobs).toHaveLength(1);

    // Recovery step 2 (success 2) -> RECOVERED to UP!
    probe.enqueueResponse({ statusCode: 200, headers: {}, bodySnippet: "{}", durationMs: 35 });
    const rec2 = await checkUseCase.execute({ monitorId: monitor.id.toString() });
    expect(rec2.healthStatus).toBe("UP");

    // Exactly 2 jobs queued now (1 opened, 1 recovered)
    expect(queue.jobs).toHaveLength(2);
    const recoveredJob = queue.jobs[1];
    expect(recoveredJob).toBeDefined();
    if (!recoveredJob) throw new Error("Expected recovered job");
    expect(recoveredJob.options?.singletonKey).toContain(":RECOVERED");

    // Process notification job for RECOVERED incident
    const payloadRecovered = recoveredJob.payload as {
      incidentId: string;
      type: "RECOVERED";
      deliveryId?: string;
    };
    await dispatchUseCase.execute(payloadRecovered);

    expect(mockTelegramServer.getSentMessages()).toHaveLength(2);
    const secondSent = mockTelegramServer.getSentMessages()[1];
    expect(secondSent).toBeDefined();
    if (!secondSent) throw new Error("Expected sent message");
    expect(secondSent.chatId).toBe(targetChatId);
    expect(secondSent.text).toContain("INSIDEN DIPULIHKAN");
  });

  it("does not affect monitoring check results when Telegram API fails or experiences outage", async () => {
    const monitor = createTestMonitor();
    await monitorRepo.save(monitor);

    // Configure MockTelegramServer to fail with 500 Internal Server Error
    mockTelegramServer.setMode({
      type: "error",
      statusCode: 500,
      description: "Telegram Bot Gateway Crashed",
    });

    // Run 3 failures to trigger DOWN
    probe.enqueueResponse({ statusCode: 500, headers: {}, bodySnippet: "Err", durationMs: 40 });
    await checkUseCase.execute({ monitorId: monitor.id.toString() });

    probe.enqueueResponse({ statusCode: 500, headers: {}, bodySnippet: "Err", durationMs: 40 });
    await checkUseCase.execute({ monitorId: monitor.id.toString() });

    probe.enqueueResponse({ statusCode: 500, headers: {}, bodySnippet: "Err", durationMs: 40 });
    const checkResult = await checkUseCase.execute({ monitorId: monitor.id.toString() });

    // Check execution SUCCEEDED regardless of Telegram state!
    expect(checkResult.status).toBe("EXECUTED");
    expect(checkResult.healthStatus).toBe("DOWN");

    const savedResults = await checkResultRepo.findByMonitorId(monitor.id, 10);
    expect(savedResults).toHaveLength(3);
    expect(savedResults[0]?.statusCode).toBe(500);

    // Now execute dispatch which talks to failing Telegram server
    const openedJob = queue.jobs[0];
    expect(openedJob).toBeDefined();
    if (!openedJob) throw new Error("Expected opened job");
    const payload = openedJob.payload as {
      incidentId: string;
      type: "OPENED";
      deliveryId?: string;
    };

    await expect(dispatchUseCase.execute(payload)).rejects.toThrow("Telegram API error (500)");

    // Verify delivery audit record is FAILED and records safe error
    const deliveries = await deliveryRepo.findByIncidentId(payload.incidentId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("FAILED");
    expect(deliveries[0]?.attemptCount).toBe(1);
    expect(deliveries[0]?.lastError).toContain("Telegram API error (500)");

    // Crucial: Check result and monitor health status remain completely intact!
    const verifiedMonitor = await monitorRepo.findById(monitor.id);
    expect(verifiedMonitor?.healthStatus).toBe("DOWN");
  });

  it("handles 429 Too Many Requests with retry-after header correctly", async () => {
    const monitor = createTestMonitor();
    await monitorRepo.save(monitor);

    const incidentId = UUIDv7.fromString(idGen.generate());
    const incident = Incident.open(
      incidentId,
      monitor.id,
      FailureCategory.HTTP_STATUS_MISMATCH,
      "500 Internal Error",
      clock.now(),
    );
    await incidentRepo.save(incident);

    mockTelegramServer.setMode({
      type: "rate_limit",
      retryAfterSeconds: 45,
    });

    const error = await dispatchUseCase
      .execute({
        incidentId: incident.id.toString(),
        type: "OPENED",
      })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    const retryError = error as Error & { retryAfterSeconds?: number };
    expect(retryError.retryAfterSeconds).toBe(45);
  });

  it("strictly enforces zero token leaks in logs, errors, and responses", async () => {
    mockTelegramServer.setMode({
      type: "unauthorized",
    });

    const monitor = createTestMonitor();
    await monitorRepo.save(monitor);

    probe.enqueueResponse({ statusCode: 500, headers: {}, bodySnippet: "Err", durationMs: 40 });
    await checkUseCase.execute({ monitorId: monitor.id.toString() });
    probe.enqueueResponse({ statusCode: 500, headers: {}, bodySnippet: "Err", durationMs: 40 });
    await checkUseCase.execute({ monitorId: monitor.id.toString() });
    probe.enqueueResponse({ statusCode: 500, headers: {}, bodySnippet: "Err", durationMs: 40 });
    await checkUseCase.execute({ monitorId: monitor.id.toString() });

    const job = queue.jobs[0];
    expect(job).toBeDefined();
    if (!job) throw new Error("Expected queued job");
    const payload = job.payload as { incidentId: string; type: "OPENED" };

    const err = await dispatchUseCase.execute(payload).catch((e) => e);

    // 1. Error string must NOT contain rawBotToken
    expect(String(err)).not.toContain(rawBotToken);

    // 2. Delivery record lastError must NOT contain rawBotToken
    const deliveries = await deliveryRepo.findByIncidentId(payload.incidentId);
    expect(deliveries[0]?.lastError).not.toContain(rawBotToken);

    // 3. Application logs must NOT contain rawBotToken
    const logsSerialized = logger.logs.map((l) => JSON.stringify(l)).join(" ");
    expect(logsSerialized).not.toContain(rawBotToken);
  });
});
