import { describe, expect, it } from "vitest";
import {
  CheckCompletedEventSchema,
  IncidentTransitionEventSchema,
  ReportExportQuerySchema,
  SentinelNotifyPayloadSchema,
  TelegramSettingsResponseSchema,
  UpdateTelegramSettingsRequestSchema,
} from "../src/index.js";

describe("Settings, Reports, and Events Schemas", () => {
  describe("Telegram Settings", () => {
    it("validates Telegram settings response without secret token", () => {
      const result = TelegramSettingsResponseSchema.safeParse({
        configured: true,
        chatId: "-1001234567890",
        updatedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it("validates Telegram update with valid bot token format", () => {
      const valid = UpdateTelegramSettingsRequestSchema.safeParse({
        botToken: "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ_1234567",
        chatId: "987654321",
      });
      expect(valid.success).toBe(true);

      const invalid = UpdateTelegramSettingsRequestSchema.safeParse({
        botToken: "invalid-token-without-colon",
        chatId: "987654321",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("Reports Export Query (D-18)", () => {
    it("validates report query with valid UTC datetime", () => {
      const result = ReportExportQuerySchema.safeParse({
        type: "checks",
        monitorId: "0192e21b-8a21-7000-8b1a-98df76123456",
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-23T00:00:00.000Z",
      });
      expect(result.success).toBe(true);
    });

    it("rejects non-ISO UTC datetime string", () => {
      const result = ReportExportQuerySchema.safeParse({
        type: "checks",
        from: "2026-10-01",
        to: "yesterday",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("WebSocket & PostgreSQL NOTIFY Events (ARCH §9.4)", () => {
    it("validates CHECK_COMPLETED event payload", () => {
      const result = CheckCompletedEventSchema.safeParse({
        event: "CHECK_COMPLETED",
        monitorId: "0192e21b-8a21-7000-8b1a-98df76123456",
        status: "UP",
        durationMs: 124,
        executedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it("validates INCIDENT_TRANSITION event payload", () => {
      const result = IncidentTransitionEventSchema.safeParse({
        event: "INCIDENT_TRANSITION",
        monitorId: "0192e21b-8a21-7000-8b1a-98df76123456",
        incidentId: "0192e21b-8a21-7000-8b1a-98df76123457",
        type: "OPENED",
        healthStatus: "DOWN",
        timestamp: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it("validates SentinelNotifyPayloadSchema for PostgreSQL LISTEN/NOTIFY", () => {
      const result = SentinelNotifyPayloadSchema.safeParse({
        channel: "sentinel_events",
        event: "MONITOR_STATUS_CHANGED",
        data: { monitorId: "0192e21b-8a21-7000-8b1a-98df76123456", status: "DOWN" },
        emittedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });
  });
});
