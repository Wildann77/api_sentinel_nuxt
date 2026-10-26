import type { LoggerPort } from "@sentinel/application";
import type {
  DrizzleDatabase,
  DrizzleSessionRepository,
  PgBoss,
  PostgresRateLimiterAdapter,
} from "@sentinel/infra";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MaintenanceJobHandler } from "../src/jobs/maintenance.job.js";

// Mock partitions and metrics repository helpers
vi.mock("@sentinel/infra", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentinel/infra")>();
  return {
    ...actual,
    ensureCheckResultsPartitions: vi.fn().mockResolvedValue({
      status: "ok",
      created: ["check_results_y2026m11", "check_results_y2026m12"],
    }),
    purgeExpiredCheckResults: vi.fn().mockResolvedValue({
      status: "ok",
      dropped_partitions: ["check_results_y2026m01"],
      default_rows_deleted: 0,
      rollup_rows_deleted: 15,
    }),
    upsertHourlyRollup: vi.fn().mockResolvedValue({
      affectedRows: 42,
    }),
  };
});

describe("P9.5 — MaintenanceJobHandler Unit Tests", () => {
  let boss: PgBoss;
  let db: DrizzleDatabase;
  let pool: pg.Pool;
  let rateLimiter: PostgresRateLimiterAdapter;
  let sessionRepo: DrizzleSessionRepository;
  let logger: LoggerPort;
  let handler: MaintenanceJobHandler;

  beforeEach(() => {
    boss = {
      work: vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn().mockResolvedValue(undefined),
    } as unknown as PgBoss;

    db = {} as DrizzleDatabase;

    pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ count: "0" }] }),
    } as unknown as pg.Pool;

    rateLimiter = {
      pruneExpired: vi.fn().mockResolvedValue(12),
    } as unknown as PostgresRateLimiterAdapter;

    sessionRepo = {
      deleteExpired: vi.fn().mockResolvedValue(5),
    } as unknown as DrizzleSessionRepository;

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    handler = new MaintenanceJobHandler({
      boss,
      db,
      pool,
      rateLimiter,
      sessionRepository: sessionRepo,
      logger,
    });
  });

  it("registers worker and schedules all 5 maintenance cron jobs with correct intervals and singleton keys", async () => {
    await handler.register();

    expect(boss.work).toHaveBeenCalledWith("maintenance", expect.any(Function));

    // 1. rate_limits cleanup (hourly)
    expect(boss.schedule).toHaveBeenCalledWith(
      "maintenance",
      "0 * * * *",
      { task: "rate_limits_cleanup" },
      { singletonKey: "maintenance:rate_limits" },
    );

    // 2. sessions cleanup (hourly)
    expect(boss.schedule).toHaveBeenCalledWith(
      "maintenance",
      "0 * * * *",
      { task: "sessions_cleanup" },
      { singletonKey: "maintenance:sessions" },
    );

    // 3. metrics rollup (hourly at :05)
    expect(boss.schedule).toHaveBeenCalledWith(
      "maintenance",
      "5 * * * *",
      { task: "metrics_hourly_rollup" },
      { singletonKey: "maintenance:metrics" },
    );

    // 4. partitions maintenance (daily at 02:00)
    expect(boss.schedule).toHaveBeenCalledWith(
      "maintenance",
      "0 2 * * *",
      { task: "partitions_maintenance" },
      { singletonKey: "maintenance:partitions" },
    );

    // 5. stuck jobs detection (every 5 mins)
    expect(boss.schedule).toHaveBeenCalledWith(
      "maintenance",
      "*/5 * * * *",
      { task: "detect_stuck_jobs" },
      { singletonKey: "maintenance:backlog" },
    );
  });

  it("cleans up expired rate limits", async () => {
    const pruned = await handler.cleanupRateLimits();
    expect(pruned).toBe(12);
    expect(rateLimiter.pruneExpired).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Expired rate limits cleaned up",
      expect.objectContaining({ deletedCount: 12 }),
    );
  });

  it("cleans up expired sessions", async () => {
    const deleted = await handler.cleanupSessions();
    expect(deleted).toBe(5);
    expect(sessionRepo.deleteExpired).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Expired sessions cleaned up",
      expect.objectContaining({ deletedCount: 5 }),
    );
  });

  it("executes hourly metrics rollup idempotently", async () => {
    const affected = await handler.rollupHourlyMetrics();
    expect(affected).toBe(42);
    expect(logger.info).toHaveBeenCalledWith(
      "Hourly metrics rollup completed",
      expect.objectContaining({ affectedRows: 42 }),
    );
  });

  it("maintains monthly partitions and retention purge", async () => {
    const result = await handler.maintainPartitions();
    expect(result.created).toEqual(["check_results_y2026m11", "check_results_y2026m12"]);
    expect(result.dropped).toEqual(["check_results_y2026m01"]);
    expect(logger.info).toHaveBeenCalledWith(
      "Partition maintenance completed",
      expect.objectContaining({
        created: expect.any(Array),
        dropped: expect.any(Array),
      }),
    );
  });

  it("detects and logs warning when stuck jobs or large backlog exist", async () => {
    vi.spyOn(pool, "query")
      .mockResolvedValueOnce({ rows: [{ count: "3" }] } as never) // 3 stuck jobs
      .mockResolvedValueOnce({ rows: [{ count: "650" }] } as never); // 650 backlog

    const result = await handler.detectStuckJobs();

    expect(result.stuckCount).toBe(3);
    expect(result.backlogCount).toBe(650);
    expect(logger.warn).toHaveBeenCalledWith(
      "Job backlog or stuck jobs detected in pg-boss queue",
      expect.objectContaining({ stuckCount: 3, backlogCount: 650 }),
    );
  });
});
