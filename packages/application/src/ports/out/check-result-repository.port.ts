import type { CheckResult, UUIDv7 } from "@sentinel/domain";

export interface CheckStreamFilter {
  readonly monitorId?: UUIDv7 | string;
  readonly from: Date;
  readonly to: Date;
}

export interface SparklinePoint {
  readonly id: string;
  readonly executedAt: Date;
  readonly durationMs: number;
  readonly isSuccess: boolean;
}

export interface CheckResultRepositoryPort {
  save(checkResult: CheckResult, tx?: unknown): Promise<void>;
  findById(id: UUIDv7 | string): Promise<CheckResult | null>;
  findByMonitorId(
    monitorId: UUIDv7 | string,
    limit: number,
    cursor?: string,
  ): Promise<CheckResult[]>;
  findRecent(limit: number): Promise<CheckResult[]>;
  findSparkline(monitorId: UUIDv7 | string, points?: number): Promise<SparklinePoint[]>;
  streamChecks(filter: CheckStreamFilter): AsyncIterable<CheckResult>;
}
