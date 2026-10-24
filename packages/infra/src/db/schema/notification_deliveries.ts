import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { deliveryStatusEnum } from "./enums.js";
import { incidents } from "./incidents.js";

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 50 }).notNull().default("TELEGRAM"),
    notificationType: varchar("notification_type", { length: 50 }).notNull(),
    status: deliveryStatusEnum("status").notNull().default("PENDING"),
    retryCount: integer("retry_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", {
      withTimezone: true,
      mode: "date",
    }),
    safeErrorSummary: text("safe_error_summary"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_notification_deliveries_incident").on(table.incidentId),
    index("idx_notification_deliveries_status").on(table.status).where(sql`status = 'PENDING'`),
  ],
);

export type NotificationDeliverySelect = typeof notificationDeliveries.$inferSelect;
export type NotificationDeliveryInsert = typeof notificationDeliveries.$inferInsert;
