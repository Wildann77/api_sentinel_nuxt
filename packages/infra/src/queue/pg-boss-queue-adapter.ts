import type { QueuePort, QueueSendOptions } from "@sentinel/application";
import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss, type SendOptions } from "pg-boss";

export class PgBossQueueAdapter implements QueuePort {
  constructor(private readonly boss: PgBoss) {}

  public async send<T extends object>(
    queueName: string,
    payload: T,
    options?: QueueSendOptions,
  ): Promise<string | null> {
    const sendOptions: SendOptions = {};

    if (options?.db) {
      // D-01: Wrap Drizzle transaction with fromDrizzle(tx, sql)
      const hasExecuteSql =
        typeof options.db === "object" && options.db !== null && "executeSql" in options.db;

      sendOptions.db = hasExecuteSql
        ? (options.db as SendOptions["db"])
        : fromDrizzle(options.db as Parameters<typeof fromDrizzle>[0], sql);
    }

    if (options?.startAfter) {
      sendOptions.startAfter = options.startAfter;
    }

    if (options?.singletonKey) {
      sendOptions.singletonKey = options.singletonKey;
    }

    if (options?.retryLimit !== undefined) {
      sendOptions.retryLimit = options.retryLimit;
    }

    if (options?.retryDelay !== undefined) {
      sendOptions.retryDelay = options.retryDelay;
    }

    if (options?.expireInSeconds !== undefined) {
      sendOptions.expireInSeconds = options.expireInSeconds;
    }

    // D-02: Returns string (jobId) or null if rejected by policy
    const jobId = await this.boss.send(queueName, payload, sendOptions);
    return jobId ?? null;
  }

  public async cancel(queueName: string, singletonKeyOrJobId: string): Promise<void> {
    try {
      const jobs = await this.boss.findJobs(queueName, {
        key: singletonKeyOrJobId,
        queued: true,
      });
      if (jobs.length > 0) {
        const jobIds = jobs.map((job) => job.id);
        await this.boss.cancel(queueName, jobIds);
        return;
      }
    } catch {
      // Fallback to direct cancellation
    }

    try {
      await this.boss.cancel(queueName, singletonKeyOrJobId);
    } catch {
      // Ignore if job does not exist or already completed
    }
  }
}

export interface PgBossConfig {
  readonly connectionString?: string;
  readonly schema?: string;
  readonly max?: number;
  readonly applicationName?: string;
}

export function createPgBoss(config: PgBossConfig = {}): PgBoss {
  const connectionString =
    config.connectionString ??
    process.env.DATABASE_URL ??
    "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel";

  return new PgBoss({
    connectionString,
    schema: config.schema ?? "pgboss",
    max: config.max ?? 5,
    application_name: config.applicationName ?? "api_sentinel_boss",
  });
}

export type { Job, JobWithMetadata } from "pg-boss";
export { PgBoss };
