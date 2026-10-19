import { describe, expect, it } from "vitest";
import {
  generateTraceparent,
  parseTraceparent,
  spanContextToTraceparent,
  traceparentToSpanContext,
} from "../src/telemetry/w3c-trace.js";

describe("P13.1 — W3C Traceparent Utility Unit Tests", () => {
  it("generates valid W3C traceparent format", () => {
    const tp = generateTraceparent();
    expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

    const unsampled = generateTraceparent(false);
    expect(unsampled).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/);
  });

  it("parses valid traceparent string accurately", () => {
    const raw = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const parsed = parseTraceparent(raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe("00");
    expect(parsed?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(parsed?.parentId).toBe("00f067aa0ba902b7");
    expect(parsed?.traceFlags).toBe(1);
  });

  it("rejects invalid traceparent inputs", () => {
    expect(parseTraceparent(null)).toBeNull();
    expect(parseTraceparent("")).toBeNull();
    expect(parseTraceparent("invalid-traceparent")).toBeNull();
    // Version 'ff' is forbidden by W3C spec
    expect(parseTraceparent("ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBeNull();
    // All-zero traceId is invalid
    expect(parseTraceparent("00-00000000000000000000000000000000-00f067aa0ba902b7-01")).toBeNull();
    // All-zero parentId is invalid
    expect(parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01")).toBeNull();
  });

  it("converts traceparent to OpenTelemetry SpanContext and back", () => {
    const raw = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const spanContext = traceparentToSpanContext(raw);

    expect(spanContext).not.toBeNull();
    if (!spanContext) {
      throw new Error("Expected spanContext to be defined");
    }
    expect(spanContext.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(spanContext.spanId).toBe("00f067aa0ba902b7");
    expect(spanContext.traceFlags).toBe(1);
    expect(spanContext.isRemote).toBe(true);

    const serialized = spanContextToTraceparent(spanContext);
    expect(serialized).toBe(raw);
  });
});
