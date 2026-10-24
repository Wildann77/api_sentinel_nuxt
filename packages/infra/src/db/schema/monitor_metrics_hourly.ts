import { integer, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { monitors } from "./monitors.js";

export const monitorMetricsHourly = pgTable(
  "monitor_metrics_hourly",
  {
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    bucket: timestamp("bucket", { withTimezone: true, mode: "date" }).notNull(),
    totalChecks: integer("total_checks").notNull(),
    successChecks: integer("success_checks").notNull(),
    avgLatencyMs: integer("avg_latency_ms").notNull(),
    p95LatencyMs: integer("p95_latency_ms").notNull(),
    p99LatencyMs: integer("p99_latency_ms").notNull(),
  },
  (table) => [primaryKey({ columns: [table.monitorId, table.bucket] })],
);

export type MonitorMetricsHourlySelect = typeof monitorMetricsHourly.$inferSelect;
export type MonitorMetricsHourlyInsert = typeof monitorMetricsHourly.$inferInsert;
