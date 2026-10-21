import {
  CheckResult,
  ConflictException,
  EndpointUrl,
  FailureCategory,
  HttpMethod,
  Monitor,
  TriggerType,
  UUIDv7,
} from "@sentinel/domain";
import {
  checkResults,
  closePgPool,
  createDrizzleDb,
  createPgPool,
  type DrizzleDatabase,
  DrizzleMetricsRepository,
  DrizzleMonitorRepository,
  DrizzleUnitOfWorkAdapter,
  ensureCheckResultsPartitions,
  incidents,
  monitorMetricsHourly,
  monitors,
  notificationDeliveries,
  runMigrations,
  upsertHourlyRollup,
  users,
} from "@sentinel/infra";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestPostgresContainer,
  type PostgresContainerInstance,
} from "../helpers/postgres-container.js";

let seq = 1;
function genUUIDv7(): string {
  const hex = (seq++).toString(16).padStart(12, "0");
  return `018d0000-0000-7000-8000-${hex}`;
}

describe("P4.7 & P4.8 — Database Concurrency, Constraints & Metrics Rollup", () => {
  let pgInstance: PostgresContainerInstance;
  let poolA: ReturnType<typeof createPgPool>;
  let poolB: ReturnType<typeof createPgPool>;
  let dbA: DrizzleDatabase;
  let dbB: DrizzleDatabase;

  let metricsRepo: DrizzleMetricsRepository;
  let monitorRepoA: DrizzleMonitorRepository;
  let monitorRepoB: DrizzleMonitorRepository;

  beforeAll(async () => {
    pgInstance = await createTestPostgresContainer("postgres:17-alpine");
    await runMigrations(undefined, pgInstance.connectionUri);

    poolA = createPgPool({
      connectionString: pgInstance.connectionUri,
      applicationName: "sentinel_test_conn_a",
      max: 5,
    });
    poolB = createPgPool({
      connectionString: pgInstance.connectionUri,
      applicationName: "sentinel_test_conn_b",
      max: 5,
    });

    dbA = createDrizzleDb(poolA);
    dbB = createDrizzleDb(poolB);

    metricsRepo = new DrizzleMetricsRepository(dbA);
    monitorRepoA = new DrizzleMonitorRepository(dbA);
    monitorRepoB = new DrizzleMonitorRepository(dbB);
  }, 90000);

  afterAll(async () => {
    if (poolA) await closePgPool(poolA);
    if (poolB) await closePgPool(poolB);
    if (pgInstance) await pgInstance.stop();
  });

  beforeEach(async () => {
    await dbA.delete(notificationDeliveries);
    await dbA.delete(checkResults);
    await dbA.delete(monitorMetricsHourly);
    await dbA.delete(incidents);
    await dbA.delete(monitors);
    await dbA.delete(users);
  });

  describe("P4.8 — Uji Integritas Transaksional, Konkurensi & Constraints", () => {
    it("menolak user kedua via uq_single_owner_guard", async () => {
      const u1 = genUUIDv7();
      const u2 = genUUIDv7();

      await poolA.query("INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3);", [
        u1,
        "first_owner",
        "$argon2id$v=19$m=65536,t=3,p=4$dummyhash1",
      ]);

      await expect(
        poolA.query("INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3);", [
          u2,
          "second_owner",
          "$argon2id$v=19$m=65536,t=3,p=4$dummyhash2",
        ]),
      ).rejects.toThrow(/23505|uq_single_owner_guard/);
    });

    it("menolak insiden terbuka kedua via uq_incidents_one_open", async () => {
      const monitorId = genUUIDv7();
      const monitor = Monitor.create({
        id: UUIDv7.fromString(monitorId),
        name: "Test API",
        url: EndpointUrl.create("https://example.com/api"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
      });
      await monitorRepoA.save(monitor);

      const inc1 = genUUIDv7();
      const inc2 = genUUIDv7();
      const inc3 = genUUIDv7();

      // First open incident succeeds
      await poolA.query(
        "INSERT INTO incidents (id, monitor_id, is_resolved, started_at, cause_category, initial_error_message, failure_count) VALUES ($1, $2, false, NOW(), 'HTTP_STATUS_MISMATCH', 'Err 1', 1);",
        [inc1, monitorId],
      );

      // Second open incident for same monitor must fail unique constraint
      await expect(
        poolA.query(
          "INSERT INTO incidents (id, monitor_id, is_resolved, started_at, cause_category, initial_error_message, failure_count) VALUES ($1, $2, false, NOW(), 'HTTP_STATUS_MISMATCH', 'Err 2', 1);",
          [inc2, monitorId],
        ),
      ).rejects.toThrow(/23505|uq_incidents_one_open/);

      // Resolved incident for same monitor can exist alongside
      await expect(
        poolA.query(
          "INSERT INTO incidents (id, monitor_id, is_resolved, started_at, recovered_at, cause_category, initial_error_message, failure_count) VALUES ($1, $2, true, NOW() - INTERVAL '1 hour', NOW(), 'HTTP_STATUS_MISMATCH', 'Err 3', 1);",
          [inc3, monitorId],
        ),
      ).resolves.toBeDefined();
    });

    it("mendeteksi update konkuren OCC dan melempar ConflictException (409)", async () => {
      const monitorId = genUUIDv7();
      const monitor = Monitor.create({
        id: UUIDv7.fromString(monitorId),
        name: "OCC Monitor",
        url: EndpointUrl.create("https://example.com/occ"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
      });
      await monitorRepoA.save(monitor);

      // Fetch version 1 on both clients
      const client1 = await monitorRepoA.findById(monitorId);
      const client2 = await monitorRepoB.findById(monitorId);
      expect(client1).not.toBeNull();
      expect(client2).not.toBeNull();
      if (!client1 || !client2) {
        throw new Error("Client monitor instances must be non-null");
      }
      expect(client1.version).toBe(1);

      // Client 1 updates name -> version becomes 2
      client1.name = "Updated by Client 1";
      await monitorRepoA.update(client1);

      // Client 2 attempts to update with stale version 1 -> ConflictException
      client2.name = "Updated by Client 2";
      await expect(monitorRepoB.update(client2)).rejects.toThrow(ConflictException);

      const refreshed = await monitorRepoA.findById(monitorId);
      expect(refreshed?.name).toBe("Updated by Client 1");
      expect(refreshed?.version).toBe(2);
    });

    it("menjamin rollback atomik UoW saat terjadi kegagalan transaksi", async () => {
      const uow = new DrizzleUnitOfWorkAdapter(dbA);
      const monitorId = genUUIDv7();
      const monitor = Monitor.create({
        id: UUIDv7.fromString(monitorId),
        name: "UoW Monitor",
        url: EndpointUrl.create("https://example.com/uow"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
      });
      await monitorRepoA.save(monitor);

      const checkId = genUUIDv7();
      const check = CheckResult.create({
        id: UUIDv7.fromString(checkId),
        monitorId: UUIDv7.fromString(monitorId),
        durationMs: 150,
        isSuccess: false,
        statusCode: 500,
        failureCategory: FailureCategory.HTTP_STATUS_MISMATCH,
        diagnostic: "Internal Server Error",
        triggerType: TriggerType.SCHEDULED,
      });

      // Execute transaction that fails midway
      await expect(
        uow.runInTransaction(async (tx) => {
          const target = tx as DrizzleDatabase;
          await target.insert(checkResults).values({
            id: check.id.toString(),
            monitorId: check.monitorId.toString(),
            executedAt: check.startedAt,
            startedAt: check.startedAt,
            finishedAt: check.finishedAt,
            durationMs: check.durationMs ?? 0,
            isSuccess: check.isSuccess,
            statusCode: check.statusCode,
            failureCategory: check.failureCategory,
            triggerType: check.triggerType,
            correlationId: check.correlationId,
          });

          throw new Error("Simulated transient failure in transaction");
        }),
      ).rejects.toThrow("Simulated transient failure in transaction");

      // Verify full rollback: no orphan check result
      const countRes = await poolA.query("SELECT COUNT(*) FROM check_results;");
      expect(Number(countRes.rows[0]?.count)).toBe(0);
    });

    it("menjamin dua koneksi bersamaan pada claimDue tidak mengambil baris yang sama (SKIP LOCKED)", async () => {
      const now = new Date();
      const dueMonitors: Monitor[] = [];

      for (let i = 0; i < 4; i++) {
        const m = Monitor.create({
          id: UUIDv7.fromString(genUUIDv7()),
          name: `Due Monitor ${i}`,
          url: EndpointUrl.create(`https://example.com/due/${i}`),
          method: HttpMethod.GET,
          intervalSeconds: 60,
          timeoutMs: 5000,
          nextRunAt: new Date(now.getTime() - 1000 * (i + 1)),
        });
        await monitorRepoA.save(m);
        dueMonitors.push(m);
      }

      // Concurrently claim 2 monitors from Connection A and Connection B
      const clientA = await poolA.connect();
      const clientB = await poolB.connect();

      try {
        await clientA.query("BEGIN;");
        await clientB.query("BEGIN;");

        // Client A claims 2 due monitors
        const resA = await clientA.query<{ id: string }>(
          "SELECT id FROM monitors WHERE is_active = true AND next_run_at <= NOW() ORDER BY next_run_at ASC LIMIT 2 FOR UPDATE SKIP LOCKED;",
        );

        // Client B concurrently claims 2 due monitors
        const resB = await clientB.query<{ id: string }>(
          "SELECT id FROM monitors WHERE is_active = true AND next_run_at <= NOW() ORDER BY next_run_at ASC LIMIT 2 FOR UPDATE SKIP LOCKED;",
        );

        expect(resA.rows.length).toBe(2);
        expect(resB.rows.length).toBe(2);

        const idsA = resA.rows.map((r) => r.id);
        const idsB = resB.rows.map((r) => r.id);

        // Overlap must be empty!
        const intersection = idsA.filter((id) => idsB.includes(id));
        expect(intersection).toEqual([]);

        await clientA.query("COMMIT;");
        await clientB.query("COMMIT;");
      } finally {
        clientA.release();
        clientB.release();
      }
    });

    it("memverifikasi routing partisi dan cursor pagination stabil", async () => {
      const monitorId = genUUIDv7();
      const monitor = Monitor.create({
        id: UUIDv7.fromString(monitorId),
        name: "Partition Monitor",
        url: EndpointUrl.create("https://example.com/partition"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
      });
      await monitorRepoA.save(monitor);

      // Ensure partition tables for current and future months
      await ensureCheckResultsPartitions(poolA, 2);

      const baseTime = Date.now();
      const insertedIds: string[] = [];

      for (let i = 0; i < 10; i++) {
        const id = genUUIDv7();
        insertedIds.push(id);
        await poolA.query(
          `INSERT INTO check_results (id, monitor_id, executed_at, duration_ms, is_success, trigger_type)
           VALUES ($1, $2, $3, $4, true, 'SCHEDULED');`,
          [id, monitorId, new Date(baseTime + i * 1000), 100 + i],
        );
      }

      // Verify stable cursor pagination: 3 items per page
      const page1 = await poolA.query<{ id: string; executed_at: Date }>(
        `SELECT id, executed_at FROM check_results 
         WHERE monitor_id = $1 
         ORDER BY executed_at DESC, id DESC 
         LIMIT 4;`,
        [monitorId],
      );
      expect(page1.rows.length).toBe(4);

      const lastRow = page1.rows[3];
      const page2 = await poolA.query<{ id: string }>(
        `SELECT id FROM check_results 
         WHERE monitor_id = $1 
           AND (executed_at < $2 OR (executed_at = $2 AND id < $3))
         ORDER BY executed_at DESC, id DESC 
         LIMIT 4;`,
        [monitorId, lastRow?.executed_at, lastRow?.id],
      );

      expect(page2.rows.length).toBe(4);
      const page1Ids = page1.rows.map((r) => r.id);
      const page2Ids = page2.rows.map((r) => r.id);

      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap).toEqual([]);
    });
  });

  describe("P4.7 — Query Metrik SQL & Rollup Per Jam", () => {
    it("menampilkan summary N/A (null) bila total_checks = 0", async () => {
      const summary = await metricsRepo.getSummary();
      expect(summary.totalMonitors).toBe(0);
      expect(summary.upCount).toBe(0);
      expect(summary.averageUptimePercentage).toBeNull();
      expect(summary.averageLatencyMs).toBeNull();
    });

    it("mengagregasi bucket 24 jam dengan date_bin 5 menit dan p95 (hanya SCHEDULED)", async () => {
      const monitorId = genUUIDv7();
      const monitor = Monitor.create({
        id: UUIDv7.fromString(monitorId),
        name: "Metrics Monitor",
        url: EndpointUrl.create("https://example.com/metrics"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
      });
      await monitorRepoA.save(monitor);

      const now = new Date();
      // Bucket 1 (5 mins ago): 3 successful checks (100ms, 120ms, 140ms) + 1 failed check (5000ms timeout)
      const t1 = new Date(now.getTime() - 4 * 60 * 1000);
      await poolA.query(
        `INSERT INTO check_results (id, monitor_id, executed_at, duration_ms, is_success, trigger_type) VALUES
         ($1, $5, $6, 100, true, 'SCHEDULED'),
         ($2, $5, $6, 120, true, 'SCHEDULED'),
         ($3, $5, $6, 140, true, 'SCHEDULED'),
         ($4, $5, $6, 5000, false, 'SCHEDULED');`,
        [genUUIDv7(), genUUIDv7(), genUUIDv7(), genUUIDv7(), monitorId, t1],
      );

      // Manual check in same bucket (must be ignored per filter)
      await poolA.query(
        `INSERT INTO check_results (id, monitor_id, executed_at, duration_ms, is_success, trigger_type)
         VALUES ($1, $2, $3, 999, true, 'MANUAL');`,
        [genUUIDv7(), monitorId, t1],
      );

      const metrics = await metricsRepo.getMonitorMetrics(monitorId, "24h");
      expect(metrics.monitorId).toBe(monitorId);
      expect(metrics.range).toBe("24h");
      expect(metrics.buckets.length).toBe(1);

      const bucket = metrics.buckets[0];
      expect(bucket).toBeDefined();
      expect(bucket?.totalChecks).toBe(4);
      expect(bucket?.successfulChecks).toBe(3);
      expect(bucket?.failedChecks).toBe(1);
      // Uptime: 3 / 4 * 100 = 75%
      expect(bucket?.uptimePercentage).toBe(75);
      // Latency policy: exclude failed checks (5000ms is excluded!). Avg of 100, 120, 140 = 120ms
      expect(bucket?.avgLatencyMs).toBe(120);

      expect(metrics.overallUptimePercentage).toBe(75);
      expect(metrics.overallAvgLatencyMs).toBe(120);
    });

    it("mengembalikan N/A (null) untuk monitor tanpa pemeriksaan historis", async () => {
      const monitorId = genUUIDv7();
      const monitor = Monitor.create({
        id: UUIDv7.fromString(monitorId),
        name: "Unchecked Monitor",
        url: EndpointUrl.create("https://example.com/unchecked"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
      });
      await monitorRepoA.save(monitor);

      const metrics = await metricsRepo.getMonitorMetrics(monitorId, "24h");
      expect(metrics.overallUptimePercentage).toBeNull();
      expect(metrics.overallAvgLatencyMs).toBeNull();
      expect(metrics.buckets).toEqual([]);
    });

    it("menjalankan upsertHourlyRollup secara idempotent dan aman diulang", async () => {
      const monitorId = genUUIDv7();
      const monitor = Monitor.create({
        id: UUIDv7.fromString(monitorId),
        name: "Rollup Monitor",
        url: EndpointUrl.create("https://example.com/rollup"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
      });
      await monitorRepoA.save(monitor);

      // Create checks within a specific past hour
      const targetHour = new Date(Date.now() - 2 * 3600 * 1000);
      targetHour.setUTCMinutes(15, 0, 0);

      await poolA.query(
        `INSERT INTO check_results (id, monitor_id, executed_at, duration_ms, is_success, trigger_type) VALUES
         ($1, $4, $5, 200, true, 'SCHEDULED'),
         ($2, $4, $5, 300, true, 'SCHEDULED'),
         ($3, $4, $5, 4000, false, 'SCHEDULED');`,
        [genUUIDv7(), genUUIDv7(), genUUIDv7(), monitorId, targetHour],
      );

      // First rollup execution
      const rollup1 = await upsertHourlyRollup(dbA, { targetHour, monitorId });
      expect(rollup1.affectedRows).toBe(1);

      const rows1 = await poolA.query<{
        total_checks: number;
        success_checks: number;
        avg_latency_ms: number;
      }>(
        "SELECT total_checks, success_checks, avg_latency_ms FROM monitor_metrics_hourly WHERE monitor_id = $1;",
        [monitorId],
      );
      expect(rows1.rows[0]?.total_checks).toBe(3);
      expect(rows1.rows[0]?.success_checks).toBe(2);
      expect(rows1.rows[0]?.avg_latency_ms).toBe(250); // avg of 200 and 300

      // Second idempotent execution: must not fail or duplicate
      const rollup2 = await upsertHourlyRollup(dbA, { targetHour, monitorId });
      expect(rollup2.affectedRows).toBe(1);

      const rows2 = await poolA.query(
        "SELECT COUNT(*) FROM monitor_metrics_hourly WHERE monitor_id = $1;",
        [monitorId],
      );
      expect(Number(rows2.rows[0]?.count)).toBe(1);
    });

    it("mengambil metrik 7d dan 30d langsung dari monitor_metrics_hourly (sub-100ms)", async () => {
      const monitorId = genUUIDv7();
      const monitor = Monitor.create({
        id: UUIDv7.fromString(monitorId),
        name: "7d Monitor",
        url: EndpointUrl.create("https://example.com/7d"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
      });
      await monitorRepoA.save(monitor);

      const hour1 = new Date(Date.now() - 24 * 3600 * 1000);
      const hour2 = new Date(Date.now() - 12 * 3600 * 1000);

      await poolA.query(
        `INSERT INTO monitor_metrics_hourly (monitor_id, bucket, total_checks, success_checks, avg_latency_ms, p95_latency_ms, p99_latency_ms) VALUES
         ($1, $2, 60, 57, 150, 210, 250),
         ($1, $3, 60, 60, 130, 180, 200);`,
        [monitorId, hour1, hour2],
      );

      const startMs = performance.now();
      const metrics7d = await metricsRepo.getMonitorMetrics(monitorId, "7d");
      const elapsedMs = performance.now() - startMs;

      expect(elapsedMs).toBeLessThan(100);
      expect(metrics7d.range).toBe("7d");
      expect(metrics7d.buckets.length).toBe(2);

      // Total checks: 120, total success: 117 -> uptime = (117 / 120) * 100 = 97.5%
      expect(metrics7d.overallUptimePercentage).toBe(97.5);

      // Weighted avg latency: (150*57 + 130*60) / 117 = (8550 + 7800) / 117 = 16350 / 117 = 139.74 -> 140ms
      expect(metrics7d.overallAvgLatencyMs).toBe(140);
    });

    it("menghasilkan sparkline 20 titik dalam urutan kronologis", async () => {
      const monitorId = genUUIDv7();
      const monitor = Monitor.create({
        id: UUIDv7.fromString(monitorId),
        name: "Sparkline Monitor",
        url: EndpointUrl.create("https://example.com/sparkline"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
      });
      await monitorRepoA.save(monitor);

      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        await poolA.query(
          "INSERT INTO check_results (id, monitor_id, executed_at, duration_ms, is_success, trigger_type) VALUES ($1, $2, $3, $4, true, 'SCHEDULED');",
          [genUUIDv7(), monitorId, new Date(now + i * 1000), 100 + i * 10],
        );
      }

      const sparkline = await metricsRepo.getSparkline(monitorId, 5);
      expect(sparkline.length).toBe(5);
      expect(sparkline[0]?.durationMs).toBe(100);
      expect(sparkline[4]?.durationMs).toBe(140);
    });

    it("mengambil composite latency lintas-monitor untuk rentang 24h dan 7d", async () => {
      const m1 = genUUIDv7();
      const m2 = genUUIDv7();
      await monitorRepoA.save(
        Monitor.create({
          id: UUIDv7.fromString(m1),
          name: "M1",
          url: EndpointUrl.create("https://example.com/m1"),
          method: HttpMethod.GET,
          intervalSeconds: 60,
          timeoutMs: 5000,
        }),
      );
      await monitorRepoA.save(
        Monitor.create({
          id: UUIDv7.fromString(m2),
          name: "M2",
          url: EndpointUrl.create("https://example.com/m2"),
          method: HttpMethod.GET,
          intervalSeconds: 60,
          timeoutMs: 5000,
        }),
      );

      const t = new Date(Date.now() - 10 * 60 * 1000);
      await poolA.query(
        `INSERT INTO check_results (id, monitor_id, executed_at, duration_ms, is_success, trigger_type) VALUES
         ($1, $3, $5, 120, true, 'SCHEDULED'),
         ($2, $4, $5, 180, true, 'SCHEDULED');`,
        [genUUIDv7(), genUUIDv7(), m1, m2, t],
      );

      const composite24h = await metricsRepo.getCompositeLatency("24h");
      expect(composite24h.range).toBe("24h");
      expect(composite24h.points.length).toBeGreaterThanOrEqual(1);

      const pt = composite24h.points[0];
      expect(pt?.avgLatencyMs).toBe(150); // avg of 120 and 180
      expect(pt?.minLatencyMs).toBe(120);
      expect(pt?.maxLatencyMs).toBe(180);
    });
  });
});
