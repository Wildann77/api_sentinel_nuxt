import type { MetricsRepositoryPort } from "@sentinel/application";
import type {
  CompositeLatencyMetricsDto,
  CompositeLatencyPointDto,
  MetricsRange,
  MetricsSummaryDto,
  MonitorMetricBucketDto,
  MonitorMetricsDto,
  SparklinePointDto,
} from "@sentinel/contracts";
import { sql } from "drizzle-orm";
import type { DrizzleDatabase } from "../db/connection.js";

export interface HourlyRollupOptions {
  readonly targetHour?: Date;
  readonly monitorId?: string;
}

function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

export async function upsertHourlyRollup(
  db: DrizzleDatabase,
  options: HourlyRollupOptions = {},
): Promise<{ affectedRows: number }> {
  const target = options.targetHour ?? new Date(Date.now() - 3600000);
  const startOfHour = new Date(target);
  startOfHour.setUTCMinutes(0, 0, 0);
  const endOfHour = new Date(startOfHour.getTime() + 3600000);

  const monitorFilter = options.monitorId ? sql`AND monitor_id = ${options.monitorId}` : sql``;

  const result = await db.execute(sql`
    INSERT INTO monitor_metrics_hourly (
      monitor_id,
      bucket,
      total_checks,
      success_checks,
      avg_latency_ms,
      p95_latency_ms,
      p99_latency_ms
    )
    SELECT 
      monitor_id,
      date_trunc('hour', executed_at) AS bucket,
      COUNT(*)::integer AS total_checks,
      COUNT(*) FILTER (WHERE is_success = true)::integer AS success_checks,
      COALESCE(ROUND(AVG(duration_ms) FILTER (WHERE is_success = true))::integer, 0) AS avg_latency_ms,
      COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE is_success = true)::integer, 0) AS p95_latency_ms,
      COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE is_success = true)::integer, 0) AS p99_latency_ms
    FROM check_results
    WHERE executed_at >= ${startOfHour}
      AND executed_at < ${endOfHour}
      AND trigger_type = 'SCHEDULED'
      ${monitorFilter}
    GROUP BY monitor_id, bucket
    ON CONFLICT (monitor_id, bucket) 
    DO UPDATE SET
      total_checks = EXCLUDED.total_checks,
      success_checks = EXCLUDED.success_checks,
      avg_latency_ms = EXCLUDED.avg_latency_ms,
      p95_latency_ms = EXCLUDED.p95_latency_ms,
      p99_latency_ms = EXCLUDED.p99_latency_ms;
  `);

  return { affectedRows: result.rowCount ?? 0 };
}

export class DrizzleMetricsRepository implements MetricsRepositoryPort {
  constructor(private readonly db: DrizzleDatabase) {}

  public async getSummary(): Promise<MetricsSummaryDto> {
    const monitorCountsQuery = sql<{
      total: number;
      up_count: number;
      degraded_count: number;
      down_count: number;
      paused_count: number;
    }>`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE health_status = 'UP')::int AS up_count,
        COUNT(*) FILTER (WHERE health_status = 'DEGRADED')::int AS degraded_count,
        COUNT(*) FILTER (WHERE health_status = 'DOWN')::int AS down_count,
        COUNT(*) FILTER (WHERE health_status = 'PAUSED' OR is_active = false)::int AS paused_count,
        COUNT(*) FILTER (WHERE health_status = 'UNKNOWN')::int AS unknown_count
      FROM monitors;
    `;

    const incidentCountsQuery = sql<{ open_incidents: number }>`
      SELECT COUNT(*)::int AS open_incidents FROM incidents WHERE is_resolved = false;
    `;

    const systemMetricsQuery = sql<{
      total_checks: number;
      success_checks: number;
      avg_latency: number | null;
    }>`
      SELECT 
        COUNT(*)::int AS total_checks,
        COUNT(*) FILTER (WHERE is_success = true)::int AS success_checks,
        ROUND(AVG(duration_ms) FILTER (WHERE is_success = true))::int AS avg_latency
      FROM check_results
      WHERE executed_at >= NOW() - INTERVAL '24 hours'
        AND trigger_type = 'SCHEDULED';
    `;

    const [monitorRes, incidentRes, metricsRes] = await Promise.all([
      this.db.execute(monitorCountsQuery),
      this.db.execute(incidentCountsQuery),
      this.db.execute(systemMetricsQuery),
    ]);

    const monitorRow = monitorRes.rows[0];
    const incidentRow = incidentRes.rows[0];
    const metricsRow = metricsRes.rows[0];

    const totalChecks = Number(metricsRow?.total_checks ?? 0);
    const successChecks = Number(metricsRow?.success_checks ?? 0);

    return {
      totalMonitors: Number(monitorRow?.total ?? 0),
      upCount: Number(monitorRow?.up_count ?? 0),
      degradedCount: Number(monitorRow?.degraded_count ?? 0),
      downCount: Number(monitorRow?.down_count ?? 0),
      pausedCount: Number(monitorRow?.paused_count ?? 0),
      unknownCount: Number(monitorRow?.unknown_count ?? 0),
      openIncidentsCount: Number(incidentRow?.open_incidents ?? 0),
      averageUptimePercentage:
        totalChecks > 0 ? Number(((successChecks / totalChecks) * 100).toFixed(2)) : null,
      averageLatencyMs:
        totalChecks > 0 && metricsRow?.avg_latency !== null
          ? Number(metricsRow?.avg_latency)
          : null,
    };
  }

