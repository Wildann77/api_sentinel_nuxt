import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closePgPool,
  createPgPool,
  ensureCheckResultsPartitions,
  getExistingCheckResultsPartitions,
  purgeExpiredCheckResults,
  runMigrations,
} from "../../packages/infra/src/index.js";
import {
  createTestPostgresContainer,
  type PostgresContainerInstance,
} from "../helpers/postgres-container.js";

describe("P4.3 & P4.4 — Database Migrations, Partitions & Retention", () => {
  let pgInstance: PostgresContainerInstance | null = null;
  let pool: ReturnType<typeof createPgPool>;

  beforeAll(async () => {
    pgInstance = await createTestPostgresContainer("postgres:17-alpine");
    pool = createPgPool({
      connectionString: pgInstance.connectionUri,
      max: 5,
    });
  }, 90000);

  afterAll(async () => {
    if (pool) {
      await closePgPool(pool);
    }
    if (pgInstance) {
      await pgInstance.stop();
    }
  });

  describe("P4.3 — Migration Execution & Idempotency", () => {
    it("runs migrations on a fresh PostgreSQL 17 database", async () => {
      await expect(runMigrations(undefined, pgInstance?.connectionUri)).resolves.toBeUndefined();

      // Verify check_results is a partitioned table (relkind = 'p')
      const tableRes = await pool.query<{ relkind: string }>(
        "SELECT relkind FROM pg_class WHERE relname = 'check_results';",
      );
      expect(tableRes.rows[0]?.relkind).toBe("p");

      // Verify pgcrypto extension is installed
      const extRes = await pool.query<{ extname: string }>(
        "SELECT extname FROM pg_extension WHERE extname = 'pgcrypto';",
      );
      expect(extRes.rows.length).toBe(1);

      // Verify default partition exists
      const defaultPartRes = await pool.query<{ relname: string }>(
        "SELECT relname FROM pg_class WHERE relname = 'check_results_default';",
      );
      expect(defaultPartRes.rows.length).toBe(1);
    });

    it("is idempotent when runMigrations is executed again", async () => {
      await expect(runMigrations(undefined, pgInstance?.connectionUri)).resolves.toBeUndefined();
    });

    it("verifies single owner guard unique index (uq_single_owner_guard)", async () => {
      const u1 = "11111111-1111-7111-8111-111111111111";
      const u2 = "22222222-2222-7222-8222-222222222222";

      await pool.query("INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3);", [
        u1,
        "owner1",
        "hash1",
      ]);

      await expect(
        pool.query("INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3);", [
          u2,
          "owner2",
          "hash2",
        ]),
      ).rejects.toThrow(/uq_single_owner_guard/);

      // Clean up for subsequent tests
      await pool.query("DELETE FROM users WHERE id = $1;", [u1]);
    });
  });

  describe("P4.4 — Partition Maintenance & Retention", () => {
    const monitorId = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";

    beforeAll(async () => {
      // Insert a test monitor for check_results FK
      await pool.query(
        `INSERT INTO monitors (
          id, name, url, method, interval_seconds, timeout_ms, is_active
        ) VALUES ($1, $2, $3, $4, 300, 5000, true);`,
        [monitorId, "Partition Test Monitor", "https://api.example.com/health", "GET"],
      );
    });

    afterAll(async () => {
      await pool.query("DELETE FROM monitors WHERE id = $1;", [monitorId]);
    });

    it("routes row to current month partition when date falls in current month", async () => {
      const checkId = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb";
      const now = new Date();

      await pool.query(
        `INSERT INTO check_results (
          id, monitor_id, executed_at, duration_ms, is_success, trigger_type
        ) VALUES ($1, $2, $3, 120, true, 'SCHEDULED');`,
        [checkId, monitorId, now],
      );

      // Verify row exists in check_results
      const selectRes = await pool.query<{ id: string }>(
        "SELECT id FROM check_results WHERE id = $1;",
        [checkId],
      );
      expect(selectRes.rows.length).toBe(1);

      // Find which child partition actually stores this row
      const partRes = await pool.query<{ tableoid: number; relname: string }>(
        `SELECT c.relname
         FROM check_results cr
         JOIN pg_class c ON c.oid = cr.tableoid
         WHERE cr.id = $1;`,
        [checkId],
      );
      expect(partRes.rows[0]?.relname).toMatch(/^check_results_y\d{4}m\d{2}$/);
    });

    it("routes row to check_results_default when date is outside active range partitions", async () => {
      const pastCheckId = "cccccccc-cccc-7ccc-8ccc-cccccccccccc";
      const pastDate = new Date("2020-01-15T00:00:00Z");

      await pool.query(
        `INSERT INTO check_results (
          id, monitor_id, executed_at, duration_ms, is_success, trigger_type
        ) VALUES ($1, $2, $3, 200, false, 'SCHEDULED');`,
        [pastCheckId, monitorId, pastDate],
      );

      const partRes = await pool.query<{ relname: string }>(
        `SELECT c.relname
         FROM check_results cr
         JOIN pg_class c ON c.oid = cr.tableoid
         WHERE cr.id = $1;`,
        [pastCheckId],
      );
      expect(partRes.rows[0]?.relname).toBe("check_results_default");
    });

    it("ensures future partitions exist idempotently via ensureCheckResultsPartitions", async () => {
      const result = await ensureCheckResultsPartitions(pool, 3);
      expect(result.status).toBe("ok");

      const partitions = await getExistingCheckResultsPartitions(pool);
      expect(partitions).toContain("check_results_default");
      expect(partitions.length).toBeGreaterThanOrEqual(4); // default + 3 future + current
    });

    it("purges expired partitions, default table records, and old hourly rollups", async () => {
      // 1. Manually create an old partition (e.g. from year 2021)
      await pool.query(
        `CREATE TABLE IF NOT EXISTS check_results_y2021m01 PARTITION OF check_results
         FOR VALUES FROM ('2021-01-01 00:00:00+00') TO ('2021-02-01 00:00:00+00');`,
      );

      const partitionsBefore = await getExistingCheckResultsPartitions(pool);
      expect(partitionsBefore).toContain("check_results_y2021m01");

      // 2. Insert old hourly rollup data older than 400 days
      const oldBucket = new Date("2021-01-15T00:00:00Z");
      await pool.query(
        `INSERT INTO monitor_metrics_hourly (
          monitor_id, bucket, total_checks, success_checks, avg_latency_ms, p95_latency_ms, p99_latency_ms
        ) VALUES ($1, $2, 10, 10, 50, 60, 70);`,
        [monitorId, oldBucket],
      );

      // 3. Run purge with retention 90 days, rollup retention 400 days
      const purgeResult = await purgeExpiredCheckResults(pool, 90, 400);
      expect(purgeResult.status).toBe("ok");
      expect(purgeResult.dropped_partitions).toContain("check_results_y2021m01");
      expect(purgeResult.default_rows_deleted).toBeGreaterThanOrEqual(1); // pastCheckId from 2020 was in default
      expect(purgeResult.rollup_rows_deleted).toBeGreaterThanOrEqual(1);

      // 4. Verify partition was dropped and default partition remains
      const partitionsAfter = await getExistingCheckResultsPartitions(pool);
      expect(partitionsAfter).not.toContain("check_results_y2021m01");
      expect(partitionsAfter).toContain("check_results_default");
    });
  });
});
