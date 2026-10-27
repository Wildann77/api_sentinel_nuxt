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
    const sanitizedName = sanitizeQueueName(queueName);
    const jobId = await this.boss.send(sanitizedName, payload, sendOptions);
    return jobId ?? null;
  }

  public async cancel(queueName: string, singletonKeyOrJobId: string): Promise<void> {
    const sanitizedName = sanitizeQueueName(queueName);
    try {
      const jobs = await this.boss.findJobs(sanitizedName, {
        key: singletonKeyOrJobId,
        queued: true,
      });
      if (jobs.length > 0) {
        const jobIds = jobs.map((job) => job.id);
        await this.boss.cancel(sanitizedName, jobIds);
        return;
      }
    } catch {
      // Fallback to direct cancellation
    }

    try {
      await this.boss.cancel(sanitizedName, singletonKeyOrJobId);
    } catch {
      // Ignore if job does not exist or already completed
    }
  }
}

export function sanitizeQueueName(name: string): string {
  if (typeof name !== "string") return name;
  return name.replace(/:/g, "_");
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

  const boss = new PgBoss({
    connectionString,
    schema: config.schema ?? "pgboss",
    max: config.max ?? 5,
    application_name: config.applicationName ?? "api_sentinel_boss",
  });

  const origSend = boss.send.bind(boss);
  const origCreateQueue = boss.createQueue.bind(boss);
  const origWork = boss.work.bind(boss);
  const origCancel = boss.cancel.bind(boss);
  const origFindJobs = boss.findJobs.bind(boss);

  let started = false;
  let startPromise: Promise<PgBoss> | null = null;
  const ensureStarted = async () => {
    if (started) return;
    if (!startPromise) {
      startPromise = boss.start().then(() => {
        started = true;
        return boss;
      });
    }
    await startPromise;
  };

  const knownQueues = new Set<string>();
  const ensureQueue = async (qName: string) => {
    if (knownQueues.has(qName)) return;
    try {
      await origCreateQueue(qName, { policy: "stately" });
      knownQueues.add(qName);
    } catch {
      knownQueues.add(qName);
    }
  };

  boss.send = (async (...args: Parameters<PgBoss["send"]>) => {
    await ensureStarted();
    const [nameOrReq, data, options] = args;
    if (typeof nameOrReq === "string") {
      const sanitized = sanitizeQueueName(nameOrReq);
      await ensureQueue(sanitized);
      return (
        origSend as (
          name: string,
          payload?: object | null,
          opts?: unknown,
        ) => Promise<string | null>
      )(sanitized, data, options);
    }
    if (nameOrReq && typeof nameOrReq === "object" && "name" in nameOrReq) {
      const sanitized = sanitizeQueueName((nameOrReq as { name: string }).name);
      (nameOrReq as { name: string }).name = sanitized;
      await ensureQueue(sanitized);
    }
    return (origSend as (req: unknown) => Promise<string | null>)(nameOrReq);
  }) as PgBoss["send"];

  boss.createQueue = (async (
    name: Parameters<PgBoss["createQueue"]>[0],
    options?: Parameters<PgBoss["createQueue"]>[1],
  ) => {
    await ensureStarted();
    return origCreateQueue(typeof name === "string" ? sanitizeQueueName(name) : name, options);
  }) as PgBoss["createQueue"];

  boss.work = ((...args: Parameters<PgBoss["work"]>) => {
    const [name, ...rest] = args;
    return (origWork as (n: string, ...r: unknown[]) => Promise<string>)(
      typeof name === "string" ? sanitizeQueueName(name) : name,
      ...rest,
    );
  }) as PgBoss["work"];

  boss.cancel = (async (name: Parameters<PgBoss["cancel"]>[0], ...rest: [string | string[]]) => {
    await ensureStarted();
    return origCancel(typeof name === "string" ? sanitizeQueueName(name) : name, ...rest);
  }) as PgBoss["cancel"];

  boss.findJobs = (async (
    name: Parameters<PgBoss["findJobs"]>[0],
    options?: Parameters<PgBoss["findJobs"]>[1],
  ) => {
    await ensureStarted();
    return origFindJobs(typeof name === "string" ? sanitizeQueueName(name) : name, options);
  }) as PgBoss["findJobs"];

  return boss;
}

export type { Job, JobWithMetadata } from "pg-boss";
export { PgBoss };