  public async getMonitorMetrics(
    monitorId: string,
    range: MetricsRange,
  ): Promise<MonitorMetricsDto> {
    if (range === "24h") {
      const rowsQuery = sql<{
        bucket: Date | string;
        total_checks: number;
        success_checks: number;
        failed_checks: number;
        avg_latency_ms: number | null;
        p95_latency_ms: number | null;
        p99_latency_ms: number | null;
      }>`
        SELECT 
          date_bin('5 minutes', executed_at, TIMESTAMPTZ '2026-01-01 00:00:00Z') AS bucket,
          COUNT(*)::integer AS total_checks,
          COUNT(*) FILTER (WHERE is_success = true)::integer AS success_checks,
          COUNT(*) FILTER (WHERE is_success = false)::integer AS failed_checks,
          ROUND(AVG(duration_ms) FILTER (WHERE is_success = true))::integer AS avg_latency_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE is_success = true)::integer AS p95_latency_ms,
          percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE is_success = true)::integer AS p99_latency_ms
        FROM check_results
        WHERE monitor_id = ${monitorId}
          AND executed_at >= NOW() - INTERVAL '24 hours'
          AND trigger_type = 'SCHEDULED'
        GROUP BY bucket
        ORDER BY bucket ASC;
      `;

      const result = await this.db.execute(rowsQuery);

      let sumTotal = 0;
      let sumSuccess = 0;
      let sumWeightedLatency = 0;
      const buckets: MonitorMetricBucketDto[] = [];

      for (const row of result.rows) {
        const total = Number(row.total_checks);
        const success = Number(row.success_checks);
        const failed = Number(row.failed_checks);
        const avgLat = row.avg_latency_ms !== null ? Number(row.avg_latency_ms) : null;
        const p95Lat = row.p95_latency_ms !== null ? Number(row.p95_latency_ms) : null;
        const p99Lat = row.p99_latency_ms !== null ? Number(row.p99_latency_ms) : null;

        sumTotal += total;
        sumSuccess += success;
        if (avgLat !== null && success > 0) {
          sumWeightedLatency += avgLat * success;
        }

        buckets.push({
          bucketStart: toIsoTimestamp(row.bucket),
          totalChecks: total,
          successfulChecks: success,
          failedChecks: failed,
          uptimePercentage: total > 0 ? Number(((success / total) * 100).toFixed(2)) : null,
          avgLatencyMs: success > 0 ? avgLat : null,
          p95LatencyMs: success > 0 ? p95Lat : null,
          p99LatencyMs: success > 0 ? p99Lat : null,
        });
      }

      const overallUptimePercentage =
        sumTotal > 0 ? Number(((sumSuccess / sumTotal) * 100).toFixed(2)) : null;
      const overallAvgLatencyMs =
        sumSuccess > 0 ? Math.round(sumWeightedLatency / sumSuccess) : null;

      return {
        monitorId,
        range,
        overallUptimePercentage,
        overallAvgLatencyMs,
        buckets,
      };
    }

    const intervalSql = range === "7d" ? sql`INTERVAL '7 days'` : sql`INTERVAL '30 days'`;
    const rowsQuery = sql<{
      bucket: Date | string;
      total_checks: number;
      success_checks: number;
      avg_latency_ms: number;
      p95_latency_ms: number;
      p99_latency_ms: number;
    }>`
      SELECT 
        bucket,
        total_checks,
        success_checks,
        avg_latency_ms,
        p95_latency_ms,
        p99_latency_ms
      FROM monitor_metrics_hourly
      WHERE monitor_id = ${monitorId}
        AND bucket >= NOW() - ${intervalSql}
      ORDER BY bucket ASC;
    `;

    const result = await this.db.execute(rowsQuery);

    let sumTotal = 0;
    let sumSuccess = 0;
    let sumWeightedLatency = 0;
    const buckets: MonitorMetricBucketDto[] = [];

    for (const row of result.rows) {
      const total = Number(row.total_checks);
      const success = Number(row.success_checks);
      const failed = total - success;
      const avgLat = Number(row.avg_latency_ms);
      const p95Lat = Number(row.p95_latency_ms);
      const p99Lat = Number(row.p99_latency_ms);

      sumTotal += total;
      sumSuccess += success;
      if (success > 0) {
        sumWeightedLatency += avgLat * success;
      }

      buckets.push({
        bucketStart: toIsoTimestamp(row.bucket),
        totalChecks: total,
        successfulChecks: success,
        failedChecks: failed,
        uptimePercentage: total > 0 ? Number(((success / total) * 100).toFixed(2)) : null,
        avgLatencyMs: success > 0 ? avgLat : null,
        p95LatencyMs: success > 0 ? p95Lat : null,
        p99LatencyMs: success > 0 ? p99Lat : null,
      });
    }

    const overallUptimePercentage =
      sumTotal > 0 ? Number(((sumSuccess / sumTotal) * 100).toFixed(2)) : null;
    const overallAvgLatencyMs = sumSuccess > 0 ? Math.round(sumWeightedLatency / sumSuccess) : null;

    return {
      monitorId,
      range,
      overallUptimePercentage,
      overallAvgLatencyMs,
      buckets,
    };
  }

