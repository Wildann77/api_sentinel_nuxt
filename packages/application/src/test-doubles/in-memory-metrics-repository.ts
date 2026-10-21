import type {
  CompositeLatencyMetricsDto,
  MetricsRange,
  MetricsSummaryDto,
  MonitorMetricsDto,
  SparklinePointDto,
} from "@sentinel/contracts";
import type { MetricsRepositoryPort } from "../ports/out/metrics-repository.port.js";

export class InMemoryMetricsRepository implements MetricsRepositoryPort {
  public summary: MetricsSummaryDto = {
    totalMonitors: 0,
    upCount: 0,
    degradedCount: 0,
    downCount: 0,
    pausedCount: 0,
    openIncidentsCount: 0,
    averageUptimePercentage: null,
    averageLatencyMs: null,
  };

  public monitorMetrics = new Map<string, MonitorMetricsDto>();
  public compositeLatency: Record<MetricsRange, CompositeLatencyMetricsDto> = {
    "24h": { range: "24h", points: [] },
    "7d": { range: "7d", points: [] },
    "30d": { range: "30d", points: [] },
  };
  public sparklines = new Map<string, SparklinePointDto[]>();

  public async getSummary(): Promise<MetricsSummaryDto> {
    return { ...this.summary };
  }

  public async getMonitorMetrics(
    monitorId: string,
    range: MetricsRange,
  ): Promise<MonitorMetricsDto> {
    const key = `${monitorId}:${range}`;
    const found = this.monitorMetrics.get(key);
    if (found) {
      return { ...found };
    }

    return {
      monitorId,
      range,
      overallUptimePercentage: null,
      overallAvgLatencyMs: null,
      buckets: [],
    };
  }

  public async getCompositeLatency(range: MetricsRange): Promise<CompositeLatencyMetricsDto> {
    const data = this.compositeLatency[range];
    return { ...data };
  }

  public async getSparkline(monitorId: string, points = 20): Promise<readonly SparklinePointDto[]> {
    const list = this.sparklines.get(monitorId) ?? [];
    return list.slice(0, points);
  }

  public setSparkline(monitorId: string, points: SparklinePointDto[]): void {
    this.sparklines.set(monitorId, [...points]);
  }

  public clear(): void {
    this.summary = {
      totalMonitors: 0,
      upCount: 0,
      degradedCount: 0,
      downCount: 0,
      pausedCount: 0,
      openIncidentsCount: 0,
      averageUptimePercentage: null,
      averageLatencyMs: null,
    };
    this.monitorMetrics.clear();
    this.sparklines.clear();
  }
}
