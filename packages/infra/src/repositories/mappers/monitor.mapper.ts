import {
  AssertionRule,
  type AssertionRuleProps,
  EncryptedSecret,
  EndpointUrl,
  type HealthStatus,
  type HttpMethod,
  Monitor,
  UUIDv7,
} from "@sentinel/domain";
import type { MonitorInsert, MonitorSelect } from "../../db/schema/index.js";

export const MonitorMapper = {
  toDomain(row: MonitorSelect): Monitor {
    const assertionRules: AssertionRule[] = Array.isArray(row.assertionRules)
      ? (row.assertionRules as unknown as AssertionRuleProps[]).map(
          (rule) => new AssertionRule(rule),
        )
      : [];

    return new Monitor({
      id: UUIDv7.fromString(row.id),
      name: row.name,
      url: new EndpointUrl(row.url),
      method: row.method as HttpMethod,
      encryptedHeaders: row.encryptedHeaders ? new EncryptedSecret(row.encryptedHeaders) : null,
      headerKeys: row.headerKeys ?? [],
      encryptedBody: row.encryptedBody ? new EncryptedSecret(row.encryptedBody) : null,
      encryptedAuthConfig: row.encryptedAuthConfig
        ? new EncryptedSecret(row.encryptedAuthConfig)
        : null,
      assertionRules,
      intervalSeconds: row.intervalSeconds,
      timeoutMs: row.timeoutMs,
      isActive: row.isActive,
      healthStatus: row.healthStatus as HealthStatus,
      consecutiveFailures: row.consecutiveFailures,
      consecutiveSuccesses: row.consecutiveSuccesses,
      currentIncidentId: row.currentIncidentId ? UUIDv7.fromString(row.currentIncidentId) : null,
      version: row.version,
      lastCheckedAt: row.lastCheckedAt,
      nextRunAt: row.nextRunAt,
    });
  },

  toInsert(monitor: Monitor): MonitorInsert {
    return {
      id: monitor.id.toString(),
      name: monitor.name,
      url: monitor.url.toString(),
      method: monitor.method,
      encryptedHeaders: monitor.encryptedHeaders ? monitor.encryptedHeaders.toString() : null,
      headerKeys: [...monitor.headerKeys],
      encryptedBody: monitor.encryptedBody ? monitor.encryptedBody.toString() : null,
      encryptedAuthConfig: monitor.encryptedAuthConfig
        ? monitor.encryptedAuthConfig.toString()
        : null,
      assertionRules: monitor.assertionRules.map((r) => ({
        type: r.type,
        operator: r.operator,
        target: r.target,
        expected: r.expected,
      })),
      intervalSeconds: monitor.intervalSeconds,
      timeoutMs: monitor.timeoutMs,
      isActive: monitor.isActive,
      healthStatus: monitor.healthStatus,
      consecutiveFailures: monitor.consecutiveFailures,
      consecutiveSuccesses: monitor.consecutiveSuccesses,
      currentIncidentId: monitor.currentIncidentId ? monitor.currentIncidentId.toString() : null,
      version: monitor.version,
      lastCheckedAt: monitor.lastCheckedAt,
      nextRunAt: monitor.nextRunAt,
      updatedAt: new Date(),
    };
  },
};
