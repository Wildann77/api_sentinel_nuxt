import type { MonitorResponseDto, SparklinePointDto } from "@sentinel/contracts";
import type { Monitor } from "@sentinel/domain";

export interface MonitorMapperOptions {
  readonly sparkline?: readonly SparklinePointDto[];
  readonly createdAt?: Date | string;
  readonly updatedAt?: Date | string;
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
    createdAt: createdAtIso,
    updatedAt: updatedAtIso,
  };
}
