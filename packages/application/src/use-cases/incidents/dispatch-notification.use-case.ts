import type {
  DispatchNotificationCommand,
  DispatchNotificationUseCase,
} from "../../ports/in/incident.use-cases.js";
import {
  type CipherPort,
  type ClockPort,
  formatNotificationConfigAad,
  type IdGeneratorPort,
  type IncidentRepositoryPort,
  type LoggerPort,
  type MonitorRepositoryPort,
  type NotificationConfigRepositoryPort,
  type NotificationDeliveryData,
  type NotificationDeliveryRepositoryPort,
  type NotificationPort,
} from "../../ports/out/index.js";

export class DispatchNotification implements DispatchNotificationUseCase {
  constructor(
    private readonly notificationConfigRepo: NotificationConfigRepositoryPort,
    private readonly incidentRepo: IncidentRepositoryPort,
    private readonly monitorRepo: MonitorRepositoryPort,
    private readonly notificationDeliveryRepo: NotificationDeliveryRepositoryPort,
    private readonly notificationPort: NotificationPort,
    private readonly cipher: CipherPort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
    private readonly idGenerator?: IdGeneratorPort,
  ) {}

  public async execute(command: DispatchNotificationCommand): Promise<void> {
    const config = await this.notificationConfigRepo.getTelegramConfig();
    if (!config) {
      this.logger.warn("Telegram notification skipped: configuration not found or disabled", {
        incidentId: command.incidentId,
        type: command.type,
      });

      if (command.deliveryId) {
        await this.notificationDeliveryRepo.save({
          id: command.deliveryId,
          incidentId: command.incidentId,
          channel: "TELEGRAM",
          status: "FAILED",
          attemptCount: 1,
          lastAttemptAt: this.clock.now(),
          lastError: "Telegram configuration not found",
          createdAt: this.clock.now(),
        });
      }
      return;
    }

    const incident = await this.incidentRepo.findById(command.incidentId);
    if (!incident) {
      this.logger.warn("Telegram notification skipped: incident not found", {
        incidentId: command.incidentId,
      });
      return;
    }

    const monitor = await this.monitorRepo.findById(incident.monitorId);
    if (!monitor) {
      this.logger.warn("Telegram notification skipped: monitor not found", {
        monitorId: incident.monitorId.toString(),
      });
      return;
    }

    const aad = formatNotificationConfigAad(config.id, "botToken");
    const botToken = await this.cipher.decrypt(config.encryptedBotToken, aad);

    const message = this.notificationPort.formatIncidentMessage({
      monitorName: monitor.name,
      type: command.type,
      cause: incident.initialErrorMessage,
      openedAt: incident.startedAt,
      recoveredAt: incident.recoveredAt,
      durationSeconds: incident.durationSeconds,
    });

    const deliveries = await this.notificationDeliveryRepo.findByIncidentId(command.incidentId);
    const existingDelivery = command.deliveryId
      ? (deliveries.find((d) => d.id === command.deliveryId) ?? deliveries[0])
      : deliveries[0];

    const deliveryId =
      existingDelivery?.id ??
      command.deliveryId ??
      (this.idGenerator ? this.idGenerator.generate() : `deliv-${command.incidentId}`);

    const attemptCount = (existingDelivery?.attemptCount ?? 0) + 1;
    const now = this.clock.now();

    const result = await this.notificationPort.sendTelegram(botToken, config.chatId, message);

    if (result.success) {
      const deliveryData: NotificationDeliveryData = {
        id: deliveryId,
        incidentId: command.incidentId,
        channel: "TELEGRAM",
        status: "SENT",
        attemptCount,
        lastAttemptAt: now,
        lastError: null,
        createdAt: existingDelivery?.createdAt ?? now,
      };

      await this.notificationDeliveryRepo.save(deliveryData);

      this.logger.info("Telegram notification delivered successfully", {
        incidentId: command.incidentId,
        type: command.type,
        attemptCount,
      });
      return;
    }

    const failedDeliveryData: NotificationDeliveryData = {
      id: deliveryId,
      incidentId: command.incidentId,
      channel: "TELEGRAM",
      status: "FAILED",
      attemptCount,
      lastAttemptAt: now,
      lastError: result.error ?? "Failed to send Telegram message",
      createdAt: existingDelivery?.createdAt ?? now,
    };

    await this.notificationDeliveryRepo.save(failedDeliveryData);

    this.logger.error("Telegram notification delivery failed", {
      incidentId: command.incidentId,
      type: command.type,
      attemptCount,
      error: result.error,
      retryAfterSeconds: result.retryAfterSeconds,
    });

    const err = new Error(result.error ?? "Telegram notification delivery failed");
    if (result.retryAfterSeconds) {
      (err as unknown as { retryAfterSeconds?: number }).retryAfterSeconds =
        result.retryAfterSeconds;
    }
    throw err;
  }
}
