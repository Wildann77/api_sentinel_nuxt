import { AssertionRule, FailureCategory, TriggerType, UUIDv7 } from "@sentinel/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { ProbeCheckOrchestrator } from "../src/services/probe-check-orchestrator.js";
import { FakeClock } from "../src/test-doubles/fake-clock.js";
import { FakeProbe } from "../src/test-doubles/fake-probe.js";
import { SequentialIdGenerator } from "../src/test-doubles/sequential-id-generator.js";

describe("P6.6 — ProbeCheckOrchestrator Unit Tests", () => {
  let probe: FakeProbe;
  let clock: FakeClock;
  let idGenerator: SequentialIdGenerator;
  let orchestrator: ProbeCheckOrchestrator;
  let monitorId: UUIDv7;

  beforeEach(() => {
    probe = new FakeProbe();
    clock = new FakeClock(new Date("2026-10-24T10:00:00.000Z"));
    idGenerator = new SequentialIdGenerator();
    orchestrator = new ProbeCheckOrchestrator(probe, clock, idGenerator);
    monitorId = UUIDv7.fromString(idGenerator.generate());
  });

  it("orchestrates successful check when probe succeeds and all assertions pass", async () => {
    probe.enqueueResponse({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      bodySnippet: JSON.stringify({ status: "healthy", version: "1.0.0" }),
      durationMs: 45.2,
      pinnedIp: "93.184.216.34",
    });

    const statusRule = new AssertionRule({ type: "status", expected: [200] });
    const bodyRule = new AssertionRule({
      type: "body-json",
      target: "$.status",
      operator: "equals",
      expected: "healthy",
    });

    const outcome = await orchestrator.execute({
      monitorId,
      url: "https://api.example.com/health",
      method: "GET",
      timeoutMs: 5000,
      assertionRules: [statusRule, bodyRule],
      triggerType: TriggerType.SCHEDULED,
    });

    expect(outcome.checkResult.isSuccess).toBe(true);
    expect(outcome.checkResult.failureCategory).toBeNull();
    expect(outcome.checkResult.sanitizedDiagnostic).toBeNull();
    expect(outcome.checkResult.statusCode).toBe(200);
    expect(outcome.checkResult.pinnedIp).toBe("93.184.216.34");
    expect(outcome.checkResult.durationMs).toBe(45.2);
    expect(outcome.checkResult.triggerType).toBe(TriggerType.SCHEDULED);
    expect(outcome.checkResult.assertionResults).toHaveLength(2);
    expect(outcome.checkResult.assertionResults.every((r) => r.status === "PASS")).toBe(true);
    expect(outcome.probeResult.statusCode).toBe(200);

    // Verify probe was called with needsResponseBody = true due to body assertion
    expect(probe.history).toHaveLength(1);
    expect(probe.history[0]?.needsResponseBody).toBe(true);
  });

  it("sets needsResponseBody = false when no body assertions exist", async () => {
    probe.enqueueResponse({
      statusCode: 204,
      headers: {},
      bodySnippet: null,
    });

    const statusRule = new AssertionRule({ type: "status", expected: [204] });

    await orchestrator.execute({
      monitorId,
      url: "https://api.example.com/ping",
      method: "HEAD",
      timeoutMs: 5000,
      assertionRules: [statusRule],
      triggerType: TriggerType.SCHEDULED,
    });

    expect(probe.history[0]?.needsResponseBody).toBe(false);
  });

  it("handles network failure (e.g. SSRF_BLOCKED, TIMEOUT) directly without calling assertion engine", async () => {
    probe.enqueueResponse({
      statusCode: null,
      headers: {},
      bodySnippet: null,
      durationMs: null,
      pinnedIp: null,
      errorCategory: FailureCategory.SSRF_BLOCKED,
      errorMessage: "URL target berada pada rentang subnet privat yang dilarang.",
    });

    const statusRule = new AssertionRule({ type: "status", expected: [200] });

    const outcome = await orchestrator.execute({
      monitorId,
      url: "http://127.0.0.1:8080/admin",
      method: "GET",
      timeoutMs: 5000,
      assertionRules: [statusRule],
      triggerType: TriggerType.MANUAL,
    });

    expect(outcome.checkResult.isSuccess).toBe(false);
    expect(outcome.checkResult.failureCategory).toBe(FailureCategory.SSRF_BLOCKED);
    expect(outcome.checkResult.statusCode).toBeNull();
    expect(outcome.checkResult.sanitizedDiagnostic).toContain("dilarang");
    expect(outcome.checkResult.assertionResults).toHaveLength(0);
    expect(outcome.assertionResult).toBeUndefined();
    expect(outcome.checkResult.triggerType).toBe(TriggerType.MANUAL);
  });

  it("classifies HTTP_STATUS_MISMATCH when status code fails assertion", async () => {
    probe.enqueueResponse({
      statusCode: 503,
      headers: { "content-type": "application/json" },
      bodySnippet: '{"error":"Service Unavailable"}',
      durationMs: 80,
    });

    const statusRule = new AssertionRule({ type: "status", expected: [200, 204] });

    const outcome = await orchestrator.execute({
      monitorId,
      url: "https://api.example.com/health",
      method: "GET",
      timeoutMs: 5000,
      assertionRules: [statusRule],
      triggerType: TriggerType.SCHEDULED,
    });

    expect(outcome.checkResult.isSuccess).toBe(false);
    expect(outcome.checkResult.failureCategory).toBe(FailureCategory.HTTP_STATUS_MISMATCH);
    expect(outcome.checkResult.statusCode).toBe(503);
    expect(outcome.checkResult.sanitizedDiagnostic).toContain("Expected status 200, 204");
    expect(outcome.checkResult.assertionResults[0]?.status).toBe("FAIL");
  });

  it("classifies HEADER_ASSERTION_FAILED when required header is missing or mismatch", async () => {
    probe.enqueueResponse({
      statusCode: 200,
      headers: { "content-type": "text/html" },
      bodySnippet: "<html><body>ok</body></html>",
    });

    const statusRule = new AssertionRule({ type: "status", expected: [200] });
    const headerRule = new AssertionRule({
      type: "header",
      target: "content-type",
      operator: "equals",
      expected: "application/json",
    });

    const outcome = await orchestrator.execute({
      monitorId,
      url: "https://api.example.com/api",
      method: "GET",
      timeoutMs: 5000,
      assertionRules: [statusRule, headerRule],
      triggerType: TriggerType.SCHEDULED,
    });

    expect(outcome.checkResult.isSuccess).toBe(false);
    expect(outcome.checkResult.failureCategory).toBe(FailureCategory.HEADER_ASSERTION_FAILED);
    expect(outcome.checkResult.sanitizedDiagnostic).toContain("content-type");
  });

  it("classifies BODY_JSON_INVALID when body is not valid JSON", async () => {
    probe.enqueueResponse({
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      bodySnippet: "Internal Server Crash Dump (not JSON)",
    });

    const statusRule = new AssertionRule({ type: "status", expected: [200] });
    const bodyRule = new AssertionRule({
      type: "body-json",
      target: "$.status",
      operator: "equals",
      expected: "ok",
    });

    const outcome = await orchestrator.execute({
      monitorId,
      url: "https://api.example.com/api",
      method: "GET",
      timeoutMs: 5000,
      assertionRules: [statusRule, bodyRule],
      triggerType: TriggerType.SCHEDULED,
    });

    expect(outcome.checkResult.isSuccess).toBe(false);
    expect(outcome.checkResult.failureCategory).toBe(FailureCategory.BODY_JSON_INVALID);
  });

  it("classifies BODY_ASSERTION_FAILED when JSON value does not match expected", async () => {
    probe.enqueueResponse({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      bodySnippet: JSON.stringify({ status: "degraded", count: 0 }),
    });

    const statusRule = new AssertionRule({ type: "status", expected: [200] });
    const bodyRule = new AssertionRule({
      type: "body-json",
      target: "$.status",
      operator: "equals",
      expected: "healthy",
    });

    const outcome = await orchestrator.execute({
      monitorId,
      url: "https://api.example.com/api",
      method: "GET",
      timeoutMs: 5000,
      assertionRules: [statusRule, bodyRule],
      triggerType: TriggerType.SCHEDULED,
    });

    expect(outcome.checkResult.isSuccess).toBe(false);
    expect(outcome.checkResult.failureCategory).toBe(FailureCategory.BODY_ASSERTION_FAILED);
    expect(outcome.checkResult.sanitizedDiagnostic).toContain("healthy");
  });

  it("passes authConfig and custom headers to network probe properly", async () => {
    probe.enqueueResponse({ statusCode: 200 });

    const authConfig = {
      type: "bearer" as const,
      token: "secret-token-xyz",
    };

    await orchestrator.execute({
      monitorId,
      url: "https://api.example.com/secure",
      method: "POST",
      headers: { "x-correlation": "123" },
      body: '{"foo":"bar"}',
      authConfig,
      timeoutMs: 8000,
      assertionRules: [new AssertionRule({ type: "status", expected: [200] })],
      triggerType: TriggerType.MANUAL,
    });

    expect(probe.history[0]?.authConfig).toEqual(authConfig);
    expect(probe.history[0]?.headers?.["x-correlation"]).toBe("123");
    expect(probe.history[0]?.body).toBe('{"foo":"bar"}');
    expect(probe.history[0]?.timeoutMs).toBe(8000);
  });

  it("records telemetry spans for DNS, TCP, TLS, transfer, and assertion evaluation", async () => {
    const { NoopTelemetryPort } = await import("../src/test-doubles/fake-telemetry.js");
    const telemetry = new NoopTelemetryPort();
    const telOrchestrator = new ProbeCheckOrchestrator(probe, clock, idGenerator, telemetry);

    probe.enqueueResponse({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      bodySnippet: JSON.stringify({ ok: true }),
      durationMs: 150,
      dnsDurationMs: 20,
      connectDurationMs: 30,
      tlsDurationMs: 40,
    });

    await telOrchestrator.execute({
      monitorId,
      url: "https://api.example.com/tel",
      method: "GET",
      timeoutMs: 5000,
      assertionRules: [new AssertionRule({ type: "status", expected: [200] })],
      triggerType: TriggerType.SCHEDULED,
      correlationId: "custom-corr-id",
    });

    const spanNames = telemetry.recordedSpans.map((s) => s.name);
    expect(spanNames).toContain("probe.dns_lookup");
    expect(spanNames).toContain("probe.tcp_connect");
    expect(spanNames).toContain("probe.tls_handshake");
    expect(spanNames).toContain("probe.response_transfer");
    expect(spanNames).toContain("assertion.evaluation");
  });
});
