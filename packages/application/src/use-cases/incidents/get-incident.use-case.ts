import type {
  CheckResultDto,
  IncidentDto,
  IncidentStatus,
  NotificationDeliverySummaryDto,
} from "@sentinel/contracts";
import { EntityNotFoundException, ValidationException } from "@sentinel/domain";
import { toCheckResultDto } from "../../mappers/check.mapper.js";
import { toIncidentDto } from "../../mappers/incident.mapper.js";
import type { GetIncidentQuery } from "../../ports/in/incident.use-cases.js";
import type {
  CheckResultRepositoryPort,
  IncidentRepositoryPort,
  MonitorRepositoryPort,
  NotificationDeliveryRepositoryPort,
} from "../../ports/out/index.js";

export class GetIncident implements GetIncidentQuery {
  constructor(
    private readonly incidentRepo: IncidentRepositoryPort,
    private readonly monitorRepo: MonitorRepositoryPort,
    private readonly notificationDeliveryRepo: NotificationDeliveryRepositoryPort,
    private readonly checkResultRepo: CheckResultRepositoryPort,
  ) {}

  public async execute(id: string): Promise<IncidentDto> {
    if (!id || typeof id !== "string") {
      throw new ValidationException("ID insiden wajib disertakan.", [
        { name: "id", reason: "Identitas insiden wajib diisi." },
      ]);
    }

    const incident = await this.incidentRepo.findById(id);
    if (!incident) {
      throw new EntityNotFoundException(`Insiden dengan ID "${id}" tidak ditemukan.`);
    }

    const monitor = await this.monitorRepo.findById(incident.monitorId);

    const [deliveries, checks] = await Promise.all([
      this.notificationDeliveryRepo.findByIncidentId(incident.id.toString()),
      this.checkResultRepo.findByIncidentId(incident.id.toString()),
    ]);

    const notificationDeliveries: NotificationDeliverySummaryDto[] = deliveries.map((d) => ({
      id: d.id,
      channel: d.channel,
      status: d.status,
      attemptCount: d.attemptCount,
      lastAttemptAt: d.lastAttemptAt ? d.lastAttemptAt.toISOString() : null,
      lastError: d.lastError,
    }));

    const checkDtos: CheckResultDto[] = checks.map((c) => toCheckResultDto(c));

    const status: IncidentStatus = incident.isResolved
      ? "RESOLVED"
      : monitor?.consecutiveSuccesses === 1
        ? "RECOVERING"
        : "OPEN";

    return toIncidentDto(incident, {
      monitorName: monitor?.name,
      status,
      notificationDeliveries,
      checks: checkDtos,
    });
  }
}
