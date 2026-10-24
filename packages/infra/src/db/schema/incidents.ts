import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { failureCategoryEnum } from "./enums.js";
import { monitors } from "./monitors.js";

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey(),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    recoveredAt: timestamp("recovered_at", { withTimezone: true, mode: "date" }),
    durationSeconds: integer("duration_seconds"),
    causeCategory: failureCategoryEnum("cause_category").notNull(),
    initialErrorMessage: text("initial_error_message").notNull(),
    failureCount: integer("failure_count").notNull().default(1),
    isResolved: boolean("is_resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_incidents_one_open").on(table.monitorId).where(sql`is_resolved = false`),
    index("idx_incidents_monitor_id").on(table.monitorId),
  ],
);

export type IncidentSelect = typeof incidents.$inferSelect;
export type IncidentInsert = typeof incidents.$inferInsert;
