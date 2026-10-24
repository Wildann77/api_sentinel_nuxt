import type { z } from "zod";
import type {
  CompositeLatencyMetricsSchema,
  CompositeLatencyPointSchema,
  MetricsSummarySchema,
  MonitorMetricBucketSchema,
  MonitorMetricsSchema,
} from "../schemas/metrics.js";

export type MetricsSummaryDto = z.infer<typeof MetricsSummarySchema>;
export type MonitorMetricBucketDto = z.infer<typeof MonitorMetricBucketSchema>;
export type MonitorMetricsDto = z.infer<typeof MonitorMetricsSchema>;
export type CompositeLatencyPointDto = z.infer<typeof CompositeLatencyPointSchema>;
export type CompositeLatencyMetricsDto = z.infer<typeof CompositeLatencyMetricsSchema>;
