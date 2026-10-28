import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePgPool, createDrizzleDb, createPgPool } from "../src/db/connection.js";
import {
  createPgBoss,
  PgBossQueueAdapter,
  sanitizeQueueName,
} from "../src/queue/pg-boss-queue-adapter.js";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel_dev";

describe("P17.3 — PgBossQueueAdapter & Lifecycle Integration Test", () => {
  let boss: ReturnType<typeof createPgBoss>;
  let adapter: PgBossQueueAdapter;
  let pool: ReturnType<typeof createPgPool>;
  let db: ReturnType<typeof createDrizzleDb>;

  beforeAll(async () => {
    pool = createPgPool({
      connectionString: TEST_DB_URL,
      applicationName: "pg_boss_test_pool",
      max: 5,
    });
    db = createDrizzleDb(pool);

    boss = createPgBoss({
      connectionString: TEST_DB_URL,
      schema: "pgboss",
      max: 5,
      applicationName: "pg_boss_test",
    });
    await boss.start();
    adapter = new PgBossQueueAdapter(boss);
  });

  afterAll(async () => {
    try {
      await boss.stop({ graceful: true, timeout: 2000 });
    } catch {
      // Ignore cleanup timeout
    }
    await closePgPool(pool);
  });

  it("sanitizes queue name replacing colons with underscores", () => {
    expect(sanitizeQueueName("probe:check")).toBe("probe_check");
    expect(sanitizeQueueName("notification:send")).toBe("notification_send");
    expect(sanitizeQueueName("already_clean")).toBe("already_clean");
  });

  it("sends job with singletonKey, retry limits, expiration and cancels it", async () => {
    const queueName = "test_queue_lifecycle";
    const singletonKey = `key-${Date.now()}`;

    const jobId = await adapter.send(
      queueName,
      { data: "sample_payload" },
      {
        singletonKey,
        retryLimit: 3,
        retryDelay: 10,
        expireInSeconds: 60,
      },
    );

    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe("string");

    // Second send with same singletonKey is deduplicated / throttled
    const duplicateId = await adapter.send(
      queueName,
      { data: "sample_payload_dup" },
      { singletonKey },
    );
    // In pg-boss stately singletonKey returns null or same jobId
    expect(duplicateId === null || duplicateId === jobId).toBe(true);

    // Cancel job
    await adapter.cancel(queueName, singletonKey);
  });

  it("sends job atomically within Drizzle transaction (D-01)", async () => {
    const queueName = "test_tx_queue";
    const singletonKey = `tx-key-${Date.now()}`;

    let committedJobId: string | null = null;
    await db.transaction(async (tx) => {
      committedJobId = await adapter.send(
        queueName,
        { action: "in_transaction" },
        {
          db: tx,
          singletonKey,
        },
      );
      expect(committedJobId).not.toBeNull();
    });

    // Cleanup
    await adapter.cancel(queueName, singletonKey);
  });

  it("handles non-string queue names in sanitizeQueueName", () => {
    expect(sanitizeQueueName(null as unknown as string)).toBeNull();
    expect(sanitizeQueueName(12345 as unknown as string)).toBe(12345);
    expect(sanitizeQueueName(undefined as unknown as string)).toBeUndefined();
  });

  it("sends job with startAfter and object with executeSql", async () => {
    const queueName = "test_opts_queue";
    const singletonKey = `opts-key-${Date.now()}`;

    // Test with mock object that has executeSql returning rows
    const mockDb = {
      executeSql: async () => ({ rows: [{ id: "mock-job-id" }] }),
    };

    const jobId = await adapter.send(
      queueName,
      { test: "opts" },
      {
        db: mockDb as unknown as NonNullable<Parameters<typeof adapter.send>[2]>["db"],
        startAfter: 2,
        singletonKey,
      },
    );
    expect(jobId).toBe("mock-job-id");

    // Cancel fallback when findJobs is empty or directly cancelled
    await adapter.cancel(queueName, singletonKey);
    // Double cancel on non-existent job should not throw
    await adapter.cancel(queueName, "non_existent_key_12345");
  });

  it("covers wrapper methods on createPgBoss: send object, work, findJobs, cancel, and createQueue", async () => {
    const queueName = "test:wrapper:methods";

    // 1. boss.createQueue with string & options
    await boss.createQueue(queueName, { policy: "stately" });

    // 2. boss.send with object request
    const sendObjRes = await boss.send({
      name: queueName,
      data: { hello: "world" },
    } as unknown as string);
    expect(sendObjRes).toBeDefined();

    // 3. boss.findJobs with string & options
    const foundJobs = await boss.findJobs(queueName, { queued: true });
    expect(Array.isArray(foundJobs)).toBe(true);

    // 4. boss.cancel with string queue
    if (sendObjRes) {
      await boss.cancel(queueName, sendObjRes);
    }

    // 5. boss.work with string name
    const workHandle = await boss.work(queueName, async () => {});
    expect(workHandle).toBeDefined();
  });
});
