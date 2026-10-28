import { FailureCategory, TriggerType, UUIDv7 } from "@sentinel/domain";
import { describe, expect, it } from "vitest";
import {
  CheckResultMapper,
  IncidentMapper,
  MonitorMapper,
  NotificationMapper,
  SessionMapper,
  UserMapper,
} from "../src/repositories/mappers/index.js";

const VALID_ENC_SECRET = `v1:k1:${"0".repeat(48)}:${"a".repeat(32)}`;

describe("Infra Mappers Unit Tests — Exhaustive Branch Coverage", () => {
  describe("MonitorMapper", () => {
    it("maps row with all fields present to domain entity and back to insert", () => {
      const monId = "01940000-0000-7000-8000-000000000010";
      const incId = "01940000-0000-7000-8000-000000000011";
      const now = new Date();

      const row: Parameters<typeof MonitorMapper.toDomain>[0] = {
        id: monId,
        name: "Test API",
        url: "https://api.example.com",
        method: "GET",
        encryptedHeaders: VALID_ENC_SECRET,
        headerKeys: ["x-custom-key"],
        encryptedBody: VALID_ENC_SECRET,
        encryptedAuthConfig: VALID_ENC_SECRET,
        authType: "BEARER",
        assertionRules: [{ type: "status", operator: "equals", expected: 200 }],
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
        healthStatus: "UP",
        consecutiveFailures: 0,
        consecutiveSuccesses: 5,
        currentIncidentId: incId,
        version: 2,
        lastCheckedAt: now,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const domain = MonitorMapper.toDomain(row);
      expect(domain.id.toString()).toBe(monId);
      expect(domain.name).toBe("Test API");
      expect(domain.encryptedHeaders?.toString()).toBe(VALID_ENC_SECRET);
      expect(domain.encryptedBody?.toString()).toBe(VALID_ENC_SECRET);
      expect(domain.encryptedAuthConfig?.toString()).toBe(VALID_ENC_SECRET);
      expect(domain.authType).toBe("BEARER");
      expect(domain.assertionRules.length).toBe(1);
      expect(domain.currentIncidentId?.toString()).toBe(incId);

      const insert = MonitorMapper.toInsert(domain);
      expect(insert.id).toBe(monId);
      expect(insert.encryptedHeaders).toBe(VALID_ENC_SECRET);
      expect(insert.encryptedBody).toBe(VALID_ENC_SECRET);
      expect(insert.encryptedAuthConfig).toBe(VALID_ENC_SECRET);
      expect(insert.currentIncidentId).toBe(incId);
      expect(insert.headerKeys).toEqual(["x-custom-key"]);
    });

    it("maps row with null optional fields to domain entity and back to insert", () => {
      const monId = "01940000-0000-7000-8000-000000000020";
      const now = new Date();

      const row: Parameters<typeof MonitorMapper.toDomain>[0] = {
        id: monId,
        name: "Minimal API",
        url: "https://min.example.com",
        method: "POST",
        encryptedHeaders: null,
        headerKeys: null,
        encryptedBody: null,
        encryptedAuthConfig: null,
        authType: null,
        assertionRules: null as unknown as [], // Test non-array branch
        intervalSeconds: 60,
        timeoutMs: 3000,
        isActive: false,
        healthStatus: "UNKNOWN",
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        currentIncidentId: null,
        version: 1,
        lastCheckedAt: null,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const domain = MonitorMapper.toDomain(row);
      expect(domain.encryptedHeaders).toBeNull();
      expect(domain.encryptedBody).toBeNull();
      expect(domain.encryptedAuthConfig).toBeNull();
      expect(domain.authType).toBe("NONE");
      expect(domain.assertionRules).toEqual([]);
      expect(domain.headerKeys).toEqual([]);
      expect(domain.currentIncidentId).toBeNull();

      const insert = MonitorMapper.toInsert(domain);
      expect(insert.encryptedHeaders).toBeNull();
      expect(insert.encryptedBody).toBeNull();
      expect(insert.encryptedAuthConfig).toBeNull();
      expect(insert.currentIncidentId).toBeNull();
    });
  });

  describe("CheckResultMapper", () => {
    it("maps row with all fields to domain and back to insert", () => {
      const cId = "01940000-0000-7000-8000-000000000030";
      const mId = "01940000-0000-7000-8000-000000000031";
      const incId = "01940000-0000-7000-8000-000000000032";
      const now = new Date();

      const row: Parameters<typeof CheckResultMapper.toDomain>[0] = {
        id: cId,
        monitorId: mId,
        incidentId: incId,
        triggerType: "SCHEDULED",
        scheduledFor: now,
        startedAt: now,
        finishedAt: now,
        durationMs: 120.4,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
        assertionResults: [{ ruleType: "status", status: "PASS", message: "200 OK" }],
        sanitizedDiagnostic: null,
        correlationId: "01940000-0000-7000-8000-000000000099",
        pinnedIp: "93.184.216.34",
        createdAt: now,
      };

      const domain = CheckResultMapper.toDomain(row);
      expect(domain.id.toString()).toBe(cId);
      expect(domain.incidentId?.toString()).toBe(incId);
      expect(domain.durationMs).toBe(120.4);
      expect(domain.assertionResults.length).toBe(1);

      const insert = CheckResultMapper.toInsert(domain);
      expect(insert.id).toBe(cId);
      expect(insert.durationMs).toBe(120);
      expect(insert.correlationId).toBe("01940000-0000-7000-8000-000000000099");
    });

    it("maps row with fallback/null branches to domain and back to insert", () => {
      const cId = "01940000-0000-7000-8000-000000000040";
      const mId = "01940000-0000-7000-8000-000000000041";
      const now = new Date();

      const row: Parameters<typeof CheckResultMapper.toDomain>[0] = {
        id: cId,
        monitorId: mId,
        incidentId: null,
        triggerType: "MANUAL",
        scheduledFor: null,
        startedAt: now,
        finishedAt: null, // Fallback to startedAt
        durationMs: null, // Fallback to 0 in toInsert
        isSuccess: false,
        statusCode: 504,
        failureCategory: FailureCategory.CONNECTION_TIMEOUT,
        assertionResults: "not-an-array", // Fallback to []
        sanitizedDiagnostic: "Gateway timeout",
        correlationId: null, // Fallback to row.id
        pinnedIp: null,
        createdAt: now,
      };

      const domain = CheckResultMapper.toDomain(row);
      expect(domain.incidentId).toBeNull();
      expect(domain.finishedAt).toEqual(now);
      expect(domain.assertionResults).toEqual([]);
      expect(domain.correlationId).toBe(cId);
      expect(domain.failureCategory).toBe(FailureCategory.CONNECTION_TIMEOUT);

      // Create CheckResult with non-UUID correlationId to test fallback in toInsert
      const nonUuidCheck = new (domain.constructor as new (props: unknown) => CheckResult)({
        id: new UUIDv7(cId),
        monitorId: new UUIDv7(mId),
        incidentId: null,
        triggerType: TriggerType.MANUAL,
        scheduledFor: null,
        startedAt: now,
        finishedAt: now,
        durationMs: null,
        isSuccess: false,
        statusCode: 504,
        failureCategory: FailureCategory.CONNECTION_TIMEOUT,
        assertionResults: [],
        diagnostic: "err",
        correlationId: "not-a-valid-uuid",
      });

      const insert = CheckResultMapper.toInsert(nonUuidCheck);
      expect(insert.durationMs).toBe(0);
      expect(insert.correlationId).toBe(cId); // Falls back to checkResult.id
      expect(insert.incidentId).toBeNull();
    });
  });

  describe("IncidentMapper", () => {
    it("maps incident row to domain and back to insert", () => {
      const incId = "01940000-0000-7000-8000-000000000050";
      const monId = "01940000-0000-7000-8000-000000000051";
      const now = new Date();

      const row: Parameters<typeof IncidentMapper.toDomain>[0] = {
        id: incId,
        monitorId: monId,
        startedAt: now,
        recoveredAt: now,
        durationSeconds: 15,
        causeCategory: FailureCategory.HTTP_STATUS_MISMATCH,
        initialErrorMessage: "Status 500 error",
        failureCount: 3,
        isResolved: true,
      };

      const domain = IncidentMapper.toDomain(row);
      expect(domain.id.toString()).toBe(incId);
      expect(domain.isResolved).toBe(true);

      const insert = IncidentMapper.toInsert(domain);
      expect(insert.id).toBe(incId);
      expect(insert.isResolved).toBe(true);
    });
  });

  describe("NotificationMapper", () => {
    it("maps telegram config and delivery data back and forth", () => {
      const rowConfig: Parameters<typeof NotificationMapper.toTelegramConfig>[0] = {
        id: "cfg-1",
        encryptedBotToken: "enc-token",
        chatId: "123456",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const configData = NotificationMapper.toTelegramConfig(rowConfig);
      expect(configData.chatId).toBe("123456");

      const configInsert = NotificationMapper.toTelegramConfigInsert(configData);
      expect(configInsert.channel).toBe("TELEGRAM");
      expect(configInsert.isActive).toBe(true);

      const rowDelivery: Parameters<typeof NotificationMapper.toDeliveryData>[0] = {
        id: "del-1",
        incidentId: "inc-1",
        channel: "TELEGRAM",
        status: "DELIVERED",
        retryCount: 2,
        lastAttemptAt: new Date(),
        safeErrorSummary: null,
        createdAt: new Date(),
      };
      const deliveryData = NotificationMapper.toDeliveryData(rowDelivery);
      expect(deliveryData.attemptCount).toBe(2);
      expect(deliveryData.status).toBe("DELIVERED");

      const deliveryInsert = NotificationMapper.toDeliveryInsert(
        deliveryData,
        "INCIDENT_RECOVERED",
      );
      expect(deliveryInsert.notificationType).toBe("INCIDENT_RECOVERED");
      expect(deliveryInsert.retryCount).toBe(2);
    });
  });

  describe("UserMapper & SessionMapper", () => {
    it("maps user and session back and forth", () => {
      const now = new Date();
      const userRow: Parameters<typeof UserMapper.toDomain>[0] = {
        id: "usr-1",
        username: "admin",
        passwordHash: "argon2id$...",
        createdAt: now,
        updatedAt: now,
      };
      const userDomain = UserMapper.toDomain(userRow);
      expect(userDomain.username).toBe("admin");

      const userInsert = UserMapper.toInsert(userDomain);
      expect(userInsert.username).toBe("admin");

      const sessionRow: Parameters<typeof SessionMapper.toDomain>[0] = {
        id: "sess-1",
        userId: "usr-1",
        tokenHash: "token-hash-123",
        idleExpiresAt: new Date(now.getTime() + 1800000),
        absoluteExpiresAt: new Date(now.getTime() + 86400000),
        lastActiveAt: now,
        createdAt: now,
      };
      const sessionDomain = SessionMapper.toDomain(sessionRow);
      expect(sessionDomain.userId).toBe("usr-1");
      expect(sessionDomain.tokenHash).toBe("token-hash-123");

      const sessionInsert = SessionMapper.toInsert(sessionDomain, "sess-1");
      expect(sessionInsert.id).toBe("sess-1");
      expect(sessionInsert.userId).toBe("usr-1");
    });
  });
});
