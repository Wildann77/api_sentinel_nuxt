import {
  CheckDetailSchema,
  CheckResultSchema,
  IncidentSchema,
  MonitorResponseSchema,
} from "@sentinel/contracts";
import {
  AssertionRule,
  CheckResult,
  EndpointUrl,
  FailureCategory,
  HealthStatus,
  HttpMethod,
  Incident,
  Monitor,
  TriggerType,
  UUIDv7,
} from "@sentinel/domain";
import { describe, expect, it } from "vitest";
import {
  toCheckDetailDto,
  toCheckResultDto,
  toIncidentDto,
  toMonitorResponseDto,
} from "../src/mappers/index.js";
import {
  formatDowntimeDuration,
  formatDowntimeStopwatch,
  formatLatency,
  formatUptimePercentage,
  getHealthStatusColorToken,
  toPresentationHealthStatus,
} from "../src/presenters/index.js";

describe("P3.5 — Presenter & Mapper", () => {
  describe("Monitor Mapper & Zero-Leak Assurance (P3.5 DoD Gate)", () => {
    it("maps Monitor to MonitorResponseDto without leaking secrets", () => {
      const monitor = new Monitor({
        id: new UUIDv7("018f0000-0000-7000-8000-000000000001"),
        name: "Auth Service",
        url: new EndpointUrl("https://auth.example.com/oauth/token"),
        method: HttpMethod.POST,
        intervalSeconds: 120,
        timeoutMs: 8000,
        encryptedHeaders: {
          cipherText: "v1:super_secret_cipher_headers_payload",
          keyId: "k1",
          algorithm: "xchacha20poly1305_ietf",
        },
        headerKeys: ["Authorization", "X-Client-Id"],
        encryptedBody: {
          cipherText: "v1:super_secret_body_with_client_secret",
          keyId: "k1",
          algorithm: "xchacha20poly1305_ietf",
        },
        encryptedAuthConfig: {
          cipherText: "v1:super_secret_bearer_token",
          keyId: "k1",
          algorithm: "xchacha20poly1305_ietf",
        },
        authType: "BEARER",
        assertionRules: [
          new AssertionRule({
            type: "status",
            operator: "equals",
            expected: 200,
          }),
        ],
        nextRunAt: new Date("2026-10-23T14:00:00.000Z"),
        createdAt: undefined,
      });

      const dto = toMonitorResponseDto(monitor, {
        sparkline: [
          { durationMs: 42, timestamp: "2026-10-23T13:58:00.000Z" },
          { durationMs: 45, timestamp: "2026-10-23T13:59:00.000Z" },
        ],
        createdAt: "2026-10-23T10:00:00.000Z",
        updatedAt: "2026-10-23T12:00:00.000Z",
      });

      // Strict Zero-Leak assertions
      expect(dto).not.toHaveProperty("encryptedHeaders");
      expect(dto).not.toHaveProperty("encryptedBody");
      expect(dto).not.toHaveProperty("encryptedAuthConfig");
      expect(dto).not.toHaveProperty("assertionRules");

      const stringified = JSON.stringify(dto);
      expect(stringified).not.toContain("super_secret_cipher_headers_payload");
      expect(stringified).not.toContain("super_secret_body_with_client_secret");
      expect(stringified).not.toContain("super_secret_bearer_token");

      // Validates against official Zod Contract Schema
      const validation = MonitorResponseSchema.safeParse(dto);
      expect(validation.success).toBe(true);

      // Asserts public metadata fields
      expect(dto.headerKeys).toEqual(["Authorization", "X-Client-Id"]);
      expect(dto.authType).toBe("BEARER");
      expect(dto.sparkline).toHaveLength(2);
      expect(dto.name).toBe("Auth Service");
    });
  });

  describe("Incident & Check Mappers", () => {
    it("maps Incident to IncidentDto", () => {
      const incidentId = new UUIDv7("018f0000-0000-7000-8000-000000000002");
      const monitorId = new UUIDv7("018f0000-0000-7000-8000-000000000001");
      const incident = Incident.open(
        incidentId,
        monitorId,
        FailureCategory.TLS_HANDSHAKE_FAILED,
        "Self-signed certificate in chain",
        new Date("2026-10-23T08:00:00.000Z"),
      );

      const dto = toIncidentDto(incident, {
        monitorName: "Internal Gateway",
        notificationDeliveries: [
          {
            id: "018f0000-0000-7000-8000-000000000003",
            channel: "TELEGRAM",
            status: "SENT",
            attemptCount: 1,
            lastAttemptAt: "2026-10-23T08:00:05.000Z",
            lastError: null,
          },
        ],
      });

      expect(dto.monitorName).toBe("Internal Gateway");
      expect(dto.openedAt).toBe("2026-10-23T08:00:00.000Z");
      expect(dto.resolvedAt).toBeNull();
      expect(dto.lastFailureCategory).toBe("TLS_HANDSHAKE_FAILED");
      expect(dto.notificationDeliveries).toHaveLength(1);

      const parsed = IncidentSchema.safeParse(dto);
      expect(parsed.success).toBe(true);
    });

    it("maps CheckResult to CheckResultDto and CheckDetailDto", () => {
      const checkId = new UUIDv7("018f0000-0000-7000-8000-000000000004");
      const monitorId = new UUIDv7("018f0000-0000-7000-8000-000000000001");
      const check = new CheckResult({
        id: checkId,
        monitorId,
        incidentId: null,
        triggerType: TriggerType.SCHEDULED,
        scheduledFor: new Date("2026-10-23T09:00:00.000Z"),
        startedAt: new Date("2026-10-23T09:00:00.100Z"),
        finishedAt: new Date("2026-10-23T09:00:00.150Z"),
        durationMs: 50,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
        assertionResults: [],
        correlationId: "trace-999",
        pinnedIp: "104.21.55.2",
      });

      const resultDto = toCheckResultDto(check);
      expect(resultDto.status).toBe("UP");
      expect(resultDto.latencyMs).toBe(50);
      expect(CheckResultSchema.safeParse(resultDto).success).toBe(true);

      const detailDto = toCheckDetailDto(check, {
        dnsDurationMs: 10,
        connectDurationMs: 15,
        tlsDurationMs: 20,
        firstByteDurationMs: 5,
        requestHeaders: { accept: "application/json" },
        responseHeaders: { "content-type": "application/json" },
        responseBodySnippet: '{"ok":true}',
      });

      expect(detailDto.diagnostics.pinnedIp).toBe("104.21.55.2");
      expect(detailDto.diagnostics.dnsDurationMs).toBe(10);
      expect(detailDto.diagnostics.responseBodySnippet).toBe('{"ok":true}');
      expect(CheckDetailSchema.safeParse(detailDto).success).toBe(true);
    });
  });

  describe("Presentation Health Status & RECOVERING logic (DES §3.2 / §5.6)", () => {
    it("maps UP to [OPERATIONAL]", () => {
      expect(toPresentationHealthStatus(HealthStatus.UP)).toBe("[OPERATIONAL]");
      expect(getHealthStatusColorToken("[OPERATIONAL]")).toBe("status-operational");
    });

    it("maps DOWN with 1 consecutive success to derived [RECOVERING] status", () => {
      // Monitor is DOWN but has 1 consecutive success (waiting for second success to recover)
      expect(toPresentationHealthStatus(HealthStatus.DOWN, 1)).toBe("[RECOVERING]");
      expect(getHealthStatusColorToken("[RECOVERING]")).toBe("status-recovering");
    });

    it("maps DOWN with 0 consecutive successes to [DOWN]", () => {
      expect(toPresentationHealthStatus(HealthStatus.DOWN, 0)).toBe("[DOWN]");
      expect(getHealthStatusColorToken("[DOWN]")).toBe("status-down");
    });

    it("maps DEGRADED, PAUSED, and UNKNOWN to their respective bracketed terminal tokens", () => {
      expect(toPresentationHealthStatus(HealthStatus.DEGRADED)).toBe("[DEGRADED]");
      expect(getHealthStatusColorToken("[DEGRADED]")).toBe("status-degraded");

      expect(toPresentationHealthStatus(HealthStatus.PAUSED)).toBe("[PAUSED]");
      expect(getHealthStatusColorToken("[PAUSED]")).toBe("status-paused");

      expect(toPresentationHealthStatus(HealthStatus.UNKNOWN)).toBe("[UNKNOWN]");
      expect(getHealthStatusColorToken("[UNKNOWN]")).toBe("neutral");
    });
  });

  describe("Metrics Presenter & Formatters (PRD §4.11 / DES §1)", () => {
    it("formats null uptime as 'N/A' and never as 0 or 100%", () => {
      expect(formatUptimePercentage(null)).toBe("N/A");
      expect(formatUptimePercentage(undefined as unknown as null)).toBe("N/A");
      expect(formatUptimePercentage(99.95)).toBe("99.95%");
      expect(formatUptimePercentage(100)).toBe("100.00%");
      expect(formatUptimePercentage(0)).toBe("0.00%");
    });

    it("formats null latency as 'N/A' and numeric latency as integer ms", () => {
      expect(formatLatency(null)).toBe("N/A");
      expect(formatLatency(42.3)).toBe("42ms");
      expect(formatLatency(5000)).toBe("5000ms");
    });

    it("formats downtime duration cleanly for terminal display", () => {
      expect(formatDowntimeDuration(null)).toBe("N/A");
      expect(formatDowntimeDuration(45)).toBe("45s");
      expect(formatDowntimeDuration(1122)).toBe("18m 42s");
      expect(formatDowntimeDuration(7325)).toBe("2h 02m 05s");
    });

    it("formats downtime stopwatch into HH:MM:SS format", () => {
      expect(formatDowntimeStopwatch(862)).toBe("00:14:22");
      expect(formatDowntimeStopwatch(3665)).toBe("01:01:05");
    });
  });
});
