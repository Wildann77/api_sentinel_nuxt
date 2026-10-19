import type { MetricsSummaryDto } from "@sentinel/contracts";
import type { GetMetricsSummaryUseCase } from "../../ports/in/metrics.use-cases.js";
import type { MetricsRepositoryPort } from "../../ports/out/metrics-repository.port.js";

export class GetMetricsSummaryUseCaseImpl implements GetMetricsSummaryUseCase {
  constructor(private readonly metricsRepository: MetricsRepositoryPort) {}

  public async execute(): Promise<MetricsSummaryDto> {
    return this.metricsRepository.getSummary();
  }
}
