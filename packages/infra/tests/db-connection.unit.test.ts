import { describe, expect, it } from "vitest";
import {
  closePgClient,
  closePgPool,
  createDrizzleDb,
  createListenClient,
  createPgPool,
} from "../src/db/connection.js";

describe("Database Connection Factory", () => {
  it("should create pg.Pool with custom configuration", async () => {
    const pool = createPgPool({
      connectionString: "postgres://test_user:test_pass@localhost:5432/test_db",
      applicationName: "test_web",
      max: 5,
      idleTimeoutMillis: 10000,
    });

    expect(pool).toBeDefined();
    expect(pool.options.max).toBe(5);
    expect(pool.options.idleTimeoutMillis).toBe(10000);
    expect(pool.options.application_name).toBe("test_web");

    await closePgPool(pool);
  });

  it("should create Drizzle database instance from pool", async () => {
    const pool = createPgPool({
      connectionString: "postgres://test_user:test_pass@localhost:5432/test_db",
      max: 1,
    });

    const db = createDrizzleDb(pool);
    expect(db).toBeDefined();
    expect(db.query).toBeDefined();

    await closePgPool(pool);
  });

  it("should create dedicated pg.Client for LISTEN channel", async () => {
    const client = createListenClient({
      connectionString: "postgres://test_user:test_pass@localhost:5432/test_db",
      applicationName: "custom_listener",
    });

    expect(client).toBeDefined();
    expect(
      (client as unknown as { connectionParameters: { application_name: string } })
        .connectionParameters.application_name,
    ).toBe("custom_listener");

    await closePgClient(client);
  });
});
