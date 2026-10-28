import { describe, expect, it } from "vitest";
import { CheckResult } from "../src/entities/check-result.js";
import { FailureCategory, TriggerType } from "../src/enums/index.js";
import { ValidationException } from "../src/errors/domain-exception.js";
import { MAX_DIAGNOSTIC_LENGTH, sanitizeDiagnostic } from "../src/services/diagnostic-sanitizer.js";
import { aggregateMetricBuckets, calculateUptime } from "../src/services/uptime-calculator.js";
import { UUIDv7 } from "../src/value-objects/uuid-v7.js";

function makeUuid(id = 1): UUIDv7 {
  const hex = id.toString(16).padStart(12, "0");
  return new UUIDv7(`018d3b5b-2000-7000-8000-${hex}`);
}

describe("P2.7 — CheckResult Entity & Diagnostic Sanitizer", () => {
  const dummyMonitorId = makeUuid(1);
  const dummyCheckId = makeUuid(2);

  it("creates valid CheckResult with null latency when request fails prior to socket initiation", () => {
    const started = new Date("2026-10-23T10:00:00.000Z");
    const finished = new Date("2026-10-23T10:00:00.050Z");

    const result = new CheckResult({
      id: dummyCheckId,
      monitorId: dummyMonitorId,
      incidentId: null,
      triggerType: TriggerType.SCHEDULED,
      scheduledFor: started,
      startedAt: started,
      finishedAt: finished,
      durationMs: null, // PRD §4.12: null latency when failed before request initiated
      isSuccess: false,
      statusCode: null,
      failureCategory: FailureCategory.SSRF_BLOCKED,
      assertionResults: [],
      diagnostic: "SSRF policy blocked target 127.0.0.1",
      correlationId: "corr-12345",
      pinnedIp: null,
    });

    expect(result.durationMs).toBeNull();
    expect(result.isSuccess).toBe(false);
    expect(result.failureCategory).toBe(FailureCategory.SSRF_BLOCKED);
    expect(result.sanitizedDiagnostic).toContain("SSRF policy blocked");
  });

  it("redacts Telegram bot token, Bearer token, Basic auth, and sensitive params in diagnostics", () => {
    const rawDiagnostic = [
      "Telegram dispatch failed: https://api.telegram.org/bot123456789:ABCdefGHI_jklMNO1234-xyz/sendMessage",
      "Request headers: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretpayload.sig",
      "Alternative: Basic dXNlcjpwYXNzd29yZA==",
      "Query: https://example.com/api?api_key=secretKey123&token=superSecret456",
      'JSON Body: {"password":"MySecretPassword123","token":"tokenABC"}',
    ].join("\n");

    const sanitized = sanitizeDiagnostic(rawDiagnostic);
    expect(sanitized).not.toBeNull();
    expect(sanitized).not.toContain("123456789:ABCdefGHI_jklMNO1234-xyz");
    expect(sanitized).toContain("bot[REDACTED_TELEGRAM_TOKEN]");
    expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(sanitized).toContain("Bearer [REDACTED_TOKEN]");
    expect(sanitized).not.toContain("dXNlcjpwYXNzd29yZA==");
    expect(sanitized).toContain("Basic [REDACTED_CREDENTIALS]");
    expect(sanitized).not.toContain("secretKey123");
    expect(sanitized).toContain("api_key=[REDACTED]");
    expect(sanitized).not.toContain("MySecretPassword123");
    expect(sanitized).toContain('"password":"[REDACTED]"');
  });

  it("truncates diagnostics exceeding maximum length limit of 2,000 characters", () => {
    const longString = "A".repeat(2500);
    const sanitized = sanitizeDiagnostic(longString);

    expect(sanitized).not.toBeNull();
    expect(sanitized?.length).toBe(MAX_DIAGNOSTIC_LENGTH);
    expect(sanitized?.endsWith("... [TRUNCATED]")).toBe(true);
  });

  it("rejects CheckResult with negative duration or invalid timestamps", () => {
    const started = new Date("2026-10-23T10:00:05.000Z");
    const finished = new Date("2026-10-23T10:00:00.000Z"); // earlier than started

    expect(
      () =>
        new CheckResult({
          id: dummyCheckId,
          monitorId: dummyMonitorId,
          incidentId: null,
          triggerType: TriggerType.SCHEDULED,
          scheduledFor: null,
          startedAt: started,
          finishedAt: finished,
          durationMs: 100,
          isSuccess: true,
          statusCode: 200,
          failureCategory: null,
          assertionResults: [],
          correlationId: "corr-1",
          pinnedIp: "1.1.1.1",
        }),
    ).toThrow(ValidationException);

    expect(
      () =>
        new CheckResult({
          id: dummyCheckId,
          monitorId: dummyMonitorId,
          incidentId: null,
          triggerType: TriggerType.SCHEDULED,
          scheduledFor: null,
          startedAt: finished,
          finishedAt: started,
          durationMs: -50,
          isSuccess: true,
          statusCode: 200,
          failureCategory: null,
          assertionResults: [],
          correlationId: "corr-1",
          pinnedIp: "1.1.1.1",
        }),
    ).toThrow(ValidationException);
  });
});

