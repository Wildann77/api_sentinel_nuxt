import type {
  CompositeLatencyMetricsDto,
  MetricsRange,
  MetricsSummaryDto,
  MonitorMetricsDto,
  SparklinePointDto,
} from "@sentinel/contracts";

export interface MetricsRepositoryPort {
  getSummary(): Promise<MetricsSummaryDto>;
  getMonitorMetrics(monitorId: string, range: MetricsRange): Promise<MonitorMetricsDto>;
  getCompositeLatency(range: MetricsRange): Promise<CompositeLatencyMetricsDto>;
  getSparkline(monitorId: string, points?: number): Promise<readonly SparklinePointDto[]>;
}
