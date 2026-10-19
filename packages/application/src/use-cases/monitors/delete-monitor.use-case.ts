import { EntityNotFoundException } from "@sentinel/domain";
import type {
  DeleteMonitorCommand,
  DeleteMonitorUseCase,
} from "../../ports/in/monitor.use-cases.js";
import type { MonitorRepositoryPort, QueuePort } from "../../ports/out/index.js";

export class DeleteMonitor implements DeleteMonitorUseCase {
  constructor(
    private readonly monitorRepo: MonitorRepositoryPort,
    private readonly queuePort: QueuePort,
  ) {}

  public async execute(command: DeleteMonitorCommand | string): Promise<void> {
    const id = typeof command === "string" ? command : command.id;
    const monitor = await this.monitorRepo.findById(id);
    if (!monitor) {
      throw new EntityNotFoundException(`Monitor dengan ID "${id}" tidak ditemukan.`);
    }

    const monitorIdStr = monitor.id.toString();
    await this.queuePort.cancel("probe:check", monitorIdStr);
    await this.monitorRepo.delete(monitorIdStr);
  }
}
