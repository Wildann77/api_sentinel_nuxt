import type { CompositeLatencyMetricsDto } from "@sentinel/contracts";
import { ValidationException } from "@sentinel/domain";
import type {
  GetCompositeLatencyFilter,
  GetCompositeLatencyMetricsUseCase,
} from "../../ports/in/metrics.use-cases.js";
import type { MetricsRepositoryPort } from "../../ports/out/metrics-repository.port.js";

export class GetCompositeLatencyMetricsUseCaseImpl implements GetCompositeLatencyMetricsUseCase {
  constructor(private readonly metricsRepository: MetricsRepositoryPort) {}

  public async execute(filter: GetCompositeLatencyFilter): Promise<CompositeLatencyMetricsDto> {
    if (!["24h", "7d", "30d"].includes(filter.range)) {
      throw new ValidationException("Rentang metrik tidak valid", [
        { name: "range", reason: "Rentang waktu harus salah satu dari: 24h, 7d, 30d." },
      ]);
    }

    return this.metricsRepository.getCompositeLatency(filter.range);
  }
}
