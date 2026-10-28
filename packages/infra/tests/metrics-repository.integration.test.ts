import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DrizzleDatabase } from "../src/db/connection.js";
import { closePgPool, createDrizzleDb, createPgPool } from "../src/db/connection.js";
import { checkResults, monitorMetricsHourly, monitors } from "../src/db/schema/index.js";
import { DrizzleMetricsRepository } from "../src/repositories/drizzle-metrics-repository.js";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel_dev";

describe("P17.3 — DrizzleMetricsRepository & Hourly Rollup Integration Test", () => {
  let pool: ReturnType<typeof createPgPool>;
  let db: DrizzleDatabase;
  let metricsRepo: DrizzleMetricsRepository;

  const monitorId = "018d0000-0000-7000-8000-000000000999";

  beforeAll(() => {
    pool = createPgPool({
      connectionString: TEST_DB_URL,
      applicationName: "metrics_repo_test",
      max: 5,
    });
    db = createDrizzleDb(pool);
    metricsRepo = new DrizzleMetricsRepository(db);
  });

  afterAll(async () => {
    await closePgPool(pool);
  });

  beforeEach(async () => {
    await db.delete(monitorMetricsHourly);
    await db.delete(checkResults);
    await db.delete(monitors);

    // Insert dummy monitor
    await db.insert(monitors).values({
      id: monitorId,
      name: "Metrics Test API",
      url: "https://metrics.example.com",
      method: "GET",
      intervalSeconds: 60,
      timeoutMs: 5000,
      healthStatus: "UP",
      isActive: true,
      nextRunAt: new Date(),
    });
  });

  it("calculates metrics summary, monitor metrics across ranges, composite latency, and sparklines", async () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600000);

    // Insert check results for current day and past hours
    await db.insert(checkResults).values([
      {
        id: "018d0000-0000-7000-8000-000000000001",
        monitorId,
        triggerType: "SCHEDULED",
        startedAt: now,
        finishedAt: now,
        durationMs: 120,
        isSuccess: true,
        statusCode: 200,
        executedAt: now,
      },
      {
        id: "018d0000-0000-7000-8000-000000000002",
        monitorId,
        triggerType: "SCHEDULED",
        startedAt: now,
        finishedAt: now,
        durationMs: 350,
        isSuccess: false,
        statusCode: 500,
        executedAt: now,
      },
      {
        id: "018d0000-0000-7000-8000-000000000003",
        monitorId,
        triggerType: "SCHEDULED",
        startedAt: twoHoursAgo,
        finishedAt: twoHoursAgo,
        durationMs: 80,
        isSuccess: true,
        statusCode: 200,
        executedAt: twoHoursAgo,
      },
    ]);

    // Test upsertHourlyRollup
    const rollupResult = await metricsRepo.upsertHourlyRollup({
      targetHour: twoHoursAgo,
      monitorId,
    });
    expect(rollupResult.affectedRows).toBeGreaterThanOrEqual(0);

    // Test getSummary
    const summary = await metricsRepo.getSummary();
    expect(summary).toBeDefined();
    expect(summary.totalMonitors).toBeGreaterThanOrEqual(1);

    // Test getMonitorMetrics for 24h, 1h, 7d, 30d ranges
    const metrics24h = await metricsRepo.getMonitorMetrics(monitorId, "24h");
    expect(metrics24h).toBeDefined();
    expect(metrics24h.monitorId).toBe(monitorId);

    const metrics1h = await metricsRepo.getMonitorMetrics(monitorId, "1h");
    expect(metrics1h).toBeDefined();

    const metrics7d = await metricsRepo.getMonitorMetrics(monitorId, "7d");
    expect(metrics7d).toBeDefined();

    const metrics30d = await metricsRepo.getMonitorMetrics(monitorId, "30d");
    expect(metrics30d).toBeDefined();

    // Test getCompositeLatency
    const composite24h = await metricsRepo.getCompositeLatency("24h");
    expect(composite24h).toBeDefined();
    expect(composite24h.range).toBe("24h");
    expect(Array.isArray(composite24h.points)).toBe(true);

    const composite7d = await metricsRepo.getCompositeLatency("7d");
    expect(composite7d).toBeDefined();

    // Test getSparkline
    const sparkline = await metricsRepo.getSparkline(monitorId, 10);
    expect(Array.isArray(sparkline)).toBe(true);
    expect(sparkline.length).toBeGreaterThanOrEqual(1);
  });
});
