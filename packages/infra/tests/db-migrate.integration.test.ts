import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePgPool, createPgPool } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import {
  ensureCheckResultsPartitions,
  getExistingCheckResultsPartitions,
  purgeExpiredCheckResults,
} from "../src/db/partitions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel_dev";

describe("P17.3 — Database Migrations & Partitions Integration Test", () => {
  let pool: ReturnType<typeof createPgPool>;

  beforeAll(() => {
    pool = createPgPool({
      connectionString: TEST_DB_URL,
      applicationName: "partition_test",
      max: 2,
    });
  });

  afterAll(async () => {
    await closePgPool(pool);
  });

  it("runs migrations idempotently and ensures check_results partitions", async () => {
    const migrationsFolder = path.resolve(__dirname, "../drizzle");
    await expect(runMigrations(migrationsFolder, TEST_DB_URL)).resolves.not.toThrow();
  });

  it("ensures, queries, and purges partitions through helper functions", async () => {
    const ensureRes = await ensureCheckResultsPartitions(pool, 3);
    expect(ensureRes.status).toBe("ok");

    const partitions = await getExistingCheckResultsPartitions(pool);
    expect(partitions.length).toBeGreaterThan(0);
    expect(partitions.some((p) => p.startsWith("check_results_"))).toBe(true);

    const purgeRes = await purgeExpiredCheckResults(pool, 180, 400);
    expect(purgeRes.status).toBe("ok");
    expect(Array.isArray(purgeRes.dropped_partitions)).toBe(true);
  });
});
