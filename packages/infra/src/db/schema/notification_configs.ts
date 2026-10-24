import { boolean, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const notificationConfigs = pgTable("notification_configs", {
  id: uuid("id").primaryKey(),
  channel: varchar("channel", { length: 50 }).notNull().unique().default("TELEGRAM"),
  chatId: varchar("chat_id", { length: 100 }).notNull(),
  encryptedBotToken: text("encrypted_bot_token").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type NotificationConfigSelect = typeof notificationConfigs.$inferSelect;
export type NotificationConfigInsert = typeof notificationConfigs.$inferInsert;
