import type { MonitorResponseDto } from "@sentinel/contracts";
import { EntityNotFoundException, ValidationException } from "@sentinel/domain";
import { toMonitorResponseDto } from "../../mappers/monitor.mapper.js";
import type { GetMonitorUseCase } from "../../ports/in/monitor.use-cases.js";
import type { MonitorRepositoryPort } from "../../ports/out/index.js";

export class GetMonitor implements GetMonitorUseCase {
  constructor(private readonly monitorRepo: MonitorRepositoryPort) {}

  public async execute(id: string): Promise<MonitorResponseDto> {
    if (!id || typeof id !== "string") {
      throw new ValidationException("ID monitor wajib disertakan.", [
        { name: "id", reason: "Identitas monitor wajib diisi." },
      ]);
    }

    const monitor = await this.monitorRepo.findById(id);
    if (!monitor) {
      throw new EntityNotFoundException(`Monitor dengan ID "${id}" tidak ditemukan.`);
    }

    return toMonitorResponseDto(monitor);
  }
}
