import type { Incident, UUIDv7 } from "@sentinel/domain";
import type {
  IncidentFilterOptions,
  IncidentRepositoryPort,
  IncidentStreamFilter,
  PaginatedIncidents,
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

  public async findWithFilter(options: IncidentFilterOptions = {}): Promise<PaginatedIncidents> {
    const limit = Math.min(Math.max(1, options.limit ?? 50), 100);
    // Fetch limit + 1 to check if there is a next page
    const fetched = await this.findAll({
      ...options,
      limit: limit + 1,
    });

    const hasMore = fetched.length > limit;
    const items = hasMore ? fetched.slice(0, limit) : fetched;
    const nextCursor = hasMore ? items[items.length - 1]?.id.toString() : undefined;

    return {
      items,
      nextCursor,
    };
  }

  public async *streamIncidents(filter: IncidentStreamFilter): AsyncIterable<Incident> {
    const fromTime = filter.from.getTime();
    const toTime = filter.to.getTime();
    const monitorIdStr = filter.monitorId ? filter.monitorId.toString() : null;

    const filtered = Array.from(this.incidents.values()).filter((inc) => {
      const incTime = inc.startedAt.getTime();
      if (incTime < fromTime || incTime > toTime) return false;
      if (monitorIdStr && inc.monitorId.toString() !== monitorIdStr) return false;
      return true;
    });

    filtered.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

    for (const item of filtered) {
      yield item;
    }
  }

  public clear(): void {
    this.incidents.clear();
  }
}
