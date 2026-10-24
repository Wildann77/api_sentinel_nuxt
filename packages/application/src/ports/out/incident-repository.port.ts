import type { Incident, UUIDv7 } from "@sentinel/domain";

export interface IncidentFilterOptions {
  readonly monitorId?: UUIDv7 | string;
  readonly isOpen?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface IncidentRepositoryPort {
  findById(id: UUIDv7 | string): Promise<Incident | null>;
  findOpenByMonitorId(monitorId: UUIDv7 | string): Promise<Incident | null>;
  findAll(filter?: IncidentFilterOptions): Promise<Incident[]>;
  save(incident: Incident, tx?: unknown): Promise<void>;
  update(incident: Incident, tx?: unknown): Promise<void>;
}
