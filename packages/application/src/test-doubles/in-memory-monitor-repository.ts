import type { Monitor, UUIDv7 } from "@sentinel/domain";
import type { MonitorRepositoryPort } from "../ports/out/monitor-repository.port.js";

export class InMemoryMonitorRepository implements MonitorRepositoryPort {
  private monitors = new Map<string, Monitor>();

  public async findById(id: UUIDv7 | string): Promise<Monitor | null> {
    const key = id.toString();
    const monitor = this.monitors.get(key);
    return monitor ?? null;
  }

  public async findAll(): Promise<Monitor[]> {
    return Array.from(this.monitors.values());
  }

  public async findAllActive(): Promise<Monitor[]> {
    return Array.from(this.monitors.values()).filter((m) => m.isActive);
  }

  public async findDueMonitors(now: Date, limit: number): Promise<Monitor[]> {
    const nowTime = now.getTime();
    return Array.from(this.monitors.values())
      .filter((m) => m.isActive && m.nextRunAt.getTime() <= nowTime)
      .slice(0, limit);
  }

  public async claimDue(limit: number, _tx?: unknown): Promise<Monitor[]> {
    const now = new Date();
    return this.findDueMonitors(now, limit);
  }

  public async lockForUpdate(id: UUIDv7 | string, _tx: unknown): Promise<Monitor | null> {
    return this.findById(id);
  }

  public async findWithFilter(options: {
    status?: string;
    search?: string;
    isActive?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: Monitor[]; nextCursor?: string; totalCount: number }> {
    let monitors = Array.from(this.monitors.values());

    if (options.status && options.status !== "ALL") {
      monitors = monitors.filter((m) => m.healthStatus === options.status);
    }

    if (options.isActive !== undefined) {
      monitors = monitors.filter((m) => m.isActive === options.isActive);
    }

    if (options.search) {
      const q = options.search.toLowerCase();
      monitors = monitors.filter((m) => m.name.toLowerCase().includes(q));
    }

    const totalCount = monitors.length;
    const limit = options.limit ?? 50;

    if (options.cursor) {
      const idx = monitors.findIndex((m) => m.id.toString() === options.cursor);
      if (idx >= 0) {
        monitors = monitors.slice(idx + 1);
      }
    }

    const items = monitors.slice(0, limit);
    const nextCursor = items.length === limit ? items[items.length - 1]?.id.toString() : undefined;

    return { items, nextCursor, totalCount };
  }

  public async save(monitor: Monitor, _tx?: unknown): Promise<void> {
    this.monitors.set(monitor.id.toString(), monitor);
  }

  public async update(monitor: Monitor, _tx?: unknown): Promise<void> {
    this.monitors.set(monitor.id.toString(), monitor);
  }

  public async updateNextRun(id: UUIDv7 | string, nextRunAt: Date, _tx?: unknown): Promise<void> {
    const monitor = this.monitors.get(id.toString());
    if (monitor) {
      monitor.nextRunAt = nextRunAt;
    }
  }

  public async delete(id: UUIDv7 | string, _tx?: unknown): Promise<boolean> {
    return this.monitors.delete(id.toString());
  }

  public clear(): void {
    this.monitors.clear();
  }
}
