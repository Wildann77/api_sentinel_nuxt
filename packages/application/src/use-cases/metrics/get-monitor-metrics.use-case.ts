import type { MonitorMetricsDto } from "@sentinel/contracts";
import { EntityNotFoundException, UUIDv7, ValidationException } from "@sentinel/domain";
import type {
  GetMonitorMetricsFilter,
  GetMonitorMetricsUseCase,
} from "../../ports/in/metrics.use-cases.js";
import type { MetricsRepositoryPort } from "../../ports/out/metrics-repository.port.js";
import type { MonitorRepositoryPort } from "../../ports/out/monitor-repository.port.js";

export class GetMonitorMetricsUseCaseImpl implements GetMonitorMetricsUseCase {
  constructor(
    private readonly metricsRepository: MetricsRepositoryPort,
    private readonly monitorRepository: MonitorRepositoryPort,
  ) {}

  public async execute(filter: GetMonitorMetricsFilter): Promise<MonitorMetricsDto> {
    if (!filter.monitorId || !UUIDv7.isValid(filter.monitorId)) {
      throw new ValidationException("ID monitor tidak valid", [
        { name: "monitorId", reason: "Format UUID monitor tidak valid." },
      ]);
    }

    if (!["24h", "7d", "30d"].includes(filter.range)) {
      throw new ValidationException("Rentang metrik tidak valid", [
        { name: "range", reason: "Rentang waktu harus salah satu dari: 24h, 7d, 30d." },
      ]);
    }

    const monitor = await this.monitorRepository.findById(filter.monitorId);
    if (!monitor) {
      throw new EntityNotFoundException(`Monitor dengan ID '${filter.monitorId}' tidak ditemukan.`);
    }

    return this.metricsRepository.getMonitorMetrics(filter.monitorId, filter.range);
  }
}
