import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { healthStatusEnum, httpMethodEnum } from "./enums.js";

export const monitors = pgTable(
  "monitors",
  {
    id: uuid("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    url: text("url").notNull(),
    method: httpMethodEnum("method").notNull().default("GET"),
    encryptedHeaders: text("encrypted_headers"),
    headerKeys: jsonb("header_keys").notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
    encryptedBody: text("encrypted_body"),
    encryptedAuthConfig: text("encrypted_auth_config"),
    assertionRules: jsonb("assertion_rules").notNull().default(sql`'[]'::jsonb`).$type<unknown[]>(),
    intervalSeconds: integer("interval_seconds").notNull().default(300),
    timeoutMs: integer("timeout_ms").notNull().default(10000),
    isActive: boolean("is_active").notNull().default(true),
    healthStatus: healthStatusEnum("health_status").notNull().default("UNKNOWN"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    consecutiveSuccesses: integer("consecutive_successes").notNull().default(0),
    currentIncidentId: uuid("current_incident_id"),
    version: integer("version").notNull().default(1),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true, mode: "date" }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("chk_monitor_interval", sql`interval_seconds >= 60 AND interval_seconds <= 86400`),
    check("chk_monitor_timeout", sql`timeout_ms >= 1000 AND timeout_ms <= 30000`),
    index("idx_monitors_due").on(table.nextRunAt).where(sql`is_active = true`),
  ],
);

export type MonitorSelect = typeof monitors.$inferSelect;
export type MonitorInsert = typeof monitors.$inferInsert;
