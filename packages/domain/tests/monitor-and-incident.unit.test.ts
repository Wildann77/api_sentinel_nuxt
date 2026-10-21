import { describe, expect, it } from "vitest";
import { CheckResult } from "../src/entities/check-result.js";
import { Incident } from "../src/entities/incident.js";
import { Monitor } from "../src/entities/monitor.js";
import { FailureCategory, HealthStatus, HttpMethod, TriggerType } from "../src/enums/index.js";
import { ConflictException, ValidationException } from "../src/errors/domain-exception.js";
import {
  IncidentFailureCountIncrementedDomainEvent,
  IncidentOpenedDomainEvent,
  IncidentRecoveredDomainEvent,
} from "../src/events/incident-events.js";
import { EndpointUrl } from "../src/value-objects/endpoint-url.js";
import { UUIDv7 } from "../src/value-objects/uuid-v7.js";

let uuidCounter = 1;
function makeUuid(): UUIDv7 {
  const hex = (uuidCounter++).toString(16).padStart(12, "0");
  return new UUIDv7(`018d3b5b-2000-7000-8000-${hex}`);
}

describe("P2.8 & P2.9 — Monitor Aggregate Root & Incident Entity", () => {
  const monitorId = makeUuid();
  const validUrl = EndpointUrl.parse("https://api.example.com/health");

  function createTestMonitor(
    overrides: Partial<ConstructorParameters<typeof Monitor>[0]> = {},
  ): Monitor {
    return new Monitor({
      id: monitorId,
      name: "Payment API Service",
      url: validUrl,
      method: HttpMethod.GET,
      intervalSeconds: 60,
      timeoutMs: 5000,
      isActive: true,
      healthStatus: HealthStatus.UNKNOWN,
      nextRunAt: new Date("2026-10-23T12:00:00.000Z"),
      ...overrides,
    });
  }

  function createCheck(
    isSuccess: boolean,
    triggerType: TriggerType = TriggerType.SCHEDULED,
  ): CheckResult {
    const started = new Date("2026-10-23T12:01:00.000Z");
    const finished = new Date("2026-10-23T12:01:00.250Z");
    return new CheckResult({
      id: makeUuid(),
      monitorId,
      incidentId: null,
      triggerType,
      scheduledFor: started,
      startedAt: started,
      finishedAt: finished,
      durationMs: 250,
      isSuccess,
      statusCode: isSuccess ? 200 : 503,
      failureCategory: isSuccess ? null : FailureCategory.HTTP_STATUS_MISMATCH,
      assertionResults: [],
      diagnostic: isSuccess ? null : "HTTP status 503 Service Unavailable",
      correlationId: "corr-xyz",
      pinnedIp: "93.184.216.34",
    });
  }

  describe("Monitor Creation & Invariants", () => {
    it("validates monitor name length, interval range, and timeout bounds", () => {
      expect(
        () =>
          new Monitor({
            id: monitorId,
            name: "A".repeat(101),
            url: validUrl,
            method: HttpMethod.GET,
            intervalSeconds: 60,
            timeoutMs: 5000,
            nextRunAt: new Date(),
          }),
      ).toThrow(ValidationException);

      expect(
        () =>
          new Monitor({
            id: monitorId,
            name: "Valid Monitor",
            url: validUrl,
            method: HttpMethod.GET,
            intervalSeconds: 30, // below min 60
            timeoutMs: 5000,
            nextRunAt: new Date(),
          }),
      ).toThrow(ValidationException);

      expect(
        () =>
          new Monitor({
            id: monitorId,
            name: "Valid Monitor",
            url: validUrl,
            method: HttpMethod.GET,
            intervalSeconds: 60,
            timeoutMs: 35000, // above max 30000
            nextRunAt: new Date(),
          }),
      ).toThrow(ValidationException);
    });

    it("computes next run time with deterministic jitter (±5%) without catch-up burst", () => {
      const monitor = createTestMonitor({ intervalSeconds: 60 });
      const baseDate = new Date("2026-10-23T12:00:00.000Z");

      // +5% jitter -> 60 * 1.05 = 63s
      const nextRunPlus = monitor.computeNextRun(baseDate, 60, 0.05);
      expect(nextRunPlus.getTime() - baseDate.getTime()).toBe(63000);

      // -5% jitter -> 60 * 0.95 = 57s
      const nextRunMinus = monitor.computeNextRun(baseDate, 60, -0.05);
      expect(nextRunMinus.getTime() - baseDate.getTime()).toBe(57000);
    });
  });

  describe("Monitor Health State Machine Transitions", () => {
    it("handles failure progression: 1-2 failures -> DEGRADED, 3rd failure -> DOWN + opens incident", () => {
      const monitor = createTestMonitor();
      const failCheck = createCheck(false);
      const incidentId1 = makeUuid();

      // 1st failure: DEGRADED
      const events1 = monitor.recordCheckFailure(failCheck, incidentId1);
      expect(monitor.healthStatus).toBe(HealthStatus.DEGRADED);
      expect(monitor.consecutiveFailures).toBe(1);
      expect(events1).toHaveLength(0);

      // 2nd failure: remains DEGRADED
      const events2 = monitor.recordCheckFailure(failCheck, incidentId1);
      expect(monitor.healthStatus).toBe(HealthStatus.DEGRADED);
      expect(monitor.consecutiveFailures).toBe(2);
      expect(events2).toHaveLength(0);

      // 3rd failure: transitions to DOWN, sets currentIncidentId, emits IncidentOpened
      const events3 = monitor.recordCheckFailure(failCheck, incidentId1);
      expect(monitor.healthStatus).toBe(HealthStatus.DOWN);
      expect(monitor.consecutiveFailures).toBe(3);
      expect(monitor.currentIncidentId).toBe(incidentId1);
      expect(events3).toHaveLength(1);
      expect(events3[0]).toBeInstanceOf(IncidentOpenedDomainEvent);
      const openEvent = events3[0] as IncidentOpenedDomainEvent;
      expect(openEvent.incidentId).toBe(incidentId1);
      expect(openEvent.monitorId).toBe(monitorId);

      // 4th failure while DOWN: remains DOWN, emits failure count increment
      const events4 = monitor.recordCheckFailure(failCheck, incidentId1);
      expect(monitor.healthStatus).toBe(HealthStatus.DOWN);
      expect(monitor.consecutiveFailures).toBe(4);
      expect(events4).toHaveLength(1);
      expect(events4[0]).toBeInstanceOf(IncidentFailureCountIncrementedDomainEvent);
      const countEvent = events4[0] as IncidentFailureCountIncrementedDomainEvent;
      expect(countEvent.failureCount).toBe(4);
    });

    it("handles recovery: requires 2 consecutive successes when DOWN to return to UP", () => {
      const incidentId = makeUuid();
      const monitor = createTestMonitor({
        healthStatus: HealthStatus.DOWN,
        consecutiveFailures: 3,
        currentIncidentId: incidentId,
      });

      const successCheck = createCheck(true);

      // 1st success while DOWN: remains DOWN (UI displays RECOVERING), no resolve event
      const events1 = monitor.recordCheckSuccess(successCheck);
      expect(monitor.healthStatus).toBe(HealthStatus.DOWN);
      expect(monitor.consecutiveSuccesses).toBe(1);
      expect(monitor.currentIncidentId).toBe(incidentId);
      expect(events1).toHaveLength(0);

      // Intermittent failure resets consecutiveSuccesses back to 0!
      const failCheck = createCheck(false);
      monitor.recordCheckFailure(failCheck, incidentId);
      expect(monitor.consecutiveSuccesses).toBe(0);
      expect(monitor.consecutiveFailures).toBe(1);

      // 1st success again
      monitor.recordCheckSuccess(successCheck);
      expect(monitor.consecutiveSuccesses).toBe(1);

      // 2nd consecutive success: transitions to UP, clears incidentId, emits IncidentRecovered
      const events2 = monitor.recordCheckSuccess(successCheck);
      expect(monitor.healthStatus).toBe(HealthStatus.UP);
      expect(monitor.consecutiveSuccesses).toBe(2);
      expect(monitor.currentIncidentId).toBeNull();
      expect(events2).toHaveLength(1);
      expect(events2[0]).toBeInstanceOf(IncidentRecoveredDomainEvent);
      const recoveredEvent = events2[0] as IncidentRecoveredDomainEvent;
      expect(recoveredEvent.incidentId).toBe(incidentId);
    });

    it("pause retains open incident (outage stays open) and resume resets health to UNKNOWN", () => {
      const incidentId = makeUuid();
      const monitor = createTestMonitor({
        healthStatus: HealthStatus.DOWN,
        currentIncidentId: incidentId,
      });

      monitor.pause();
      expect(monitor.isActive).toBe(false);
      expect(monitor.healthStatus).toBe(HealthStatus.PAUSED);
      // ARCH §3.2 line 308: incident remains open during pause
      expect(monitor.currentIncidentId).toBe(incidentId);

      const resumeTime = new Date("2026-10-23T14:00:00.000Z");
      monitor.resume(resumeTime);
      expect(monitor.isActive).toBe(true);
      expect(monitor.healthStatus).toBe(HealthStatus.UNKNOWN);
      expect(monitor.nextRunAt).toEqual(resumeTime);
    });

    it("rejects manual check results from triggering state machine transitions (D-13)", () => {
      const monitor = createTestMonitor();
      const manualCheck = createCheck(false, TriggerType.MANUAL);

      expect(() => monitor.recordCheckFailure(manualCheck, makeUuid())).toThrow(
        ValidationException,
      );
      expect(() => monitor.recordCheckSuccess(manualCheck)).toThrow(ValidationException);
    });
  });

  describe("Incident Entity Lifecycle", () => {
    it("opens, records subsequent failures, and resolves with duration in seconds", () => {
      const started = new Date("2026-10-23T10:00:00.000Z");
      const incId = makeUuid();

      const incident = Incident.open(
        incId,
        monitorId,
        FailureCategory.HTTP_STATUS_MISMATCH,
        "Received status 500",
        started,
      );

      expect(incident.failureCount).toBe(1);
      expect(incident.isResolved).toBe(false);

      incident.registerFailure();
      expect(incident.failureCount).toBe(2);

      const recovered = new Date("2026-10-23T10:05:30.000Z"); // 330 seconds later
      incident.resolve(recovered);

      expect(incident.isResolved).toBe(true);
      expect(incident.recoveredAt).toEqual(recovered);
      expect(incident.durationSeconds).toBe(330);
    });

    it("rejects resolving an already resolved incident or registering failures on resolved incident", () => {
      const started = new Date("2026-10-23T10:00:00.000Z");
      const incident = Incident.open(
        makeUuid(),
        monitorId,
        FailureCategory.CONNECTION_TIMEOUT,
        "Timeout after 5000ms",
        started,
      );

      incident.resolve(new Date("2026-10-23T10:01:00.000Z"));

      expect(() => incident.resolve(new Date("2026-10-23T10:02:00.000Z"))).toThrow(
        ConflictException,
      );
      expect(() => incident.registerFailure()).toThrow(ConflictException);
    });

    it("rejects resolution timestamp earlier than incident startedAt", () => {
      const started = new Date("2026-10-23T10:00:00.000Z");
      const incident = Incident.open(
        makeUuid(),
        monitorId,
        FailureCategory.TLS_HANDSHAKE_FAILED,
        "Certificate expired",
        started,
      );

      expect(() => incident.resolve(new Date("2026-10-23T09:59:00.000Z"))).toThrow(
        ValidationException,
      );
    });
  });
});
