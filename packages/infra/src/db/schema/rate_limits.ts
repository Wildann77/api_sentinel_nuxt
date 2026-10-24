import { index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: varchar("key", { length: 255 }).primaryKey(),
    points: integer("points").notNull().default(1),
    expireAt: timestamp("expire_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("idx_rate_limits_expire").on(table.expireAt)],
);

export type RateLimitSelect = typeof rateLimits.$inferSelect;
export type RateLimitInsert = typeof rateLimits.$inferInsert;
