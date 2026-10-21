import { describe, expect, it } from "vitest";
import {
  CreateMonitorRequestSchema,
  MonitorResponseSchema,
  TestMonitorConfigRequestSchema,
  UpdateMonitorRequestSchema,
} from "../src/index.js";

describe("Monitor Schemas", () => {
  const validMonitorInput = {
    name: "Production Gateway",
    url: "https://api.example.com/healthz",
    method: "GET",
    intervalSeconds: 60,
    timeoutMs: 5000,
    assertions: [
      {
        type: "status",
        operator: "equals",
        expectedValue: 200,
      },
      {
        type: "header",
        property: "content-type",
        operator: "contains",
        expectedValue: "application/json",
      },
    ],
    auth: {
      type: "BEARER",
      token: "secret-bearer-token",
    },
    customHeaders: {
      "X-Custom-Env": "prod",
    },
  };

  describe("CreateMonitorRequestSchema", () => {
    it("validates correct monitor creation input", () => {
      const result = CreateMonitorRequestSchema.safeParse(validMonitorInput);
      expect(result.success).toBe(true);
    });

    it("rejects invalid URLs (ftp, userinfo)", () => {
      expect(
        CreateMonitorRequestSchema.safeParse({
          ...validMonitorInput,
          url: "ftp://example.com",
        }).success,
      ).toBe(false);

      expect(
        CreateMonitorRequestSchema.safeParse({
          ...validMonitorInput,
          url: "https://user:pass@example.com",
        }).success,
      ).toBe(false);
    });

    it("rejects interval < 60 or > 86400", () => {
      expect(
        CreateMonitorRequestSchema.safeParse({
          ...validMonitorInput,
          intervalSeconds: 30,
        }).success,
      ).toBe(false);

      expect(
        CreateMonitorRequestSchema.safeParse({
          ...validMonitorInput,
          intervalSeconds: 100000,
        }).success,
      ).toBe(false);
    });

    it("rejects timeout < 1000 or > 30000", () => {
      expect(
        CreateMonitorRequestSchema.safeParse({
          ...validMonitorInput,
          timeoutMs: 500,
        }).success,
      ).toBe(false);

      expect(
        CreateMonitorRequestSchema.safeParse({
          ...validMonitorInput,
          timeoutMs: 40000,
        }).success,
      ).toBe(false);
    });

    it("rejects more than 10 assertions", () => {
      const elevenAssertions = Array.from({ length: 11 }, (_, i) => ({
        type: "status" as const,
        operator: "equals" as const,
        expectedValue: 200 + i,
      }));

      const result = CreateMonitorRequestSchema.safeParse({
        ...validMonitorInput,
        assertions: elevenAssertions,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("UpdateMonitorRequestSchema", () => {
    it("allows partial updates", () => {
      const result = UpdateMonitorRequestSchema.safeParse({
        name: "New Name",
        isActive: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("TestMonitorConfigRequestSchema (D-10)", () => {
    it("validates test probe request", () => {
      const result = TestMonitorConfigRequestSchema.safeParse({
        url: "https://api.example.com/v1/ping",
        method: "POST",
        timeoutMs: 5000,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("MonitorResponseSchema (Zero-Leak)", () => {
    it("validates monitor response with sparkline and only headerKeys", () => {
      const result = MonitorResponseSchema.safeParse({
        id: "0192e21b-8a21-7000-8b1a-98df76123456",
        name: "Gateway API",
        url: "https://api.example.com",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
        healthStatus: "UP",
        version: 1,
        headerKeys: ["Authorization", "X-Custom-Env"],
        authType: "BEARER",
        consecutiveSuccesses: 5,
        failureCount: 0,
        currentIncidentId: null,
        lastCheckedAt: new Date().toISOString(),
        nextRunAt: new Date().toISOString(),
        sparkline: [{ durationMs: 120, timestamp: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });
  });
});
