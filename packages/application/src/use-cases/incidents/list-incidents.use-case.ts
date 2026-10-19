import type {
  CursorPageDto,
  IncidentDto,
  IncidentStatus,
  NotificationDeliverySummaryDto,
} from "@sentinel/contracts";
import type { Monitor } from "@sentinel/domain";
import { toIncidentDto } from "../../mappers/incident.mapper.js";
import type { ListIncidentsFilter, ListIncidentsQuery } from "../../ports/in/incident.use-cases.js";
import type {
  IncidentRepositoryPort,
  MonitorRepositoryPort,
  NotificationDeliveryRepositoryPort,
} from "../../ports/out/index.js";

export class ListIncidents implements ListIncidentsQuery {
  constructor(
    private readonly incidentRepo: IncidentRepositoryPort,
    private readonly monitorRepo: MonitorRepositoryPort,
    private readonly notificationDeliveryRepo: NotificationDeliveryRepositoryPort,
  ) {}

  public async execute(filter: ListIncidentsFilter = {}): Promise<CursorPageDto<IncidentDto>> {
    const limit = Math.min(Math.max(1, filter.limit ?? 50), 100);

    const paginated = await this.incidentRepo.findWithFilter({
      monitorId: filter.monitorId,
      isOpen: filter.isOpen,
      limit,
      cursor: filter.cursor,
    });

    const uniqueMonitorIds = [...new Set(paginated.items.map((i) => i.monitorId.toString()))];
    const monitorMap = new Map<string, Monitor>();

    await Promise.all(
      uniqueMonitorIds.map(async (mId) => {
        const mon = await this.monitorRepo.findById(mId);
        if (mon) {
          monitorMap.set(mId, mon);
        }
      }),
    );

    const data: IncidentDto[] = await Promise.all(
      paginated.items.map(async (incident) => {
        const deliveries = await this.notificationDeliveryRepo.findByIncidentId(
          incident.id.toString(),
        );

        const notificationDeliveries: NotificationDeliverySummaryDto[] = deliveries.map((d) => ({
          id: d.id,
          channel: d.channel,
          status: d.status,
          attemptCount: d.attemptCount,
          lastAttemptAt: d.lastAttemptAt ? d.lastAttemptAt.toISOString() : null,
          lastError: d.lastError,
        }));

        const monitor = monitorMap.get(incident.monitorId.toString());
        const status: IncidentStatus = incident.isResolved
          ? "RESOLVED"
          : monitor?.consecutiveSuccesses === 1
            ? "RECOVERING"
            : "OPEN";

        return toIncidentDto(incident, {
          monitorName: monitor?.name,
          status,
          notificationDeliveries,
        });
      }),
    );

    return {
      data,
      pagination: {
        limit,
        hasMore: Boolean(paginated.nextCursor),
        nextCursor: paginated.nextCursor ?? null,
      },
    };
  }
}
