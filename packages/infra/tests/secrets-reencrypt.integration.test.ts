import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  formatMonitorAad,
  formatNotificationConfigAad,
  LibsodiumAeadCipherAdapter,
} from "../src/crypto/libsodium-aead-cipher.adapter.js";
import { reencryptSecrets } from "../src/crypto/secrets-reencrypt.js";
import type { DrizzleDatabase } from "../src/db/connection.js";
import { closePgPool, createDrizzleDb, createPgPool } from "../src/db/connection.js";
import { monitors, notificationConfigs } from "../src/db/schema/index.js";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel_dev";

const KEY_1_BASE64 = Buffer.alloc(32, 1).toString("base64");
const KEY_2_BASE64 = Buffer.alloc(32, 2).toString("base64");

describe("P5.2 — Secrets Re-encryption Integration Test", () => {
  let pool: ReturnType<typeof createPgPool>;
  let db: DrizzleDatabase;

  const oldCipher = new LibsodiumAeadCipherAdapter({
    activeKeyId: "k1",
    keys: {
      k1: KEY_1_BASE64,
      k2: KEY_2_BASE64,
    },
  });

  const newCipher = new LibsodiumAeadCipherAdapter({
    activeKeyId: "k2",
    keys: {
      k1: KEY_1_BASE64,
      k2: KEY_2_BASE64,
    },
  });

  beforeAll(() => {
    pool = createPgPool({
      connectionString: TEST_DB_URL,
      applicationName: "api_sentinel_reencrypt_test",
      max: 5,
    });
    db = createDrizzleDb(pool);
  });

  afterAll(async () => {
    await closePgPool(pool);
  });

  beforeEach(async () => {
    await db.delete(monitors);
    await db.delete(notificationConfigs);
  });

  it("re-encrypts monitors and notification configs from k1 to k2 idempotently", async () => {
    const monitorId = "018d0000-0000-7000-8000-000000000055";
    const rawHeaders = JSON.stringify({ Authorization: "Bearer legacy-secret-token" });
    const rawBody = '{"query":"secret_payload"}';
    const rawAuth = JSON.stringify({ type: "bearer", token: "super-secret-auth" });
    const aadHeaders = formatMonitorAad(monitorId, "headers");
    const aadBody = formatMonitorAad(monitorId, "body");
    const aadAuth = formatMonitorAad(monitorId, "authConfig");

    const encHeadersK1 = await oldCipher.encrypt(rawHeaders, aadHeaders);
    const encBodyK1 = await oldCipher.encrypt(rawBody, aadBody);
    const encAuthK1 = await oldCipher.encrypt(rawAuth, aadAuth);

    expect(encHeadersK1.startsWith("v1:k1:")).toBe(true);
    expect(encBodyK1.startsWith("v1:k1:")).toBe(true);
    expect(encAuthK1.startsWith("v1:k1:")).toBe(true);

    await db.insert(monitors).values({
      id: monitorId,
      name: "Monitored Service",
      url: "https://example.com/api",
      method: "GET",
      encryptedHeaders: encHeadersK1,
      encryptedBody: encBodyK1,
      encryptedAuthConfig: encAuthK1,
      isActive: true,
    });

    const configId = "018d0000-0000-7000-8000-000000000077";
    const rawBotToken = "bot123456:secret-telegram-token";
    const aadToken = formatNotificationConfigAad(configId, "botToken");
    const encTokenK1 = await oldCipher.encrypt(rawBotToken, aadToken);

    expect(encTokenK1.startsWith("v1:k1:")).toBe(true);

    await db.insert(notificationConfigs).values({
      id: configId,
      channel: "TELEGRAM",
      chatId: "-100123456789",
      encryptedBotToken: encTokenK1,
      isActive: true,
    });

    // Run reencryption using newCipher (activeKey: k2)
    const summary = await reencryptSecrets(db, newCipher);

    expect(summary.monitorsReencrypted).toBe(1);
    expect(summary.notificationConfigsReencrypted).toBe(1);
    expect(summary.fieldsReencrypted).toBe(4);

    // Verify DB state
    const [updatedMonitor] = await db.select().from(monitors).where(eq(monitors.id, monitorId));
    expect(updatedMonitor.encryptedHeaders?.startsWith("v1:k2:")).toBe(true);
    expect(updatedMonitor.encryptedBody?.startsWith("v1:k2:")).toBe(true);
    expect(updatedMonitor.encryptedAuthConfig?.startsWith("v1:k2:")).toBe(true);

    // Decrypt with newCipher
    expect(updatedMonitor.encryptedHeaders).toBeDefined();
    expect(updatedMonitor.encryptedBody).toBeDefined();
    expect(updatedMonitor.encryptedAuthConfig).toBeDefined();

    if (
      !updatedMonitor.encryptedHeaders ||
      !updatedMonitor.encryptedBody ||
      !updatedMonitor.encryptedAuthConfig
    ) {
      throw new Error("Expected encrypted fields to be defined on monitor");
    }

    const decryptedHeaders = await newCipher.decrypt(updatedMonitor.encryptedHeaders, aadHeaders);
    expect(decryptedHeaders).toBe(rawHeaders);

    const decryptedBody = await newCipher.decrypt(updatedMonitor.encryptedBody, aadBody);
    expect(decryptedBody).toBe(rawBody);

    const decryptedAuth = await newCipher.decrypt(updatedMonitor.encryptedAuthConfig, aadAuth);
    expect(decryptedAuth).toBe(rawAuth);

    const [updatedConfig] = await db
      .select()
      .from(notificationConfigs)
      .where(eq(notificationConfigs.id, configId));
    expect(updatedConfig.encryptedBotToken.startsWith("v1:k2:")).toBe(true);

    const decryptedToken = await newCipher.decrypt(updatedConfig.encryptedBotToken, aadToken);
    expect(decryptedToken).toBe(rawBotToken);

    // Verify idempotency
    const secondRun = await reencryptSecrets(db, newCipher);
    expect(secondRun.monitorsReencrypted).toBe(0);
    expect(secondRun.notificationConfigsReencrypted).toBe(0);
    expect(secondRun.fieldsReencrypted).toBe(0);
  });
});
