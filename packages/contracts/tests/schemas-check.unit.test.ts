import { describe, expect, it } from "vitest";
import { CheckDetailSchema, CheckResultSchema } from "../src/index.js";

describe("Check Schemas", () => {
  const baseCheck = {
    id: "0192e21b-8a21-7000-8b1a-98df76123456",
    monitorId: "0192e21b-8a21-7000-8b1a-98df76123457",
    status: "UP" as const,
    statusCode: 200,
    latencyMs: 145,
    failureCategory: null,
    failureReason: null,
    triggerType: "SCHEDULED" as const,
    scheduledFor: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    correlationId: "corr-123456",
    executedAt: new Date().toISOString(),
  };

  it("validates successful check result", () => {
    const result = CheckResultSchema.safeParse(baseCheck);
    expect(result.success).toBe(true);
  });

  it("validates manual check with null latency (e.g. DNS failure before connect)", () => {
    const result = CheckResultSchema.safeParse({
      ...baseCheck,
      status: "DOWN",
      statusCode: null,
      latencyMs: null,
      failureCategory: "DNS_RESOLUTION_FAILED",
      failureReason: "getaddrinfo ENOTFOUND",
      triggerType: "MANUAL",
    });
    expect(result.success).toBe(true);
  });

  it("validates check detail with full diagnostics (D-11)", () => {
    const result = CheckDetailSchema.safeParse({
      ...baseCheck,
      diagnostics: {
        pinnedIp: "93.184.216.34",
        dnsDurationMs: 12,
        connectDurationMs: 25,
        tlsDurationMs: 40,
        firstByteDurationMs: 68,
        requestHeaders: { "User-Agent": "SentinelProbe/1.0" },
        responseHeaders: { "content-type": "application/json" },
        responseBodySnippet: '{"status":"ok"}',
        assertionResults: [
          {
            type: "status",
            operator: "equals",
            expectedValue: 200,
            actualValue: 200,
            passed: true,
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});
