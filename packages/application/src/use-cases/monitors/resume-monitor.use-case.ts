import type { MonitorResponseDto } from "@sentinel/contracts";
import { EntityNotFoundException } from "@sentinel/domain";
import { toMonitorResponseDto } from "../../mappers/monitor.mapper.js";
import type {
  ResumeMonitorCommand,
  ResumeMonitorUseCase,
} from "../../ports/in/monitor.use-cases.js";
import type { ClockPort, MonitorRepositoryPort } from "../../ports/out/index.js";

export class ResumeMonitor implements ResumeMonitorUseCase {
  constructor(
    private readonly monitorRepo: MonitorRepositoryPort,
    private readonly clock: ClockPort,
  ) {}

  public async execute(command: ResumeMonitorCommand | string): Promise<MonitorResponseDto> {
    const id = typeof command === "string" ? command : command.id;
    const monitor = await this.monitorRepo.findById(id);
    if (!monitor) {
      throw new EntityNotFoundException(`Monitor dengan ID "${id}" tidak ditemukan.`);
    }

    const now = this.clock.now();
    monitor.resume(now);
    await this.monitorRepo.update(monitor);

    return toMonitorResponseDto(monitor);
  }
}
