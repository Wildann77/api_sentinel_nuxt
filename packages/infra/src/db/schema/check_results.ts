import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { failureCategoryEnum, triggerTypeEnum } from "./enums.js";
import { incidents } from "./incidents.js";
import { monitors } from "./monitors.js";

export const checkResults = pgTable(
  "check_results",
  {
    id: uuid("id").notNull(),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id").references(() => incidents.id, {
      onDelete: "set null",
    }),
    triggerType: triggerTypeEnum("trigger_type").notNull().default("SCHEDULED"),
    scheduledFor: timestamp("scheduled_for", {
      withTimezone: true,
      mode: "date",
    }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    executedAt: timestamp("executed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    durationMs: integer("duration_ms").notNull(),
    isSuccess: boolean("is_success").notNull(),
    statusCode: integer("status_code"),
    failureCategory: failureCategoryEnum("failure_category"),
    pinnedIp: varchar("pinned_ip", { length: 45 }),
    assertionResults: jsonb("assertion_results")
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<unknown[]>(),
    diagnostics: jsonb("diagnostics"),
    sanitizedDiagnostic: text("sanitized_diagnostic"),
    correlationId: uuid("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.executedAt] }),
    index("idx_check_results_metrics").on(table.monitorId, table.executedAt.desc()),
    index("idx_check_results_incident").on(table.incidentId),
  ],
);

export type CheckResultSelect = typeof checkResults.$inferSelect;
export type CheckResultInsert = typeof checkResults.$inferInsert;
