import type { HealthStatus, Monitor, UUIDv7 } from "@sentinel/domain";

export interface MonitorFilterOptions {
  readonly status?: HealthStatus | "ALL";
  readonly search?: string;
  readonly isActive?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface PaginatedMonitors {
  readonly items: Monitor[];
  readonly nextCursor?: string;
  readonly totalCount?: number;
}

export interface MonitorRepositoryPort {
  findById(id: UUIDv7 | string): Promise<Monitor | null>;
  findAll(): Promise<Monitor[]>;
  findAllActive(): Promise<Monitor[]>;
  findDueMonitors(now: Date, limit: number): Promise<Monitor[]>;
  claimDue(limit: number, tx?: unknown): Promise<Monitor[]>;
  lockForUpdate(id: UUIDv7 | string, tx: unknown): Promise<Monitor | null>;
  findWithFilter(options: MonitorFilterOptions): Promise<PaginatedMonitors>;
  save(monitor: Monitor, tx?: unknown): Promise<void>;
  update(monitor: Monitor, tx?: unknown): Promise<void>;
  delete(id: UUIDv7 | string, tx?: unknown): Promise<boolean>;
}
