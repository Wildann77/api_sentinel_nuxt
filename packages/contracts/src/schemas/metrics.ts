import { z } from "zod";
import { UuidSchema } from "./common.js";

export const MetricsRangeSchema = z.enum(["24h", "7d", "30d"]);
export type MetricsRange = z.infer<typeof MetricsRangeSchema>;

export const MetricsSummarySchema = z.object({
  totalMonitors: z.number().int(),
  upCount: z.number().int(),
  degradedCount: z.number().int(),
  downCount: z.number().int(),
  pausedCount: z.number().int(),
  openIncidentsCount: z.number().int(),
  averageUptimePercentage: z.number().nullable(),
  averageLatencyMs: z.number().nullable(),
});

export const MonitorMetricBucketSchema = z.object({
  bucketStart: z.string(),
  totalChecks: z.number().int(),
  successfulChecks: z.number().int(),
  failedChecks: z.number().int(),
  uptimePercentage: z.number().nullable(),
  avgLatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
});

export const MonitorMetricsSchema = z.object({
  monitorId: UuidSchema,
  range: MetricsRangeSchema,
  overallUptimePercentage: z.number().nullable(),
  overallAvgLatencyMs: z.number().nullable(),
  buckets: z.array(MonitorMetricBucketSchema),
});

export const CompositeLatencyPointSchema = z.object({
  timestamp: z.string(),
  avgLatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  minLatencyMs: z.number().nullable(),
  maxLatencyMs: z.number().nullable(),
});

export const CompositeLatencyMetricsSchema = z.object({
  range: MetricsRangeSchema,
  points: z.array(CompositeLatencyPointSchema),
});
