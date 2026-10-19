import type { CheckResult, UUIDv7 } from "@sentinel/domain";
import type {
  CheckResultRepositoryPort,
  CheckStreamFilter,
} from "../ports/out/check-result-repository.port.js";

export class InMemoryCheckResultRepository implements CheckResultRepositoryPort {
  private checks = new Map<string, CheckResult>();

  public async save(checkResult: CheckResult, _tx?: unknown): Promise<void> {
    this.checks.set(checkResult.id.toString(), checkResult);
  }

  public async findById(id: UUIDv7 | string): Promise<CheckResult | null> {
    return this.checks.get(id.toString()) ?? null;
  }

  public async findByMonitorId(
    monitorId: UUIDv7 | string,
    limit: number,
    cursor?: string,
    from?: Date,
    to?: Date,
  ): Promise<CheckResult[]> {
    const key = monitorId.toString();
    let results = Array.from(this.checks.values()).filter(
      (check) => check.monitorId.toString() === key,
    );

    if (from) {
      const fromTime = from.getTime();
      results = results.filter((c) => c.startedAt.getTime() >= fromTime);
    }
    if (to) {
      const toTime = to.getTime();
      results = results.filter((c) => c.startedAt.getTime() <= toTime);
    }

    results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    if (cursor) {
      const cursorIndex = results.findIndex((check) => check.id.toString() === cursor);
      if (cursorIndex >= 0) {
        results = results.slice(cursorIndex + 1);
      }
    }

    if (limit > 0) {
      results = results.slice(0, limit);
    }

    return results;
  }

  public async findRecent(limit: number): Promise<CheckResult[]> {
    const results = Array.from(this.checks.values());
    results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return results.slice(0, Math.max(0, limit));
  }

  public async findSparkline(
    monitorId: UUIDv7 | string,
    points = 20,
  ): Promise<Array<{ id: string; executedAt: Date; durationMs: number; isSuccess: boolean }>> {
    const key = monitorId.toString();
    const results = Array.from(this.checks.values())
      .filter((check) => check.monitorId.toString() === key)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, points);

    return results.map((r) => ({
      id: r.id.toString(),
      executedAt: r.startedAt,
      durationMs: r.durationMs ?? 0,
      isSuccess: r.isSuccess,
    }));
  }

  public async *streamChecks(filter: CheckStreamFilter): AsyncIterable<CheckResult> {
    const fromTime = filter.from.getTime();
    const toTime = filter.to.getTime();
    const monitorIdStr = filter.monitorId ? filter.monitorId.toString() : null;

    const filtered = Array.from(this.checks.values()).filter((c) => {
      const checkTime = c.startedAt.getTime();
      const timeMatches = checkTime >= fromTime && checkTime <= toTime;
      if (!timeMatches) return false;
      if (monitorIdStr && c.monitorId.toString() !== monitorIdStr) return false;
      return true;
    });

    filtered.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

    for (const check of filtered) {
      yield check;
    }
  }

  public async findByIncidentId(incidentId: UUIDv7 | string, limit = 50): Promise<CheckResult[]> {
    const key = incidentId.toString();
    const results = Array.from(this.checks.values()).filter(
      (c) => c.incidentId?.toString() === key,
    );
    results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return results.slice(0, Math.max(0, limit));
  }

  public clear(): void {
    this.checks.clear();
  }
}
