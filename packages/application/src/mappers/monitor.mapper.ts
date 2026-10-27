import type { MonitorResponseDto, SparklinePointDto } from "@sentinel/contracts";
import type { Monitor } from "@sentinel/domain";

export interface MonitorMapperOptions {
  readonly sparkline?: readonly SparklinePointDto[];
  readonly createdAt?: Date | string;
  readonly updatedAt?: Date | string;
}

function toAssertionExpected(expected: unknown): string | number | boolean | number[] | undefined {
  if (expected === undefined || expected === null) return undefined;
  if (
    typeof expected === "string" ||
    typeof expected === "number" ||
    typeof expected === "boolean"
  ) {
    return expected;
  }
  if (Array.isArray(expected)) {
    return expected.map((v) => Number(v));
  }
  return String(expected);
}

export function toMonitorResponseDto(
  monitor: Monitor,
  options: MonitorMapperOptions = {},
): MonitorResponseDto {
  const createdAtIso = options.createdAt
    ? new Date(options.createdAt).toISOString()
    : new Date().toISOString();
  const updatedAtIso = options.updatedAt ? new Date(options.updatedAt).toISOString() : createdAtIso;

  return {
    id: monitor.id.toString(),
    name: monitor.name,
    url: monitor.url.toString(),
    method: monitor.method,
    intervalSeconds: monitor.intervalSeconds,
    timeoutMs: monitor.timeoutMs,
    isActive: monitor.isActive,
    healthStatus: monitor.healthStatus,
    version: monitor.version,
    headerKeys: [...monitor.headerKeys],
    authType: monitor.authType,
    consecutiveSuccesses: monitor.consecutiveSuccesses,
    failureCount: monitor.consecutiveFailures,
    currentIncidentId: monitor.currentIncidentId ? monitor.currentIncidentId.toString() : null,
    lastCheckedAt: monitor.lastCheckedAt ? monitor.lastCheckedAt.toISOString() : null,
    nextRunAt: monitor.nextRunAt.toISOString(),
    sparkline: options.sparkline ? [...options.sparkline] : [],
    assertions: monitor.assertionRules.map((r) => ({
      type: r.type,
      operator: r.operator,
      target: r.target,
      expected: toAssertionExpected(r.expected),
    })),
    hasCustomBody: monitor.encryptedBody !== null,
    createdAt: createdAtIso,
    updatedAt: updatedAtIso,
  };
}