  public async getCompositeLatency(range: MetricsRange): Promise<CompositeLatencyMetricsDto> {
    if (range === "24h") {
      const rowsQuery = sql<{
        bucket: Date | string;
        avg_latency_ms: number | null;
        p95_latency_ms: number | null;
        min_latency_ms: number | null;
        max_latency_ms: number | null;
      }>`
        SELECT 
          date_bin('15 minutes', executed_at, TIMESTAMPTZ '2026-01-01 00:00:00Z') AS bucket,
          ROUND(AVG(duration_ms))::integer AS avg_latency_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::integer AS p95_latency_ms,
          MIN(duration_ms)::integer AS min_latency_ms,
          MAX(duration_ms)::integer AS max_latency_ms
        FROM check_results
        WHERE executed_at >= NOW() - INTERVAL '24 hours'
          AND trigger_type = 'SCHEDULED'
          AND is_success = true
        GROUP BY bucket
        ORDER BY bucket ASC;
      `;

      const result = await this.db.execute(rowsQuery);

      const points: CompositeLatencyPointDto[] = result.rows.map((r) => {
        return {
          timestamp: toIsoTimestamp(r.bucket),
          avgLatencyMs: r.avg_latency_ms !== null ? Number(r.avg_latency_ms) : null,
          p95LatencyMs: r.p95_latency_ms !== null ? Number(r.p95_latency_ms) : null,
          minLatencyMs: r.min_latency_ms !== null ? Number(r.min_latency_ms) : null,
          maxLatencyMs: r.max_latency_ms !== null ? Number(r.max_latency_ms) : null,
        };
      });

      return { range, points };
    }

    const intervalSql = range === "7d" ? sql`INTERVAL '7 days'` : sql`INTERVAL '30 days'`;
    const rowsQuery = sql<{
      bucket: Date | string;
      avg_latency_ms: number | null;
      p95_latency_ms: number | null;
      min_latency_ms: number | null;
      max_latency_ms: number | null;
    }>`
      SELECT 
        bucket,
        ROUND(SUM(avg_latency_ms * success_checks)::numeric / NULLIF(SUM(success_checks), 0))::integer AS avg_latency_ms,
        MAX(p95_latency_ms)::integer AS p95_latency_ms,
        MIN(avg_latency_ms)::integer AS min_latency_ms,
        MAX(p95_latency_ms)::integer AS max_latency_ms
      FROM monitor_metrics_hourly
      WHERE bucket >= NOW() - ${intervalSql}
        AND success_checks > 0
      GROUP BY bucket
      ORDER BY bucket ASC;
    `;

    const result = await this.db.execute(rowsQuery);

    const points: CompositeLatencyPointDto[] = result.rows.map((r) => {
      return {
        timestamp: toIsoTimestamp(r.bucket),
        avgLatencyMs: r.avg_latency_ms !== null ? Number(r.avg_latency_ms) : null,
        p95LatencyMs: r.p95_latency_ms !== null ? Number(r.p95_latency_ms) : null,
        minLatencyMs: r.min_latency_ms !== null ? Number(r.min_latency_ms) : null,
        maxLatencyMs: r.max_latency_ms !== null ? Number(r.max_latency_ms) : null,
      };
    });

    return { range, points };
  }

  public async getSparkline(monitorId: string, points = 20): Promise<readonly SparklinePointDto[]> {
    const safePoints = Math.min(Math.max(1, points), 100);

    const rowsQuery = sql<{
      duration_ms: number | null;
      executed_at: Date | string;
    }>`
      SELECT duration_ms, executed_at
      FROM check_results
      WHERE monitor_id = ${monitorId}
      ORDER BY executed_at DESC, id DESC
      LIMIT ${safePoints};
    `;

    const result = await this.db.execute(rowsQuery);

    return result.rows.reverse().map((r) => {
      return {
        durationMs: r.duration_ms !== null ? Number(r.duration_ms) : null,
        timestamp: toIsoTimestamp(r.executed_at),
      };
    });
  }

  public async upsertHourlyRollup(
    options: HourlyRollupOptions = {},
  ): Promise<{ affectedRows: number }> {
    return upsertHourlyRollup(this.db, options);
  }
}
