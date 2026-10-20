import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import { LoginRequestSchema } from "@sentinel/contracts";
import { NodeArgon2HasherAdapter } from "../crypto/node-argon2-hasher.adapter.js";
import { createDrizzleDb, createPgPool } from "../db/connection.js";
import { DrizzleUserRepository } from "../repositories/drizzle-user-repository.js";
import { UuidV7GeneratorAdapter } from "../services/uuid-v7-generator.adapter.js";

export interface OwnerCreateOptions {
  username?: string;
  password?: string;
  databaseUrl?: string;
}

export interface OwnerCreateResult {
  success: boolean;
  userId?: string;
  username?: string;
  message: string;
}

export async function createOwnerAccount(
  options: OwnerCreateOptions = {},
): Promise<OwnerCreateResult> {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) {
    return {
      success: false,
      message: "DATABASE_URL environment variable is required.",
    };
  }

  const pool = createPgPool({
    connectionString: databaseUrl,
    max: 2,
    applicationName: "api_sentinel_owner_create",
  });
  const db = createDrizzleDb(pool);
  const userRepo = new DrizzleUserRepository(db);
  const hasher = new NodeArgon2HasherAdapter();
  const idGenerator = new UuidV7GeneratorAdapter();

  try {
    const existingOwner = await userRepo.getOwner();
    if (existingOwner) {
      return {
        success: false,
        message:
          "Akun pemilik sudah terdaftar. Sistem hanya mendukung pemilik tunggal (single-owner).",
      };
    }

    let username = options.username || process.env.OWNER_USERNAME;
    let password = options.password || process.env.OWNER_PASSWORD;

    if ((!username || !password) && input.isTTY) {
      const rl = readline.createInterface({ input, output });
      try {
        if (!username) {
          username = await rl.question("Masukkan username pemilik: ");
        }
        if (!password) {
          password = await rl.question("Masukkan password pemilik (min 8 karakter): ");
        }
      } finally {
        rl.close();
      }
    }

    const validation = LoginRequestSchema.safeParse({ username, password });
    if (!validation.success) {
      const issues = validation.error.issues.map((i) => i.message).join(", ");
      return {
        success: false,
        message: `Validasi kredensial gagal: ${issues}`,
      };
    }

    const validUsername = validation.data.username;
    const validPassword = validation.data.password;

    const passwordHash = await hasher.hash(validPassword);
    const userId = idGenerator.generate();
    const now = new Date();

    await userRepo.createOwner({
      id: userId,
      username: validUsername,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    return {
      success: true,
      userId,
      username: validUsername,
      message: `Akun pemilik '${validUsername}' berhasil dibuat.`,
    };
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err.code === "23505") {
      return {
        success: false,
        message:
          "Akun pemilik sudah terdaftar. Pelanggaran batasan pemilik tunggal (uq_single_owner_guard).",
      };
    }
    return {
      success: false,
      message: `Gagal membuat akun pemilik: ${err.message || String(error)}`,
    };
  } finally {
    await pool.end();
  }
}

if (import.meta.main || process.argv[1]?.endsWith("owner-create.ts")) {
  createOwnerAccount()
    .then((result) => {
      if (result.success) {
        console.log(`[SUCCESS] ${result.message} (User ID: ${result.userId})`);
        process.exit(0);
      } else {
        console.error(`[ERROR] ${result.message}`);
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error("[FATAL]", err);
      process.exit(1);
    });
}
