import type { MonitorResponseDto } from "@sentinel/contracts";
import { EntityNotFoundException } from "@sentinel/domain";
import { toMonitorResponseDto } from "../../mappers/monitor.mapper.js";
import type { PauseMonitorCommand, PauseMonitorUseCase } from "../../ports/in/monitor.use-cases.js";
import type { MonitorRepositoryPort, QueuePort } from "../../ports/out/index.js";

export class PauseMonitor implements PauseMonitorUseCase {
  constructor(
    private readonly monitorRepo: MonitorRepositoryPort,
    private readonly queuePort: QueuePort,
  ) {}

  public async execute(command: PauseMonitorCommand | string): Promise<MonitorResponseDto> {
    const id = typeof command === "string" ? command : command.id;
    const monitor = await this.monitorRepo.findById(id);
    if (!monitor) {
      throw new EntityNotFoundException(`Monitor dengan ID "${id}" tidak ditemukan.`);
    }

    monitor.pause();
    await this.monitorRepo.update(monitor);
    await this.queuePort.cancel("probe:check", monitor.id.toString());

    return toMonitorResponseDto(monitor);
  }
}
