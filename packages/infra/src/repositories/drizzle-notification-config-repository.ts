import type { NotificationConfigRepositoryPort, TelegramConfigData } from "@sentinel/application";
import { eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../db/connection.js";
import { notificationConfigs } from "../db/schema/index.js";
import { NotificationMapper } from "./mappers/notification.mapper.js";

export class DrizzleNotificationConfigRepository implements NotificationConfigRepositoryPort {
  constructor(private readonly db: DrizzleDatabase) {}

  private getDb(tx?: unknown): DrizzleDatabase {
    return (tx as DrizzleDatabase) ?? this.db;
  }

  public async getTelegramConfig(): Promise<TelegramConfigData | null> {
    const [row] = await this.db
      .select()
      .from(notificationConfigs)
      .where(eq(notificationConfigs.channel, "TELEGRAM"))
      .limit(1);

    return row ? NotificationMapper.toTelegramConfig(row) : null;
  }

  public async saveTelegramConfig(config: TelegramConfigData, tx?: unknown): Promise<void> {
    const targetDb = this.getDb(tx);
    const insertValues = NotificationMapper.toTelegramConfigInsert(config);

    await targetDb
      .insert(notificationConfigs)
      .values(insertValues)
      .onConflictDoUpdate({
        target: notificationConfigs.channel,
        set: {
          chatId: insertValues.chatId,
          encryptedBotToken: insertValues.encryptedBotToken,
          isActive: insertValues.isActive,
          updatedAt: new Date(),
        },
      });
  }
}
