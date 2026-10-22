import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestPostgresContainer,
  type PostgresContainerInstance,
} from "../helpers/postgres-container";

describe("PostgreSQL 17 Testcontainers Harness", () => {
  let pgInstance: PostgresContainerInstance | null = null;

  beforeAll(async () => {
    // Start postgres:17-alpine testcontainer
    pgInstance = await createTestPostgresContainer("postgres:17-alpine");
  }, 90000);

  afterAll(async () => {
    if (pgInstance) {
      await pgInstance.stop();
    }
  });

  it("connects to PostgreSQL 17 container and verifies server version", async () => {
    expect(pgInstance).not.toBeNull();
    if (!pgInstance) return;

    expect(pgInstance.connectionUri).toContain("postgres://");

    const result = await pgInstance.executeSql("SHOW server_version;");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("17.");
  });

  it("creates test table, inserts data, and truncates successfully", async () => {
    if (!pgInstance) return;

    await pgInstance.executeSql(
      "CREATE TABLE IF NOT EXISTS test_monitor (id serial primary key, name text);",
    );
    await pgInstance.executeSql("INSERT INTO test_monitor (name) VALUES ('Health Check API');");

    const countBefore = await pgInstance.executeSql("SELECT COUNT(*) FROM test_monitor;");
    expect(countBefore.stdout).toContain("1");

    await pgInstance.truncateAllTables();

    const countAfter = await pgInstance.executeSql("SELECT COUNT(*) FROM test_monitor;");
    expect(countAfter.stdout).toContain("0");
  });
});
