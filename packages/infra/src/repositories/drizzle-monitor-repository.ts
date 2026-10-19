import type {
  MonitorFilterOptions,
  MonitorRepositoryPort,
  PaginatedMonitors,
} from "@sentinel/application";
import { ConflictException, type Monitor, type UUIDv7 } from "@sentinel/domain";
import { and, asc, desc, eq, ilike, lt, lte, or, sql } from "drizzle-orm";
import type { DrizzleDatabase } from "../db/connection.js";
import { monitors } from "../db/schema/index.js";
import { MonitorMapper } from "./mappers/monitor.mapper.js";

export class DrizzleMonitorRepository implements MonitorRepositoryPort {
  constructor(private readonly db: DrizzleDatabase) {}

  private getDb(tx?: unknown): DrizzleDatabase {
    return (tx as DrizzleDatabase) ?? this.db;
  }

  public async findById(id: UUIDv7 | string): Promise<Monitor | null> {
    const [row] = await this.db
      .select()
      .from(monitors)
      .where(eq(monitors.id, id.toString()))
      .limit(1);

    return row ? MonitorMapper.toDomain(row) : null;
  }

  public async findAll(): Promise<Monitor[]> {
    const rows = await this.db.select().from(monitors).orderBy(desc(monitors.createdAt));
    return rows.map((r) => MonitorMapper.toDomain(r));
  }

  public async findAllActive(): Promise<Monitor[]> {
    const rows = await this.db
      .select()
      .from(monitors)
      .where(eq(monitors.isActive, true))
      .orderBy(asc(monitors.nextRunAt));

    return rows.map((r) => MonitorMapper.toDomain(r));
  }

  public async findDueMonitors(now: Date, limit: number): Promise<Monitor[]> {
    const rows = await this.db
      .select()
      .from(monitors)
      .where(and(eq(monitors.isActive, true), lte(monitors.nextRunAt, now)))
      .orderBy(asc(monitors.nextRunAt))
      .limit(limit);

    return rows.map((r) => MonitorMapper.toDomain(r));
  }

  public async claimDue(limit: number, tx?: unknown): Promise<Monitor[]> {
    const targetDb = this.getDb(tx);
    const now = new Date();

    const rows = await targetDb
      .select()
      .from(monitors)
      .where(and(eq(monitors.isActive, true), lte(monitors.nextRunAt, now)))
      .orderBy(asc(monitors.nextRunAt))
      .limit(limit)
      .for("update", { skipLocked: true });

    return rows.map((r) => MonitorMapper.toDomain(r));
  }

  public async lockForUpdate(id: UUIDv7 | string, tx: unknown): Promise<Monitor | null> {
    const targetDb = this.getDb(tx);
    const [row] = await targetDb
      .select()
      .from(monitors)
      .where(eq(monitors.id, id.toString()))
      .for("update")
      .limit(1);

    return row ? MonitorMapper.toDomain(row) : null;
  }

  public async findWithFilter(options: MonitorFilterOptions): Promise<PaginatedMonitors> {
    const conditions = [];

    if (options.status && options.status !== "ALL") {
      conditions.push(eq(monitors.healthStatus, options.status));
    }

    if (options.isActive !== undefined) {
      conditions.push(eq(monitors.isActive, options.isActive));
    }

    if (options.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(or(ilike(monitors.name, term), ilike(monitors.url, term)));
    }

    if (options.cursor) {
      const [cursorRow] = await this.db
        .select({ createdAt: monitors.createdAt, id: monitors.id })
        .from(monitors)
        .where(eq(monitors.id, options.cursor))
        .limit(1);

      if (cursorRow) {
        const cursorCond = or(
          lt(monitors.createdAt, cursorRow.createdAt),
          and(eq(monitors.createdAt, cursorRow.createdAt), lt(monitors.id, cursorRow.id)),
        );
        if (cursorCond) {
          conditions.push(cursorCond);
        }
      }
    }

    const limit = Math.min(Math.max(1, options.limit ?? 50), 100);

    const rows = await this.db
      .select()
      .from(monitors)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(monitors.createdAt), desc(monitors.id))
      .limit(limit + 1);

    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext && items.length > 0 ? items[items.length - 1]?.id : undefined;

    return {
      items: items.map((r) => MonitorMapper.toDomain(r)),
      nextCursor,
    };
  }

  public async save(monitor: Monitor, tx?: unknown): Promise<void> {
    const targetDb = this.getDb(tx);
    await targetDb.insert(monitors).values(MonitorMapper.toInsert(monitor));
  }

  public async update(monitor: Monitor, tx?: unknown): Promise<void> {
    const targetDb = this.getDb(tx);
    const insertValues = MonitorMapper.toInsert(monitor);
    const id = monitor.id.toString();

    // OCC: check version in DB. Target version is monitor.version, or version + 1
    const targetVersion = monitor.version > 1 ? monitor.version : sql`${monitors.version} + 1`;

    const updated = await targetDb
      .update(monitors)
      .set({
        ...insertValues,
        version: targetVersion,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(monitors.id, id),
          or(eq(monitors.version, monitor.version), eq(monitors.version, monitor.version - 1)),
        ),
      )
      .returning({ id: monitors.id });

    if (updated.length === 0) {
      throw new ConflictException(
        `Monitor ${id} mengalami konflik konkurensi versi (OCC mismatch).`,
      );
    }
  }

  public async updateNextRun(id: UUIDv7 | string, nextRunAt: Date, tx?: unknown): Promise<void> {
    const targetDb = this.getDb(tx);
    await targetDb
      .update(monitors)
      .set({
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(monitors.id, id.toString()));
  }

  public async delete(id: UUIDv7 | string, tx?: unknown): Promise<boolean> {
    const targetDb = this.getDb(tx);
    const deleted = await targetDb
      .delete(monitors)
      .where(eq(monitors.id, id.toString()))
      .returning({ id: monitors.id });

    return deleted.length > 0;
  }
}
