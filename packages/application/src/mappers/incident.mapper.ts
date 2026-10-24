import type { IncidentDto, NotificationDeliverySummaryDto } from "@sentinel/contracts";
import type { Incident } from "@sentinel/domain";

export interface IncidentMapperOptions {
  readonly monitorName?: string;
  readonly notificationDeliveries?: readonly NotificationDeliverySummaryDto[];
  readonly createdAt?: Date | string;
}

export function toIncidentDto(
  incident: Incident,
  options: IncidentMapperOptions = {},
): IncidentDto {
  const createdAtIso = options.createdAt
    ? new Date(options.createdAt).toISOString()
    : incident.startedAt.toISOString();

  return {
    id: incident.id.toString(),
    monitorId: incident.monitorId.toString(),
    monitorName: options.monitorName,
    openedAt: incident.startedAt.toISOString(),
    resolvedAt: incident.recoveredAt ? incident.recoveredAt.toISOString() : null,
    durationSeconds: incident.durationSeconds,
    failureCount: incident.failureCount,
    lastFailureCategory: incident.causeCategory,
    lastFailureReason: incident.initialErrorMessage,
    notificationDeliveries: options.notificationDeliveries
      ? [...options.notificationDeliveries]
      : [],
    createdAt: createdAtIso,
  };
}
