import { eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../db/connection.js";
import { createDrizzleDb, createPgPool } from "../db/connection.js";
import { monitors } from "../db/schema/monitors.js";
import { notificationConfigs } from "../db/schema/notification_configs.js";
import {
  formatMonitorAad,
  formatNotificationConfigAad,
  LibsodiumAeadCipherAdapter,
} from "./libsodium-aead-cipher.adapter.js";

export interface ReencryptionSummary {
  monitorsProcessed: number;
  monitorsReencrypted: number;
  notificationConfigsProcessed: number;
  notificationConfigsReencrypted: number;
  fieldsReencrypted: number;
}

export async function reencryptSecrets(
  db: DrizzleDatabase,
  cipher: LibsodiumAeadCipherAdapter,
): Promise<ReencryptionSummary> {
  const summary: ReencryptionSummary = {
    monitorsProcessed: 0,
    monitorsReencrypted: 0,
    notificationConfigsProcessed: 0,
    notificationConfigsReencrypted: 0,
    fieldsReencrypted: 0,
  };

  // 1. Process monitors
  const allMonitors = await db.select().from(monitors);
  summary.monitorsProcessed = allMonitors.length;

  for (const monitor of allMonitors) {
    let modified = false;
    const updates: Partial<typeof monitors.$inferInsert> = {};

    if (monitor.encryptedHeaders && cipher.needsReencryption(monitor.encryptedHeaders)) {
      const aad = formatMonitorAad(monitor.id, "headers");
      const plain = await cipher.decrypt(monitor.encryptedHeaders, aad);
      updates.encryptedHeaders = await cipher.encrypt(plain, aad);
      summary.fieldsReencrypted += 1;
      modified = true;
    }

    if (monitor.encryptedBody && cipher.needsReencryption(monitor.encryptedBody)) {
      const aad = formatMonitorAad(monitor.id, "body");
      const plain = await cipher.decrypt(monitor.encryptedBody, aad);
      updates.encryptedBody = await cipher.encrypt(plain, aad);
      summary.fieldsReencrypted += 1;
      modified = true;
    }

    if (monitor.encryptedAuthConfig && cipher.needsReencryption(monitor.encryptedAuthConfig)) {
      const aad = formatMonitorAad(monitor.id, "authConfig");
      const plain = await cipher.decrypt(monitor.encryptedAuthConfig, aad);
      updates.encryptedAuthConfig = await cipher.encrypt(plain, aad);
      summary.fieldsReencrypted += 1;
      modified = true;
    }

    if (modified) {
      updates.updatedAt = new Date();
      await db.update(monitors).set(updates).where(eq(monitors.id, monitor.id));
      summary.monitorsReencrypted += 1;
    }
  }

  // 2. Process notification configs
  const allConfigs = await db.select().from(notificationConfigs);
  summary.notificationConfigsProcessed = allConfigs.length;

  for (const config of allConfigs) {
    if (config.encryptedBotToken && cipher.needsReencryption(config.encryptedBotToken)) {
      const aad = formatNotificationConfigAad(config.id, "botToken");
      const plain = await cipher.decrypt(config.encryptedBotToken, aad);
      const newEncryptedToken = await cipher.encrypt(plain, aad);

      await db
        .update(notificationConfigs)
        .set({
          encryptedBotToken: newEncryptedToken,
          updatedAt: new Date(),
        })
        .where(eq(notificationConfigs.id, config.id));

      summary.notificationConfigsReencrypted += 1;
      summary.fieldsReencrypted += 1;
    }
  }

  return summary;
}

// CLI runner entrypoint
if (import.meta.main || process.argv[1]?.endsWith("secrets-reencrypt.ts")) {
  const pool = createPgPool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });
  const db = createDrizzleDb(pool);
  const cipher = new LibsodiumAeadCipherAdapter();

  console.log(`Starting secret re-encryption using active key "${cipher.getActiveKeyId()}"...`);

  reencryptSecrets(db, cipher)
    .then((res) => {
      console.log("Secret re-encryption complete:", JSON.stringify(res, null, 2));
      return pool.end();
    })
    .catch((err) => {
      console.error("Re-encryption failed:", err.message);
      pool.end().finally(() => process.exit(1));
    });
}
