import type { Incident, UUIDv7 } from "@sentinel/domain";
import type {
  IncidentFilterOptions,
  IncidentRepositoryPort,
} from "../ports/out/incident-repository.port.js";

export class InMemoryIncidentRepository implements IncidentRepositoryPort {
  private incidents = new Map<string, Incident>();

  public async findById(id: UUIDv7 | string): Promise<Incident | null> {
    return this.incidents.get(id.toString()) ?? null;
  }

  public async findOpenByMonitorId(monitorId: UUIDv7 | string): Promise<Incident | null> {
    const key = monitorId.toString();
    for (const incident of this.incidents.values()) {
      if (incident.monitorId.toString() === key && !incident.isResolved) {
        return incident;
      }
    }
    return null;
  }

  public async findAll(filter?: IncidentFilterOptions): Promise<Incident[]> {
    let results = Array.from(this.incidents.values());

    if (filter?.monitorId) {
      const monitorIdStr = filter.monitorId.toString();
      results = results.filter((inc) => inc.monitorId.toString() === monitorIdStr);
    }

    if (filter?.isOpen !== undefined) {
      results = results.filter((inc) => (filter.isOpen ? !inc.isResolved : inc.isResolved));
    }

    results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    if (filter?.cursor) {
      const cursorIndex = results.findIndex((inc) => inc.id.toString() === filter.cursor);
      if (cursorIndex >= 0) {
        results = results.slice(cursorIndex + 1);
      }
    }

    if (filter?.limit && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  public async save(incident: Incident, _tx?: unknown): Promise<void> {
    this.incidents.set(incident.id.toString(), incident);
  }

  public async update(incident: Incident, _tx?: unknown): Promise<void> {
    this.incidents.set(incident.id.toString(), incident);
  }

  public clear(): void {
    this.incidents.clear();
  }
}
