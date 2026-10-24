import { type FailureCategory, Incident, UUIDv7 } from "@sentinel/domain";
import type { IncidentInsert, IncidentSelect } from "../../db/schema/index.js";

export const IncidentMapper = {
  toDomain(row: IncidentSelect): Incident {
    return new Incident({
      id: UUIDv7.fromString(row.id),
      monitorId: UUIDv7.fromString(row.monitorId),
      startedAt: row.startedAt,
      recoveredAt: row.recoveredAt,
      durationSeconds: row.durationSeconds,
      causeCategory: row.causeCategory as FailureCategory,
      initialErrorMessage: row.initialErrorMessage,
      failureCount: row.failureCount,
      isResolved: row.isResolved,
    });
  },

  toInsert(incident: Incident): IncidentInsert {
    return {
      id: incident.id.toString(),
      monitorId: incident.monitorId.toString(),
      startedAt: incident.startedAt,
      recoveredAt: incident.recoveredAt,
      durationSeconds: incident.durationSeconds,
      causeCategory: incident.causeCategory,
      initialErrorMessage: incident.initialErrorMessage,
      failureCount: incident.failureCount,
      isResolved: incident.isResolved,
      updatedAt: new Date(),
    };
  },
};
