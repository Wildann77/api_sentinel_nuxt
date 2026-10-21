import type {
  NotificationDeliveryData,
  NotificationDeliveryRepositoryPort,
} from "@sentinel/application";
import { asc, eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../db/connection.js";
import { notificationDeliveries } from "../db/schema/index.js";
import { NotificationMapper } from "./mappers/notification.mapper.js";

export class DrizzleNotificationDeliveryRepository implements NotificationDeliveryRepositoryPort {
  constructor(private readonly db: DrizzleDatabase) {}

  private getDb(tx?: unknown): DrizzleDatabase {
    return (tx as DrizzleDatabase) ?? this.db;
  }

  public async save(delivery: NotificationDeliveryData, tx?: unknown): Promise<void> {
    const targetDb = this.getDb(tx);
    const insertValues = NotificationMapper.toDeliveryInsert(delivery);

    await targetDb
      .insert(notificationDeliveries)
      .values(insertValues)
      .onConflictDoUpdate({
        target: notificationDeliveries.id,
        set: {
          status: insertValues.status,
          retryCount: insertValues.retryCount,
          lastAttemptAt: insertValues.lastAttemptAt,
          safeErrorSummary: insertValues.safeErrorSummary,
          updatedAt: new Date(),
        },
      });
  }

  public async findByIncidentId(incidentId: string): Promise<NotificationDeliveryData[]> {
    const rows = await this.db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.incidentId, incidentId))
      .orderBy(asc(notificationDeliveries.createdAt));

    return rows.map((r) => NotificationMapper.toDeliveryData(r));
  }
}
