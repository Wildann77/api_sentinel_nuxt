import type {
  CheckResultRepositoryPort,
  CheckStreamFilter,
  SparklinePoint,
} from "@sentinel/application";
import type { CheckResult, UUIDv7 } from "@sentinel/domain";
import { and, asc, desc, eq, gt, gte, lt, lte, or } from "drizzle-orm";
import type { DrizzleDatabase } from "../db/connection.js";
import { checkResults } from "../db/schema/index.js";
import { CheckResultMapper } from "./mappers/check-result.mapper.js";

export class DrizzleCheckResultRepository implements CheckResultRepositoryPort {
  constructor(private readonly db: DrizzleDatabase) {}

  private getDb(tx?: unknown): DrizzleDatabase {
    return (tx as DrizzleDatabase) ?? this.db;
  }

  public async save(checkResult: CheckResult, tx?: unknown): Promise<void> {
    const targetDb = this.getDb(tx);
    await targetDb.insert(checkResults).values(CheckResultMapper.toInsert(checkResult));
  }

  public async findById(id: UUIDv7 | string): Promise<CheckResult | null> {
    const [row] = await this.db
      .select()
      .from(checkResults)
      .where(eq(checkResults.id, id.toString()))
      .limit(1);

    return row ? CheckResultMapper.toDomain(row) : null;
  }

  public async findByMonitorId(
    monitorId: UUIDv7 | string,
    limit: number,
    cursor?: string,
  ): Promise<CheckResult[]> {
    const conditions = [eq(checkResults.monitorId, monitorId.toString())];

    if (cursor) {
      const [cursorRow] = await this.db
        .select({ executedAt: checkResults.executedAt, id: checkResults.id })
        .from(checkResults)
        .where(eq(checkResults.id, cursor))
        .limit(1);

      if (cursorRow) {
        const cursorCond = or(
          lt(checkResults.executedAt, cursorRow.executedAt),
          and(eq(checkResults.executedAt, cursorRow.executedAt), lt(checkResults.id, cursorRow.id)),
        );
        if (cursorCond) {
          conditions.push(cursorCond);
        }
      }
    }

    const safeLimit = Math.min(Math.max(1, limit), 200);

    const rows = await this.db
      .select()
      .from(checkResults)
      .where(and(...conditions))
      .orderBy(desc(checkResults.executedAt), desc(checkResults.id))
      .limit(safeLimit);

    return rows.map((r) => CheckResultMapper.toDomain(r));
  }

  public async findRecent(limit: number): Promise<CheckResult[]> {
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const rows = await this.db
      .select()
      .from(checkResults)
      .orderBy(desc(checkResults.executedAt), desc(checkResults.id))
      .limit(safeLimit);

    return rows.map((r) => CheckResultMapper.toDomain(r));
  }

  public async findByIncidentId(incidentId: UUIDv7 | string, limit = 50): Promise<CheckResult[]> {
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const rows = await this.db
      .select()
      .from(checkResults)
      .where(eq(checkResults.incidentId, incidentId.toString()))
      .orderBy(desc(checkResults.executedAt), desc(checkResults.id))
      .limit(safeLimit);

    return rows.map((r) => CheckResultMapper.toDomain(r));
  }

  public async findSparkline(monitorId: UUIDv7 | string, points = 20): Promise<SparklinePoint[]> {
    const safePoints = Math.min(Math.max(1, points), 100);

    const rows = await this.db
      .select({
        id: checkResults.id,
        executedAt: checkResults.executedAt,
        durationMs: checkResults.durationMs,
        isSuccess: checkResults.isSuccess,
      })
      .from(checkResults)
      .where(eq(checkResults.monitorId, monitorId.toString()))
      .orderBy(desc(checkResults.executedAt), desc(checkResults.id))
      .limit(safePoints);

    // Reverse to chronological order (oldest to newest) for plotting
    return rows.reverse().map((r) => ({
      id: r.id,
      executedAt: r.executedAt,
      durationMs: r.durationMs,
      isSuccess: r.isSuccess,
    }));
  }

  public async *streamChecks(filter: CheckStreamFilter): AsyncIterable<CheckResult> {
    const batchSize = 500;
    let lastExecutedAt: Date | undefined;
    let lastId: string | undefined;

    while (true) {
      const conditions = [
        gte(checkResults.executedAt, filter.from),
        lte(checkResults.executedAt, filter.to),
      ];

      if (filter.monitorId) {
        conditions.push(eq(checkResults.monitorId, filter.monitorId.toString()));
      }

      if (lastExecutedAt && lastId) {
        const streamCursorCond = or(
          gt(checkResults.executedAt, lastExecutedAt),
          and(eq(checkResults.executedAt, lastExecutedAt), gt(checkResults.id, lastId)),
        );
        if (streamCursorCond) {
          conditions.push(streamCursorCond);
        }
      }

      const rows = await this.db
        .select()
        .from(checkResults)
        .where(and(...conditions))
        .orderBy(asc(checkResults.executedAt), asc(checkResults.id))
        .limit(batchSize);

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        yield CheckResultMapper.toDomain(row);
      }

      const lastRow = rows[rows.length - 1];
      if (lastRow) {
        lastExecutedAt = lastRow.executedAt;
        lastId = lastRow.id;
      }

      if (rows.length < batchSize) {
        break;
      }
    }
  }
}
