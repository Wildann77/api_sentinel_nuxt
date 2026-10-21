import { describe, expect, it } from "vitest";
import {
  checkResults,
  checkResultsRelations,
  deliveryStatusEnum,
  failureCategoryEnum,
  healthStatusEnum,
  httpMethodEnum,
  incidents,
  incidentsRelations,
  monitorMetricsHourly,
  monitorMetricsHourlyRelations,
  monitors,
  monitorsRelations,
  notificationConfigs,
  notificationDeliveries,
  notificationDeliveriesRelations,
  rateLimits,
  sessions,
  sessionsRelations,
  triggerTypeEnum,
  users,
  usersRelations,
  workerHeartbeats,
} from "../src/db/schema/index.js";

describe("Drizzle Schema Definitions", () => {
  it("should define all PostgreSQL enums with expected values", () => {
    expect(httpMethodEnum.enumValues).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);

    expect(healthStatusEnum.enumValues).toEqual(["UNKNOWN", "UP", "DEGRADED", "DOWN", "PAUSED"]);

    expect(failureCategoryEnum.enumValues).toContain("REDIRECT_NOT_ALLOWED");
    expect(failureCategoryEnum.enumValues).toContain("DNS_RESOLUTION_FAILED");
    expect(failureCategoryEnum.enumValues).toContain("SSRF_BLOCKED");
    expect(failureCategoryEnum.enumValues).toHaveLength(12);

    expect(triggerTypeEnum.enumValues).toEqual(["SCHEDULED", "MANUAL"]);
    expect(deliveryStatusEnum.enumValues).toEqual(["PENDING", "SENT", "FAILED"]);
  });

  it("should define users table with single owner index", () => {
    expect(users).toBeDefined();
    expect(users.id).toBeDefined();
    expect(users.username).toBeDefined();
    expect(users.passwordHash).toBeDefined();
  });

  it("should define monitors and incidents with circular FK support", () => {
    expect(monitors).toBeDefined();
    expect(monitors.intervalSeconds).toBeDefined();
    expect(monitors.timeoutMs).toBeDefined();
    expect(monitors.version).toBeDefined();
    expect(monitors.currentIncidentId).toBeDefined();

    expect(incidents).toBeDefined();
    expect(incidents.monitorId).toBeDefined();
    expect(incidents.causeCategory).toBeDefined();
    expect(incidents.isResolved).toBeDefined();
  });

  it("should define check_results with partitioned composite PK and diagnostics", () => {
    expect(checkResults).toBeDefined();
    expect(checkResults.id).toBeDefined();
    expect(checkResults.executedAt).toBeDefined();
    expect(checkResults.triggerType).toBeDefined();
    expect(checkResults.scheduledFor).toBeDefined();
    expect(checkResults.startedAt).toBeDefined();
    expect(checkResults.finishedAt).toBeDefined();
    expect(checkResults.pinnedIp).toBeDefined();
    expect(checkResults.diagnostics).toBeDefined();
    expect(checkResults.correlationId).toBeDefined();
  });

  it("should define rate_limits, sessions, and metrics tables", () => {
    expect(rateLimits.key).toBeDefined();
    expect(sessions.tokenHash).toBeDefined();
    expect(monitorMetricsHourly.bucket).toBeDefined();
    expect(notificationConfigs.channel).toBeDefined();
    expect(notificationDeliveries.notificationType).toBeDefined();
    expect(workerHeartbeats.workerId).toBeDefined();
  });

  it("should define relations between entities", () => {
    expect(usersRelations).toBeDefined();
    expect(sessionsRelations).toBeDefined();
    expect(monitorsRelations).toBeDefined();
    expect(incidentsRelations).toBeDefined();
    expect(checkResultsRelations).toBeDefined();
    expect(notificationDeliveriesRelations).toBeDefined();
    expect(monitorMetricsHourlyRelations).toBeDefined();
  });
});
