import {
  FailureCategory,
  HealthStatus,
  HttpMethod,
  Incident,
  Monitor,
  UUIDv7,
} from "@sentinel/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { formatNotificationConfigAad } from "../src/ports/out/index.js";
import {
  FakeCipher,
  FakeClock,
  FakeLogger,
  FakeNotification,
  InMemoryIncidentRepository,
  InMemoryMonitorRepository,
  InMemoryNotificationConfigRepository,
  InMemoryNotificationDeliveryRepository,
  SequentialIdGenerator,
} from "../src/test-doubles/index.js";
import { DispatchNotification } from "../src/use-cases/incidents/dispatch-notification.use-case.js";

describe("DispatchNotificationUseCase (P10.3)", () => {
  let notifConfigRepo: InMemoryNotificationConfigRepository;
  let incidentRepo: InMemoryIncidentRepository;
  let monitorRepo: InMemoryMonitorRepository;
  let deliveryRepo: InMemoryNotificationDeliveryRepository;
  let notifPort: FakeNotification;
  let cipher: FakeCipher;
  let clock: FakeClock;
  let logger: FakeLogger;
  let idGen: SequentialIdGenerator;
  let useCase: DispatchNotification;

  const monitorId = new UUIDv7("018f0000-0000-7000-8000-000000000001");
  const incidentId = new UUIDv7("018f0000-0000-7000-8000-000000000010");
  const rawBotToken = "123456789:ABCdefGHIjklMNO";
  const chatId = "-100123456789";

  beforeEach(async () => {
    notifConfigRepo = new InMemoryNotificationConfigRepository();
    incidentRepo = new InMemoryIncidentRepository();
    monitorRepo = new InMemoryMonitorRepository();
    deliveryRepo = new InMemoryNotificationDeliveryRepository();
    notifPort = new FakeNotification();
    cipher = new FakeCipher();
    clock = new FakeClock(new Date("2026-10-24T06:00:00Z"));
    logger = new FakeLogger();
    idGen = new SequentialIdGenerator("deliv");

    useCase = new DispatchNotification(
      notifConfigRepo,
      incidentRepo,
      monitorRepo,
      deliveryRepo,
      notifPort,
      cipher,
      clock,
      logger,
      idGen,
    );

    // Save monitor
    await monitorRepo.save(
      new Monitor({
        id: monitorId,
        name: "Order API",
        url: "https://orders.internal/health",
        method: HttpMethod.GET,
        assertionRules: [],
        consecutiveFailures: 3,
        consecutiveSuccesses: 0,
        healthStatus: HealthStatus.DOWN,
        isActive: true,
        intervalSeconds: 60,
        timeoutMs: 5000,
        createdAt: new Date("2026-10-24T00:00:00Z"),
        updatedAt: new Date("2026-10-24T00:00:00Z"),
      }),
    );

    // Save incident
    await incidentRepo.save(
      Incident.open(
        incidentId,
        monitorId,
        FailureCategory.HTTP_STATUS_MISMATCH,
        "Status 500 received",
        new Date("2026-10-24T05:50:00Z"),
      ),
    );

    // Save encrypted telegram config with AAD D-21
    const configId = "notif-cfg-1";
    const aad = formatNotificationConfigAad(configId, "botToken");
    const encryptedBotToken = await cipher.encrypt(rawBotToken, aad);

    await notifConfigRepo.saveTelegramConfig({
      id: configId,
      encryptedBotToken,
      chatId,
      createdAt: new Date("2026-10-24T00:00:00Z"),
      updatedAt: new Date("2026-10-24T00:00:00Z"),
    });
  });

  it("decrypts token with AAD D-21, formats message, sends and updates delivery to SENT", async () => {
    const deliveryId = "deliv-init-1";
    await deliveryRepo.save({
      id: deliveryId,
      incidentId: incidentId.toString(),
      channel: "TELEGRAM",
      status: "PENDING",
      attemptCount: 0,
      lastAttemptAt: null,
      lastError: null,
      createdAt: new Date("2026-10-24T05:50:00Z"),
    });

    await useCase.execute({
      incidentId: incidentId.toString(),
      type: "OPENED",
      deliveryId,
    });

    expect(notifPort.sentMessages).toHaveLength(1);
    const sent = notifPort.sentMessages[0];
    expect(sent?.botToken).toBe(rawBotToken);
    expect(sent?.chatId).toBe(chatId);
    expect(sent?.messageMarkdownV2).toContain("Order API");

    const deliveries = await deliveryRepo.findByIncidentId(incidentId.toString());
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("SENT");
    expect(deliveries[0]?.attemptCount).toBe(1);
    expect(deliveries[0]?.lastAttemptAt?.toISOString()).toBe("2026-10-24T06:00:00.000Z");
    expect(deliveries[0]?.lastError).toBeNull();
  });

  it("handles delivery failure: marks delivery FAILED and throws error for retry", async () => {
    const deliveryId = "deliv-init-2";
    await deliveryRepo.save({
      id: deliveryId,
      incidentId: incidentId.toString(),
      channel: "TELEGRAM",
      status: "PENDING",
      attemptCount: 0,
      lastAttemptAt: null,
      lastError: null,
      createdAt: new Date("2026-10-24T05:50:00Z"),
    });

    notifPort.queueResult({
      success: false,
      error: "Telegram API 500: Internal error",
    });

    await expect(
      useCase.execute({
        incidentId: incidentId.toString(),
        type: "OPENED",
        deliveryId,
      }),
    ).rejects.toThrow("Telegram API 500: Internal error");

    const deliveries = await deliveryRepo.findByIncidentId(incidentId.toString());
    expect(deliveries[0]?.status).toBe("FAILED");
    expect(deliveries[0]?.attemptCount).toBe(1);
    expect(deliveries[0]?.lastError).toBe("Telegram API 500: Internal error");
  });

  it("attaches retryAfterSeconds to error when receiving 429", async () => {
    notifPort.queueResult({
      success: false,
      retryAfterSeconds: 30,
      error: "Telegram API 429: Too Many Requests",
    });

    try {
      await useCase.execute({
        incidentId: incidentId.toString(),
        type: "OPENED",
      });
      expect.unreachable("Should have thrown error");
    } catch (err) {
      expect((err as { retryAfterSeconds?: number }).retryAfterSeconds).toBe(30);
    }
  });

  it("skips notification safely without erroring if Telegram config is missing", async () => {
    // Clear config
    await notifConfigRepo.saveTelegramConfig({
      id: "none",
      encryptedBotToken: "",
      chatId: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // In InMemory repo, clear all
    notifConfigRepo.clear();

    await expect(
      useCase.execute({
        incidentId: incidentId.toString(),
        type: "OPENED",
        deliveryId: "deliv-missing-cfg",
      }),
    ).resolves.not.toThrow();

    expect(notifPort.sentMessages).toHaveLength(0);

    const deliveries = await deliveryRepo.findByIncidentId(incidentId.toString());
    expect(deliveries[0]?.status).toBe("FAILED");
    expect(deliveries[0]?.lastError).toBe("Telegram configuration not found");
  });
});
