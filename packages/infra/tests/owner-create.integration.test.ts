import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOwnerAccount } from "../src/cli/owner-create.js";
import type { DrizzleDatabase } from "../src/db/connection.js";
import { closePgPool, createDrizzleDb, createPgPool } from "../src/db/connection.js";
import { users } from "../src/db/schema/index.js";
import { DrizzleUserRepository } from "../src/repositories/drizzle-user-repository.js";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://sentinel_user:sentinel_password@localhost:5433/api_sentinel_dev";

describe("P7.4 — CLI Pembuatan Akun Pemilik (owner:create)", () => {
  let pool: ReturnType<typeof createPgPool>;
  let db: DrizzleDatabase;
  let userRepo: DrizzleUserRepository;

  beforeAll(() => {
    pool = createPgPool({
      connectionString: TEST_DB_URL,
      applicationName: "api_sentinel_owner_create_test",
      max: 5,
    });
    db = createDrizzleDb(pool);
    userRepo = new DrizzleUserRepository(db);
  });

  afterAll(async () => {
    await closePgPool(pool);
  });

  beforeEach(async () => {
    await db.delete(users);
  });

  it("creates owner account successfully with valid credentials", async () => {
    const result = await createOwnerAccount({
      username: "admin_sentinel",
      password: "SuperSecretPassword123!",
      databaseUrl: TEST_DB_URL,
    });

    expect(result.success).toBe(true);
    expect(result.username).toBe("admin_sentinel");
    expect(result.userId).toBeDefined();

    const ownerInDb = await userRepo.getOwner();
    expect(ownerInDb).not.toBeNull();
    expect(ownerInDb?.username).toBe("admin_sentinel");
  });

  it("rejects second owner creation and preserves single-owner guarantee", async () => {
    const firstResult = await createOwnerAccount({
      username: "owner_primary",
      password: "FirstPassword123!",
      databaseUrl: TEST_DB_URL,
    });
    expect(firstResult.success).toBe(true);

    const secondResult = await createOwnerAccount({
      username: "owner_secondary",
      password: "SecondPassword123!",
      databaseUrl: TEST_DB_URL,
    });

    expect(secondResult.success).toBe(false);
    expect(secondResult.message).toContain("Akun pemilik sudah terdaftar");

    const ownerInDb = await userRepo.getOwner();
    expect(ownerInDb?.username).toBe("owner_primary");
  });

  it("rejects invalid password length (under 8 chars)", async () => {
    const result = await createOwnerAccount({
      username: "short_pass",
      password: "short",
      databaseUrl: TEST_DB_URL,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Validasi kredensial gagal");

    const ownerInDb = await userRepo.getOwner();
    expect(ownerInDb).toBeNull();
  });
});
