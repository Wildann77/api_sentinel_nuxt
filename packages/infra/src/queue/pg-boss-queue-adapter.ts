import type { QueuePort, QueueSendOptions } from "@sentinel/application";
import { sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss, type SendOptions } from "pg-boss";

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
}
