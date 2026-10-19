import { FailureCategory } from "@sentinel/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeProbe, SequentialIdGenerator } from "../src/test-doubles/index.js";
import { TestMonitorConfig } from "../src/use-cases/monitors/test-monitor-config.use-case.js";

describe("P9.4 — TestMonitorConfigUseCase Unit Tests (D-10)", () => {
  let probe: FakeProbe;
  let clock: FakeClock;
  let idGen: SequentialIdGenerator;
  let useCase: TestMonitorConfig;

  beforeEach(() => {
    probe = new FakeProbe();
    clock = new FakeClock();
    idGen = new SequentialIdGenerator();
    useCase = new TestMonitorConfig(probe, clock, idGen);
  });

  it("executes dry-run test probe and returns success CheckDetailDto without database interaction", async () => {
    probe.enqueueResponse({
      statusCode: 200,
      durationMs: 78,
      headers: { "content-type": "application/json" },
      bodySnippet: '{"ping":"pong"}',
    });

    const result = await useCase.execute({
      request: {
        url: "https://api.example.com/health",
        method: "GET",
        timeoutMs: 5000,
        assertions: [
          { type: "status", operator: "equals", expected: 200 },
          { type: "body-json", target: "$.ping", operator: "equals", expected: "pong" },
        ],
      },
    });

    expect(result.status).toBe("UP");
    expect(result.statusCode).toBe(200);
    expect(result.latencyMs).toBe(78);
    expect(result.triggerType).toBe("MANUAL");
    expect(result.diagnostics.assertionResults).toHaveLength(2);
    expect(result.diagnostics.assertionResults.every((r) => r.passed)).toBe(true);
  });

  it("evaluates assertion failure accurately in dry-run mode", async () => {
    probe.enqueueResponse({
      statusCode: 500,
      durationMs: 120,
      headers: { "content-type": "application/json" },
      bodySnippet: '{"error":"internal"}',
    });

    const result = await useCase.execute({
      request: {
        url: "https://api.example.com/health",
        method: "GET",
        timeoutMs: 5000,
        assertions: [{ type: "status", operator: "equals", expected: 200 }],
      },
    });

    expect(result.status).toBe("DOWN");
    expect(result.statusCode).toBe(500);
    expect(result.failureCategory).toBe(FailureCategory.HTTP_STATUS_MISMATCH);
    expect(result.diagnostics.assertionResults[0]?.passed).toBe(false);
  });

  it("returns network failure category when probe encounters error", async () => {
    probe.enqueueResponse({
      errorCategory: FailureCategory.DNS_RESOLUTION_FAILED,
      errorMessage: "ENOTFOUND api.invalid",
      durationMs: 30,
    });

    const result = await useCase.execute({
      request: {
        url: "https://api.invalid/health",
        method: "GET",
        timeoutMs: 5000,
      },
    });

    expect(result.status).toBe("DOWN");
    expect(result.failureCategory).toBe(FailureCategory.DNS_RESOLUTION_FAILED);
    expect(result.failureReason).toContain("ENOTFOUND");
  });

  it("throws ValidationException on invalid URL or config", async () => {
    await expect(
      useCase.execute({
        request: {
          url: "not-a-valid-url",
          method: "GET",
          timeoutMs: 5000,
        },
      }),
    ).rejects.toThrow();
  });
});