describe("P2.10 — Kalkulator Uptime & Agregasi Murni", () => {
  it("calculates accurate uptime percentage: 97/100 = 97%", () => {
    const uptime = calculateUptime(97, 100);
    expect(uptime).toBe(97);

    const fractional = calculateUptime(1, 3);
    expect(fractional).toBe(33.33);
  });

  it("returns null (N/A) when total checks = 0, never returns false 100% (PRD §4.11)", () => {
    const zeroUptime = calculateUptime(0, 0);
    expect(zeroUptime).toBeNull();
  });

  it("aggregates multiple hourly buckets with weighted average latency", () => {
    const buckets = [
      { total: 50, success: 48, avgLatencyMs: 100 },
      { total: 50, success: 49, avgLatencyMs: 200 },
    ];

    const aggregated = aggregateMetricBuckets(buckets);
    expect(aggregated.totalChecks).toBe(100);
    expect(aggregated.successChecks).toBe(97);
    expect(aggregated.failedChecks).toBe(3);
    expect(aggregated.uptimePercentage).toBe(97);
    // Weighted latency: (50*100 + 50*200) / 100 = 150 ms
    expect(aggregated.avgLatencyMs).toBe(150);
  });

  it("returns null uptime and latency when all buckets have 0 checks", () => {
    const emptyBuckets = [
      { total: 0, success: 0, avgLatencyMs: null },
      { total: 0, success: 0, avgLatencyMs: null },
    ];

    const aggregated = aggregateMetricBuckets(emptyBuckets);
    expect(aggregated.totalChecks).toBe(0);
    expect(aggregated.uptimePercentage).toBeNull();
    expect(aggregated.avgLatencyMs).toBeNull();
  });

  it("throws ValidationException on invalid calculateUptime parameters", () => {
    expect(() => calculateUptime(-1, 10)).toThrow(ValidationException);
    expect(() => calculateUptime(11, 10)).toThrow(ValidationException);
    expect(calculateUptime(0, -5)).toBeNull();
  });

  it("throws ValidationException on invalid metric buckets", () => {
    expect(() => aggregateMetricBuckets([{ total: -1, success: 0, avgLatencyMs: 100 }])).toThrow(
      ValidationException,
    );

    expect(() => aggregateMetricBuckets([{ total: 10, success: -1, avgLatencyMs: 100 }])).toThrow(
      ValidationException,
    );

    expect(() => aggregateMetricBuckets([{ total: 10, success: 15, avgLatencyMs: 100 }])).toThrow(
      ValidationException,
    );
  });

  it("supports CheckResult.create factory method with full parameters", () => {
    const now = new Date();
    const result = CheckResult.create({
      id: makeUuid(10),
      monitorId: makeUuid(11),
      incidentId: null,
      triggerType: TriggerType.SCHEDULED,
      scheduledFor: now,
      startedAt: now,
      finishedAt: now,
      durationMs: 45,
      isSuccess: true,
      statusCode: 200,
      failureCategory: null,
      assertionResults: [],
      diagnostic: null,
      correlationId: "corr-factory",
      pinnedIp: "127.0.0.1",
    });

    expect(result.id).toBeDefined();
    expect(result.isSuccess).toBe(true);
    expect(result.durationMs).toBe(45);
    expect(result.sanitizedDiagnostic).toBeNull();
  });
});
