import type { MonitorResponseDto, SparklinePointDto } from "@sentinel/contracts";
import { toMonitorResponseDto } from "../../mappers/monitor.mapper.js";
import type {
  ListMonitorsFilter,
  ListMonitorsUseCase,
  PaginatedMonitorsResult,
} from "../../ports/in/monitor.use-cases.js";
import type { CheckResultRepositoryPort, MonitorRepositoryPort } from "../../ports/out/index.js";

export class ListMonitors implements ListMonitorsUseCase {
  constructor(
    private readonly monitorRepo: MonitorRepositoryPort,
    private readonly checkResultRepo: CheckResultRepositoryPort,
  ) {}

  public async execute(filter: ListMonitorsFilter = {}): Promise<PaginatedMonitorsResult> {
    const limit = Math.min(Math.max(1, filter.limit ?? 50), 100);

    const paginated = await this.monitorRepo.findWithFilter({
      status: filter.status,
      search: filter.search,
      isActive: filter.isActive,
      limit,
      cursor: filter.cursor,
    });

    const items: MonitorResponseDto[] = await Promise.all(
      paginated.items.map(async (monitor) => {
        const rawPoints = await this.checkResultRepo.findSparkline(monitor.id, 20);
        const sparkline: SparklinePointDto[] = rawPoints.map((p) => ({
          durationMs: p.durationMs,
          timestamp: p.executedAt.toISOString(),
        }));

        return toMonitorResponseDto(monitor, { sparkline });
      }),
    );

    return {
      items,
      limit,
      hasMore: Boolean(paginated.nextCursor),
      nextCursor: paginated.nextCursor,
    };
  }
}
