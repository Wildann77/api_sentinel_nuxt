import type { NotificationDeliveryData, TelegramConfigData } from "@sentinel/application";
import type { NotificationDeliveryStatus } from "@sentinel/contracts";
import type {
  NotificationConfigInsert,
  NotificationConfigSelect,
  NotificationDeliveryInsert,
  NotificationDeliverySelect,
} from "../../db/schema/index.js";

export const NotificationMapper = {
  toTelegramConfig(row: NotificationConfigSelect): TelegramConfigData {
    return {
      id: row.id,
      encryptedBotToken: row.encryptedBotToken,
      chatId: row.chatId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  toTelegramConfigInsert(config: TelegramConfigData): NotificationConfigInsert {
    return {
      id: config.id,
      channel: "TELEGRAM",
      chatId: config.chatId,
      encryptedBotToken: config.encryptedBotToken,
      isActive: true,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  },

  toDeliveryData(row: NotificationDeliverySelect): NotificationDeliveryData {
    return {
      id: row.id,
      incidentId: row.incidentId,
      channel: row.channel,
      status: row.status as NotificationDeliveryStatus,
      attemptCount: row.retryCount,
      lastAttemptAt: row.lastAttemptAt,
      lastError: row.safeErrorSummary,
      createdAt: row.createdAt,
    };
  },

  toDeliveryInsert(
    data: NotificationDeliveryData,
    notificationType = "INCIDENT_OPENED",
  ): NotificationDeliveryInsert {
    return {
      id: data.id,
      incidentId: data.incidentId,
      channel: data.channel,
      notificationType,
      status: data.status,
      retryCount: data.attemptCount,
      lastAttemptAt: data.lastAttemptAt,
      safeErrorSummary: data.lastError,
      createdAt: data.createdAt,
      updatedAt: new Date(),
    };
  },
};
