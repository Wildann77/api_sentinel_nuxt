import crypto from "node:crypto";
import type { SpanContext, TraceFlags } from "@opentelemetry/api";

export interface ParsedTraceparent {
  readonly version: string;
  readonly traceId: string;
  readonly parentId: string;
  readonly traceFlags: number;
}

const TRACEPARENT_REGEX = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

export function parseTraceparent(traceparent: string | null | undefined): ParsedTraceparent | null {
  if (!traceparent || typeof traceparent !== "string") {
    return null;
  }

  const match = TRACEPARENT_REGEX.exec(traceparent.trim());
  if (!match) {
    return null;
  }

  const [, version, traceId, parentId, traceFlagsHex] = match;
  if (!version || !traceId || !parentId || !traceFlagsHex) {
    return null;
  }

  if (version === "ff" || /^0+$/.test(traceId) || /^0+$/.test(parentId)) {
    return null;
  }

  return {
    version,
    traceId: traceId.toLowerCase(),
    parentId: parentId.toLowerCase(),
    traceFlags: Number.parseInt(traceFlagsHex, 16),
  };
}

export function generateTraceparent(sampled = true): string {
  const traceId = crypto.randomBytes(16).toString("hex");
  const spanId = crypto.randomBytes(8).toString("hex");
  const flags = sampled ? "01" : "00";
  return `00-${traceId}-${spanId}-${flags}`;
}

export function traceparentToSpanContext(
  traceparent: string | null | undefined,
): SpanContext | null {
  const parsed = parseTraceparent(traceparent);
  if (!parsed) {
    return null;
  }

  return {
    traceId: parsed.traceId,
    spanId: parsed.parentId,
    traceFlags: parsed.traceFlags as TraceFlags,
    isRemote: true,
  };
}

export function spanContextToTraceparent(spanContext: SpanContext): string {
  const flags = spanContext.traceFlags.toString(16).padStart(2, "0");
  return `00-${spanContext.traceId}-${spanContext.spanId}-${flags}`;
}
