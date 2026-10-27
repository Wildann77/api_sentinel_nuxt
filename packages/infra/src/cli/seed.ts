import { eq } from "drizzle-orm";
import {
  formatNotificationConfigAad,
  LibsodiumAeadCipherAdapter,
} from "../crypto/libsodium-aead-cipher.adapter.js";
import { NodeArgon2HasherAdapter } from "../crypto/node-argon2-hasher.adapter.js";
import { closePgPool, createDrizzleDb, createPgPool } from "../db/connection.js";
import { ensureCheckResultsPartitions } from "../db/partitions.js";
import {
  checkResults,
  type failureCategoryEnum,
  incidents,
  monitorMetricsHourly,
  monitors,
  notificationConfigs,
  notificationDeliveries,
} from "../db/schema/index.js";
import { DrizzleUserRepository } from "../repositories/drizzle-user-repository.js";
import { UuidV7GeneratorAdapter } from "../services/uuid-v7-generator.adapter.js";

const idGen = new UuidV7GeneratorAdapter();

type FailureCategoryType = (typeof failureCategoryEnum.enumValues)[number];

function genId(): string {
  return idGen.generate();
}

export async function runSeed(databaseUrl?: string): Promise<void> {
  const dbUrl =
    databaseUrl ||
    process.env.DATABASE_URL ||
    "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel_dev";
  console.log(`[SEED] Connecting to: ${dbUrl}`);

  const pool = createPgPool({
    connectionString: dbUrl,
    max: 2,
    applicationName: "api_sentinel_seeder",
  });
  const db = createDrizzleDb(pool);
  const hasher = new NodeArgon2HasherAdapter();
  const cipher = new LibsodiumAeadCipherAdapter();

  try {
    // 1. Ensure Partitions for check_results
    console.log("[SEED] Ensuring partitions for check_results...");
    await ensureCheckResultsPartitions(pool, 2);

    // 2. Ensure Owner Account (admin / admin123)
    const userRepo = new DrizzleUserRepository(db);
    const existingOwner = await userRepo.getOwner();
    let ownerId = existingOwner?.id;
    if (!existingOwner) {
      console.log("[SEED] Creating owner user: admin / admin123");
      ownerId = idGen.generate();
      const passwordHash = await hasher.hash("admin123");
      const now = new Date();
      await userRepo.createOwner({
        id: ownerId,
        username: "admin",
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      console.log(
        `[SEED] Owner user already exists: ${existingOwner.username} (${existingOwner.id})`,
      );
    }

    // 3. Clear existing telemetry data for a fresh clean preview
    console.log("[SEED] Cleaning previous monitoring fixtures...");
    await db.delete(notificationDeliveries);
    await db.delete(checkResults);
    await db.delete(incidents);
    await db.delete(monitorMetricsHourly);
    await db.delete(monitors);
    await db.delete(notificationConfigs);

    // 4. Create Notification Config (Telegram Bot)
    console.log("[SEED] Configuring Telegram integration with AEAD encryption...");
    const configId = genId();
    const mockBotToken = "7123456789:AAFluffTestBotToken_SecretVault1234567";
    const aad = formatNotificationConfigAad(configId, "botToken");
    const encryptedBotToken = await cipher.encrypt(mockBotToken, aad);

    await db.insert(notificationConfigs).values({
      id: configId,
      channel: "TELEGRAM",
      chatId: "-1001982736450",
      encryptedBotToken,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 5. Create Monitors (6 Distinct Archetypes)
    console.log("[SEED] Inserting 6 monitors...");
    const now = new Date();

    const m1Id = genId();
    const m2Id = genId();
    const m3Id = genId();
    const m4Id = genId();
    const m5Id = genId();
    const m6Id = genId();

    const inc1Id = genId(); // Open incident on m4
    const inc2Id = genId(); // Recovering incident on m5

    await db.insert(monitors).values([
      {
        id: m1Id,
        name: "Production Auth Gateway",
        url: "https://auth.sentinel.dev/v1/health",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
        healthStatus: "UP",
        consecutiveSuccesses: 45,
        consecutiveFailures: 0,
        assertionRules: [{ type: "status", operator: "equals", expected: 200 }],
        lastCheckedAt: new Date(now.getTime() - 30 * 1000),
        nextRunAt: new Date(now.getTime() + 30 * 1000),
      },
      {
        id: m2Id,
        name: "Stripe Payment Gateway Webhook",
        url: "https://billing.sentinel.dev/webhooks/stripe",
        method: "POST",
        intervalSeconds: 120,
        timeoutMs: 8000,
        isActive: true,
        healthStatus: "UP",
        consecutiveSuccesses: 22,
        consecutiveFailures: 0,
        assertionRules: [{ type: "status", operator: "equals", expected: 200 }],
        lastCheckedAt: new Date(now.getTime() - 45 * 1000),
        nextRunAt: new Date(now.getTime() + 75 * 1000),
      },
      {
        id: m3Id,
        name: "Order Processing Service",
        url: "https://orders.sentinel.dev/api/v2/jobs",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
        healthStatus: "DEGRADED",
        consecutiveSuccesses: 0,
        consecutiveFailures: 1, // 1 failure -> DEGRADED (PRD §4.14)
        assertionRules: [{ type: "status", operator: "equals", expected: 200 }],
        lastCheckedAt: new Date(now.getTime() - 20 * 1000),
        nextRunAt: new Date(now.getTime() + 40 * 1000),
      },
      {
        id: m4Id,
        name: "Legacy Warehouse Inventory API",
        url: "https://warehouse.internal.sentinel.dev/stock/query",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
        healthStatus: "DOWN",
        consecutiveSuccesses: 0,
        consecutiveFailures: 5,
        currentIncidentId: null,
        assertionRules: [{ type: "status", operator: "equals", expected: 200 }],
        lastCheckedAt: new Date(now.getTime() - 10 * 1000),
        nextRunAt: new Date(now.getTime() + 50 * 1000),
      },
      {
        id: m5Id,
        name: "Customer Analytics Stream Worker",
        url: "https://analytics.internal.sentinel.dev/heartbeat",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 10000,
        isActive: true,
        healthStatus: "DOWN",
        consecutiveSuccesses: 1, // 1 success during open incident -> RECOVERING!
        consecutiveFailures: 3,
        currentIncidentId: null,
        assertionRules: [{ type: "status", operator: "equals", expected: 200 }],
        lastCheckedAt: new Date(now.getTime() - 15 * 1000),
        nextRunAt: new Date(now.getTime() + 45 * 1000),
      },
      {
        id: m6Id,
        name: "Third-Party Logistics Partner API",
        url: "https://api.partnerlogistics.example.com/v1/shipments",
        method: "GET",
        intervalSeconds: 300,
        timeoutMs: 10000,
        isActive: false, // PAUSED
        healthStatus: "PAUSED",
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        assertionRules: [{ type: "status", operator: "equals", expected: 200 }],
        lastCheckedAt: new Date(now.getTime() - 1200 * 1000),
        nextRunAt: new Date(now.getTime() + 86400 * 1000),
      },
    ]);

    // 6. Create Incidents (Open, Recovering, and Resolved)
    console.log("[SEED] Inserting incidents (OPEN, RECOVERING, RESOLVED)...");
    const inc3Id = genId(); // Resolved on m1
    const inc4Id = genId(); // Resolved on m2

    await db.insert(incidents).values([
      // Active OPEN Incident on m4
      {
        id: inc1Id,
        monitorId: m4Id,
        startedAt: new Date(now.getTime() - 14 * 60 * 1000 - 22 * 1000), // ~14m 22s ago
        recoveredAt: null,
        durationSeconds: null,
        causeCategory: "HTTP_STATUS_MISMATCH",
        initialErrorMessage:
          "HTTP 504 Gateway Timeout: Upstream database connection pool exhausted",
        failureCount: 5,
        isResolved: false,
        createdAt: new Date(now.getTime() - 14 * 60 * 1000 - 22 * 1000),
        updatedAt: now,
      },
      // Active RECOVERING Incident on m5 (1/2 recovery check pass)
      {
        id: inc2Id,
        monitorId: m5Id,
        startedAt: new Date(now.getTime() - 32 * 60 * 1000 - 10 * 1000), // ~32m ago
        recoveredAt: null,
        durationSeconds: null,
        causeCategory: "CONNECTION_TIMEOUT",
        initialErrorMessage:
          "Connection timeout: Failed to connect to analytics-worker within 10000ms",
        failureCount: 4,
        isResolved: false,
        createdAt: new Date(now.getTime() - 32 * 60 * 1000 - 10 * 1000),
        updatedAt: now,
      },
      // Historic RESOLVED Incident on m1
      {
        id: inc3Id,
        monitorId: m1Id,
        startedAt: new Date(now.getTime() - 48 * 3600 * 1000),
        recoveredAt: new Date(now.getTime() - 48 * 3600 * 1000 + 1122 * 1000),
        durationSeconds: 1122, // 18m 42s
        causeCategory: "RESPONSE_SIZE_EXCEEDED",
        initialErrorMessage: "Response payload size 2.8 MB exceeded safety threshold of 2.0 MB",
        failureCount: 4,
        isResolved: true,
        createdAt: new Date(now.getTime() - 48 * 3600 * 1000),
        updatedAt: new Date(now.getTime() - 48 * 3600 * 1000 + 1122 * 1000),
      },
      // Historic RESOLVED Incident on m2
      {
        id: inc4Id,
        monitorId: m2Id,
        startedAt: new Date(now.getTime() - 5 * 3600 * 1000),
        recoveredAt: new Date(now.getTime() - 5 * 3600 * 1000 + 312 * 1000),
        durationSeconds: 312, // 5m 12s
        causeCategory: "HEADER_ASSERTION_FAILED",
        initialErrorMessage:
          "Header assertion failed: X-Signature-Verified expected 'true' but got 'false'",
        failureCount: 3,
        isResolved: true,
        createdAt: new Date(now.getTime() - 5 * 3600 * 1000),
        updatedAt: new Date(now.getTime() - 5 * 3600 * 1000 + 312 * 1000),
      },
    ]);

    // 6.5. Update current_incident_id on m4 and m5
    await db.update(monitors).set({ currentIncidentId: inc1Id }).where(eq(monitors.id, m4Id));
    await db.update(monitors).set({ currentIncidentId: inc2Id }).where(eq(monitors.id, m5Id));

    // 7. Insert Notification Deliveries
    console.log("[SEED] Inserting notification delivery logs...");
    await db.insert(notificationDeliveries).values([
      // inc1: 1 sent
      {
        id: genId(),
        incidentId: inc1Id,
        channel: "TELEGRAM",
        notificationType: "INCIDENT_OPENED",
        status: "SENT",
        retryCount: 0,
        lastAttemptAt: new Date(now.getTime() - 14 * 60 * 1000),
        safeErrorSummary: null,
      },
      // inc2: 1 sent
      {
        id: genId(),
        incidentId: inc2Id,
        channel: "TELEGRAM",
        notificationType: "INCIDENT_OPENED",
        status: "SENT",
        retryCount: 0,
        lastAttemptAt: new Date(now.getTime() - 32 * 60 * 1000),
        safeErrorSummary: null,
      },
      // inc3: 2 sent (Opened + Recovered)
      {
        id: genId(),
        incidentId: inc3Id,
        channel: "TELEGRAM",
        notificationType: "INCIDENT_OPENED",
        status: "SENT",
        retryCount: 0,
        lastAttemptAt: new Date(now.getTime() - 48 * 3600 * 1000),
        safeErrorSummary: null,
      },
      {
        id: genId(),
        incidentId: inc3Id,
        channel: "TELEGRAM",
        notificationType: "INCIDENT_RECOVERED",
        status: "SENT",
        retryCount: 0,
        lastAttemptAt: new Date(now.getTime() - 48 * 3600 * 1000 + 1122 * 1000),
        safeErrorSummary: null,
      },
      // inc4: 2 sent
      {
        id: genId(),
        incidentId: inc4Id,
        channel: "TELEGRAM",
        notificationType: "INCIDENT_OPENED",
        status: "SENT",
        retryCount: 0,
        lastAttemptAt: new Date(now.getTime() - 5 * 3600 * 1000),
        safeErrorSummary: null,
      },
      {
        id: genId(),
        incidentId: inc4Id,
        channel: "TELEGRAM",
        notificationType: "INCIDENT_RECOVERED",
        status: "SENT",
        retryCount: 0,
        lastAttemptAt: new Date(now.getTime() - 5 * 3600 * 1000 + 312 * 1000),
        safeErrorSummary: null,
      },
    ]);

    // 8. Insert Check Results Telemetry (20 checks per monitor)
    console.log("[SEED] Inserting check results telemetry...");
    const checkInserts = [];

    const monitorConfigs: {
      id: string;
      isUp: boolean;
      baseLatency: number;
      failCategory: FailureCategoryType | null;
      statusCode: number;
      incidentId?: string;
    }[] = [
      { id: m1Id, isUp: true, baseLatency: 55, failCategory: null, statusCode: 200 },
      { id: m2Id, isUp: true, baseLatency: 110, failCategory: null, statusCode: 200 },
      {
        id: m3Id,
        isUp: false,
        baseLatency: 80,
        failCategory: "HTTP_STATUS_MISMATCH" as const,
        statusCode: 500,
      },
      {
        id: m4Id,
        isUp: false,
        baseLatency: 5000,
        failCategory: "HTTP_STATUS_MISMATCH" as const,
        statusCode: 504,
        incidentId: inc1Id,
      },
      {
        id: m5Id,
        isUp: true,
        baseLatency: 140,
        failCategory: null,
        statusCode: 200,
        incidentId: inc2Id,
      },
      { id: m6Id, isUp: true, baseLatency: 95, failCategory: null, statusCode: 200 },
    ];

    for (const mon of monitorConfigs) {
      for (let i = 0; i < 20; i++) {
        const timeOffsetMs = (20 - i) * 60 * 1000;
        const executedAt = new Date(now.getTime() - timeOffsetMs);
        const startedAt = new Date(executedAt.getTime() - 80);
        const finishedAt = executedAt;

        // Add small jitter
        const jitter = Math.floor(Math.random() * 30) - 15;
        const durationMs = Math.max(20, mon.baseLatency + jitter);

        // For m5 (recovering), make last check success, earlier checks fail
        let isSuccess = mon.isUp;
        let statusCode = mon.statusCode;
        let failCat = mon.failCategory;

        if (mon.id === m5Id) {
          if (i === 19) {
            isSuccess = true;
            statusCode = 200;
            failCat = null;
          } else {
            isSuccess = false;
            statusCode = 504;
            failCat = "CONNECTION_TIMEOUT" as const;
          }
        }

        checkInserts.push({
          id: genId(),
          monitorId: mon.id,
          incidentId: !isSuccess ? mon.incidentId : null,
          triggerType: "SCHEDULED" as const,
          scheduledFor: startedAt,
          startedAt,
          finishedAt,
          executedAt,
          durationMs,
          isSuccess,
          statusCode,
          failureCategory: failCat,
          pinnedIp: "93.184.216.34",
          assertionResults: isSuccess
            ? [{ rule: "STATUS_200", passed: true, message: "HTTP status 200 matched" }]
            : [
                {
                  rule: "STATUS_200",
                  passed: false,
                  message: `Expected 200 but received ${statusCode}`,
                },
              ],
          diagnostics: {
            resolvedIps: ["93.184.216.34"],
            responseHeaders: {
              "content-type": "application/json",
              server: "envoy",
              "x-request-id": genId(),
            },
            responseBodySnippet: isSuccess
              ? '{"status":"ok","uptime":99.98}'
              : '{"error":"service_unavailable","message":"Upstream timeout"}',
          },
          sanitizedDiagnostic: isSuccess ? null : `Status check failed with code ${statusCode}`,
          createdAt: executedAt,
        });
      }
    }

    await db.insert(checkResults).values(checkInserts);

    // 9. Insert Hourly Metrics Rollup (Last 24 Hours)
    console.log("[SEED] Inserting hourly rollup metrics...");
    const hourlyInserts = [];
    for (const mon of monitorConfigs) {
      for (let h = 0; h < 24; h++) {
        const bucket = new Date(now.getTime() - (24 - h) * 3600 * 1000);
        bucket.setMinutes(0, 0, 0);

        const totalChecks = 60;
        let successChecks = 60;
        if (mon.id === m4Id) {
          successChecks = h < 20 ? 60 : 0; // Down in last 4 hours
        } else if (mon.id === m5Id) {
          successChecks = h < 22 ? 60 : 1; // Down in last 2 hours
        } else if (mon.id === m3Id) {
          successChecks = 58;
        }

        hourlyInserts.push({
          monitorId: mon.id,
          bucket,
          totalChecks,
          successChecks,
          avgLatencyMs: mon.baseLatency,
          p95LatencyMs: Math.round(mon.baseLatency * 1.4),
          p99LatencyMs: Math.round(mon.baseLatency * 1.8),
        });
      }
    }
    await db.insert(monitorMetricsHourly).values(hourlyInserts);

    console.log("[SEED] COMPLETE! Successfully seeded database with rich test data.");
  } finally {
    await closePgPool(pool);
  }
}

if (import.meta.main || process.argv[1]?.endsWith("seed.ts")) {
  runSeed()
    .then(() => {
      console.log("[SEED] Done.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[SEED] Error:", err);
      process.exit(1);
    });
}
