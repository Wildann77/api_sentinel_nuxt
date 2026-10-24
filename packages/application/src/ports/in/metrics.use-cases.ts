import type {
  CompositeLatencyMetricsDto,
  MetricsRange,
  MetricsSummaryDto,
  MonitorMetricsDto,
} from "@sentinel/contracts";

export interface GetMetricsSummaryUseCase {
  execute(): Promise<MetricsSummaryDto>;
}

export interface GetMonitorMetricsFilter {
  readonly monitorId: string;
  readonly range: MetricsRange;
}

export interface GetMonitorMetricsUseCase {
  execute(filter: GetMonitorMetricsFilter): Promise<MonitorMetricsDto>;
}

export interface GetCompositeLatencyFilter {
  readonly range: MetricsRange;
}

export interface GetCompositeLatencyMetricsUseCase {
  execute(filter: GetCompositeLatencyFilter): Promise<CompositeLatencyMetricsDto>;
}
