import type { IncidentFilterOptions, IncidentRepositoryPort } from "@sentinel/application";
import type { Incident, UUIDv7 } from "@sentinel/domain";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { DrizzleDatabase } from "../db/connection.js";
import { incidents } from "../db/schema/index.js";
import { IncidentMapper } from "./mappers/incident.mapper.js";

export class DrizzleIncidentRepository implements IncidentRepositoryPort {
  constructor(private readonly db: DrizzleDatabase) {}

  private getDb(tx?: unknown): DrizzleDatabase {
    return (tx as DrizzleDatabase) ?? this.db;
  }

  public async findById(id: UUIDv7 | string): Promise<Incident | null> {
    const [row] = await this.db
      .select()
      .from(incidents)
      .where(eq(incidents.id, id.toString()))
      .limit(1);

    return row ? IncidentMapper.toDomain(row) : null;
  }

  public async findOpenByMonitorId(monitorId: UUIDv7 | string): Promise<Incident | null> {
    const [row] = await this.db
      .select()
      .from(incidents)
      .where(and(eq(incidents.monitorId, monitorId.toString()), eq(incidents.isResolved, false)))
      .limit(1);

    return row ? IncidentMapper.toDomain(row) : null;
  }

  public async findAll(filter?: IncidentFilterOptions): Promise<Incident[]> {
    const conditions = [];

    if (filter?.monitorId) {
      conditions.push(eq(incidents.monitorId, filter.monitorId.toString()));
    }

    if (filter?.isOpen !== undefined) {
      conditions.push(eq(incidents.isResolved, !filter.isOpen));
    }

    if (filter?.cursor) {
      const [cursorRow] = await this.db
        .select({ startedAt: incidents.startedAt, id: incidents.id })
        .from(incidents)
        .where(eq(incidents.id, filter.cursor))
        .limit(1);

      if (cursorRow) {
        const cursorCond = or(
          lt(incidents.startedAt, cursorRow.startedAt),
          and(eq(incidents.startedAt, cursorRow.startedAt), lt(incidents.id, cursorRow.id)),
        );
        if (cursorCond) {
          conditions.push(cursorCond);
        }
      }
    }

    const limit = Math.min(Math.max(1, filter?.limit ?? 50), 100);

    const rows = await this.db
      .select()
      .from(incidents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(incidents.startedAt), desc(incidents.id))
      .limit(limit);

    return rows.map((r) => IncidentMapper.toDomain(r));
  }

  public async save(incident: Incident, tx?: unknown): Promise<void> {
    const targetDb = this.getDb(tx);
    await targetDb.insert(incidents).values(IncidentMapper.toInsert(incident));
  }

  public async update(incident: Incident, tx?: unknown): Promise<void> {
    const targetDb = this.getDb(tx);
    await targetDb
      .update(incidents)
      .set({
        recoveredAt: incident.recoveredAt,
        durationSeconds: incident.durationSeconds,
        failureCount: incident.failureCount,
        isResolved: incident.isResolved,
        updatedAt: new Date(),
      })
      .where(eq(incidents.id, incident.id.toString()));
  }
}
