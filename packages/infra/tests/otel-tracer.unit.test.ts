import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getTracer,
  initTelemetry,
  recordChildSpan,
  shutdownTelemetry,
  withSpan,
} from "../src/telemetry/otel-tracer.js";
import { generateTraceparent } from "../src/telemetry/w3c-trace.js";

describe("P13.1 — OpenTelemetry Tracer Unit Tests", () => {
  beforeEach(async () => {
    await initTelemetry({ serviceName: "test-sentinel", enabled: false });
  });

  afterEach(async () => {
    await shutdownTelemetry();
  });

  it("obtains OpenTelemetry Tracer instance", () => {
    const tracer = getTracer("test-tracer");
    expect(tracer).toBeDefined();
    expect(typeof tracer.startSpan).toBe("function");
  });

  it("executes callback within span and handles return value", async () => {
    const traceparent = generateTraceparent();

    const result = await withSpan(
      "test.span.operation",
      {
        parentTraceparent: traceparent,
        attributes: { "test.key": "val" },
      },
      async (span) => {
        expect(span).toBeDefined();
        return "operation-success";
      },
    );

    expect(result).toBe("operation-success");
  });

  it("captures and re-throws errors within withSpan", async () => {
    await expect(
      withSpan("test.span.failing", {}, async () => {
        throw new Error("Span failure test");
      }),
    ).rejects.toThrow("Span failure test");
  });

  it("records child spans without throwing", () => {
    const traceparent = generateTraceparent();
    const now = Date.now();

    expect(() => {
      recordChildSpan({
        name: "queue.wait_duration",
        parentTraceparent: traceparent,
        startTime: now - 500,
        endTime: now,
        attributes: { "queue.name": "probe:check", lag_seconds: 0.5 },
      });
    }).not.toThrow();

    expect(() => {
      recordChildSpan({
        name: "probe.dns_lookup",
        parentTraceparent: traceparent,
        startTime: now - 30,
        endTime: now,
        attributes: { "dns.ip": "93.184.216.34" },
      });
    }).not.toThrow();

    expect(() => {
      recordChildSpan({
        name: "probe.failing",
        parentTraceparent: traceparent,
        startTime: now - 10,
        endTime: now,
        error: new Error("DNS failed"),
      });
    }).not.toThrow();
  });
});
