import type { LoggerPort } from "@sentinel/application";
import type { DrizzleSessionRepository } from "@sentinel/infra";
import {
  type DrizzleDatabase,
  ensureCheckResultsPartitions,
  type PgBoss,
  type PgPool,
  type PostgresRateLimiterAdapter,
  purgeExpiredCheckResults,
  upsertHourlyRollup,
} from "@sentinel/infra";

export type MaintenanceTaskType =
  | "rate_limits_cleanup"
  | "sessions_cleanup"
  | "metrics_hourly_rollup"
  | "partitions_maintenance"
  | "detect_stuck_jobs";

export interface MaintenanceJobPayload {
  readonly task: MaintenanceTaskType;
}

export interface MaintenanceJobDependencies {
  readonly boss: PgBoss;
  readonly db: DrizzleDatabase;
  readonly pool: PgPool;
  readonly rateLimiter: PostgresRateLimiterAdapter;
  readonly sessionRepository: DrizzleSessionRepository;
  readonly logger: LoggerPort;
}

export class MaintenanceJobHandler {
  public static readonly QUEUE_NAME = "maintenance";

  constructor(private readonly deps: MaintenanceJobDependencies) {}

  public async register(): Promise<void> {
    await this.deps.boss.work<MaintenanceJobPayload>(
      MaintenanceJobHandler.QUEUE_NAME,
      async (jobs) => {
        await Promise.all(
          jobs.map(async (job) => {
            const { task } = job.data;
            this.deps.logger.info("Executing maintenance task", { task, jobId: job.id });

            switch (task) {
              case "rate_limits_cleanup":
                await this.cleanupRateLimits();
                break;
              case "sessions_cleanup":
                await this.cleanupSessions();
                break;
              case "metrics_hourly_rollup":
                await this.rollupHourlyMetrics();
                break;
              case "partitions_maintenance":
                await this.maintainPartitions();
                break;
              case "detect_stuck_jobs":
                await this.detectStuckJobs();
                break;
              default:
                this.deps.logger.warn("Unknown maintenance task type received", { task });
            }
          }),
        );
      },
    );

    await this.scheduleCronJobs();

    this.deps.logger.info("Registered pg-boss maintenance worker and schedules", {
      queue: MaintenanceJobHandler.QUEUE_NAME,
    });
  }

  public async scheduleCronJobs(): Promise<void> {
    // 1. Cleanup rate_limits kedaluwarsa setiap jam (ARCH §5.3.5)
    await this.deps.boss.schedule(
      MaintenanceJobHandler.QUEUE_NAME,
      "0 * * * *",
      { task: "rate_limits_cleanup" },
      { singletonKey: "maintenance:rate_limits" },
    );

    // 2. Cleanup sessions kedaluwarsa setiap jam (D-07)
    await this.deps.boss.schedule(
      MaintenanceJobHandler.QUEUE_NAME,
      "0 * * * *",
      { task: "sessions_cleanup" },
      { singletonKey: "maintenance:sessions" },
    );

    // 3. Rollup metrics hourly setiap jam pada menit ke-5 (ARCH §6.4.B, D-07)
    await this.deps.boss.schedule(
      MaintenanceJobHandler.QUEUE_NAME,
      "5 * * * *",
      { task: "metrics_hourly_rollup" },
      { singletonKey: "maintenance:metrics" },
    );

    // 4. Pemeliharaan partisi + retensi setiap hari pukul 02:00 (F4.4, D-06, D-23)
    await this.deps.boss.schedule(
      MaintenanceJobHandler.QUEUE_NAME,
      "0 2 * * *",
      { task: "partitions_maintenance" },
      { singletonKey: "maintenance:partitions" },
    );

    // 5. Deteksi job macet dan backlog setiap 5 menit (PRD §4.20)
    await this.deps.boss.schedule(
      MaintenanceJobHandler.QUEUE_NAME,
      "*/5 * * * *",
      { task: "detect_stuck_jobs" },
      { singletonKey: "maintenance:backlog" },
    );
  }

  public async cleanupRateLimits(): Promise<number> {
    const deletedCount = await this.deps.rateLimiter.pruneExpired();
    this.deps.logger.info("Expired rate limits cleaned up", { deletedCount });
    return deletedCount;
  }

  public async cleanupSessions(): Promise<number> {
    const deletedCount = await this.deps.sessionRepository.deleteExpired();
    this.deps.logger.info("Expired sessions cleaned up", { deletedCount });
    return deletedCount;
  }

  public async rollupHourlyMetrics(): Promise<number> {
    const result = await upsertHourlyRollup(this.deps.db);
    this.deps.logger.info("Hourly metrics rollup completed", { affectedRows: result.affectedRows });
    return result.affectedRows;
  }

  public async maintainPartitions(): Promise<{ created: string[]; dropped: string[] }> {
    const ensureResult = await ensureCheckResultsPartitions(this.deps.pool, 2);
    const purgeResult = await purgeExpiredCheckResults(this.deps.pool, 90, 400);

    this.deps.logger.info("Partition maintenance completed", {
      created: ensureResult.created,
      dropped: purgeResult.dropped_partitions,
      defaultRowsDeleted: purgeResult.default_rows_deleted,
      rollupRowsDeleted: purgeResult.rollup_rows_deleted,
    });

    return {
      created: ensureResult.created,
      dropped: purgeResult.dropped_partitions,
    };
  }

  public async detectStuckJobs(): Promise<{ stuckCount: number; backlogCount: number }> {
    try {
      const stuckResult = await this.deps.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count 
         FROM pgboss.job 
         WHERE state = 'active' 
           AND startedon < NOW() - INTERVAL '5 minutes';`,
      );
      const stuckCount = Number.parseInt(stuckResult.rows[0]?.count ?? "0", 10);

      const backlogResult = await this.deps.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count 
         FROM pgboss.job 
         WHERE state = 'created';`,
      );
      const backlogCount = Number.parseInt(backlogResult.rows[0]?.count ?? "0", 10);

      if (stuckCount > 0 || backlogCount > 500) {
        this.deps.logger.warn("Job backlog or stuck jobs detected in pg-boss queue", {
          stuckCount,
          backlogCount,
        });
      } else {
        this.deps.logger.info("Job health check OK", { stuckCount, backlogCount });
      }

      return { stuckCount, backlogCount };
    } catch (error) {
      this.deps.logger.error("Failed to query pg-boss job tables for stuck job detection", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { stuckCount: 0, backlogCount: 0 };
    }
  }
}
