import type { HeartbeatRepositoryPort, WorkerHeartbeatData } from "@sentinel/application";
import { desc, gte, lt } from "drizzle-orm";
import type { DrizzleDatabase } from "../db/connection.js";
import { workerHeartbeats } from "../db/schema/index.js";

export class DrizzleHeartbeatRepository implements HeartbeatRepositoryPort {
  constructor(private readonly db: DrizzleDatabase) {}

  private getDb(tx?: unknown): DrizzleDatabase {
    return (tx as DrizzleDatabase) ?? this.db;
  }

  public async upsert(heartbeat: WorkerHeartbeatData, tx?: unknown): Promise<void> {
    const targetDb = this.getDb(tx);
    await targetDb
      .insert(workerHeartbeats)
      .values({
        workerId: heartbeat.workerId,
        lastSeenAt: heartbeat.lastSeenAt,
        runningJobs: heartbeat.runningJobs,
      })
      .onConflictDoUpdate({
        target: workerHeartbeats.workerId,
        set: {
          lastSeenAt: heartbeat.lastSeenAt,
          runningJobs: heartbeat.runningJobs,
        },
      });
  }

  public async findActive(cutoff: Date): Promise<WorkerHeartbeatData[]> {
    const rows = await this.db
      .select()
      .from(workerHeartbeats)
      .where(gte(workerHeartbeats.lastSeenAt, cutoff))
      .orderBy(desc(workerHeartbeats.lastSeenAt));

    return rows.map((r) => ({
      workerId: r.workerId,
      lastSeenAt: r.lastSeenAt,
      runningJobs: r.runningJobs,
    }));
  }

  public async deleteStale(cutoff: Date, tx?: unknown): Promise<number> {
    const targetDb = this.getDb(tx);
    const deleted = await targetDb
      .delete(workerHeartbeats)
      .where(lt(workerHeartbeats.lastSeenAt, cutoff))
      .returning({ workerId: workerHeartbeats.workerId });

    return deleted.length;
  }
}
