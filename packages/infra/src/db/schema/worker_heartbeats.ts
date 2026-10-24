import { integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerId: varchar("worker_id", { length: 100 }).primaryKey(),
  lastSeenAt: timestamp("last_seen_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  runningJobs: integer("running_jobs").notNull().default(0),
});

export type WorkerHeartbeatSelect = typeof workerHeartbeats.$inferSelect;
export type WorkerHeartbeatInsert = typeof workerHeartbeats.$inferInsert;
