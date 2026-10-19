import {
  AssertionRule,
  EndpointUrl,
  FailureCategory,
  HttpMethod,
  Incident,
  Monitor,
  TriggerType,
  UUIDv7,
} from "@sentinel/domain";

import { beforeEach, describe, expect, it } from "vitest";
import {
  FakeCipher,
  FakeClock,
  FakeLogger,
  FakeProbe,
  FakeQueue,
  FakeUnitOfWork,
  InMemoryCheckResultRepository,
  InMemoryIncidentRepository,
  InMemoryMonitorRepository,
  InMemoryNotificationDeliveryRepository,
  SequentialIdGenerator,
} from "../src/test-doubles/index.js";
import { ExecuteScheduledCheck } from "../src/use-cases/monitors/execute-scheduled-check.use-case.js";

describe("P9.3 — ExecuteScheduledCheckUseCase Unit Tests", () => {
  let monitorRepo: InMemoryMonitorRepository;
  let checkResultRepo: InMemoryCheckResultRepository;
  let incidentRepo: InMemoryIncidentRepository;
  let deliveryRepo: InMemoryNotificationDeliveryRepository;
  let uow: FakeUnitOfWork;
  let probe: FakeProbe;
  let cipher: FakeCipher;
  let queue: FakeQueue;
  let idGen: SequentialIdGenerator;
  let clock: FakeClock;
  let logger: FakeLogger;
  let useCase: ExecuteScheduledCheck;

  const createActiveMonitor = (overrides: Partial<Parameters<typeof Monitor.create>[0]> = {}) => {
    const id = UUIDv7.fromString(idGen.generate());
    const monitor = Monitor.create({
      id,
      name: "API Test",
      url: EndpointUrl.create("https://api.example.com/health"),
      method: HttpMethod.GET,
      intervalSeconds: 60,
      timeoutMs: 5000,
      isActive: true,
      healthStatus: "UNKNOWN",
      assertionRules: [new AssertionRule({ type: "status", expected: [200] })],
      ...overrides,
    });
    return monitor;
  };

  beforeEach(() => {
    monitorRepo = new InMemoryMonitorRepository();
    checkResultRepo = new InMemoryCheckResultRepository();
    incidentRepo = new InMemoryIncidentRepository();
    deliveryRepo = new InMemoryNotificationDeliveryRepository();
    uow = new FakeUnitOfWork();
    probe = new FakeProbe();
    cipher = new FakeCipher();
    queue = new FakeQueue();
    idGen = new SequentialIdGenerator();
    clock = new FakeClock(new Date("2026-10-24T12:00:00.000Z"));
    logger = new FakeLogger();

    useCase = new ExecuteScheduledCheck(
      monitorRepo,
      checkResultRepo,
      incidentRepo,
      deliveryRepo,
      uow,
      probe,
      cipher,
      queue,
      idGen,
      clock,
      logger,
    );
  });

  it("skips check if monitor does not exist", async () => {
    const nonExistentId = idGen.generate();
    const result = await useCase.execute({ monitorId: nonExistentId });

    expect(result.status).toBe("SKIPPED");
    expect(result.reason).toBe("Monitor not found");
    expect(probe.history).toHaveLength(0);
    expect(uow.transactionCount).toBe(0);
  });

  it("skips check if monitor is inactive (paused)", async () => {
    const monitor = createActiveMonitor({ isActive: false, healthStatus: "PAUSED" });
    await monitorRepo.save(monitor);

    const result = await useCase.execute({ monitorId: monitor.id.toString() });

    expect(result.status).toBe("SKIPPED");
    expect(result.reason).toBe("Monitor is paused or inactive");
    expect(probe.history).toHaveLength(0);
  });

  it("executes successful scheduled check and transitions monitor to UP", async () => {
    const monitor = createActiveMonitor();
    await monitorRepo.save(monitor);

    probe.enqueueResponse({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      bodySnippet: '{"status":"ok"}',
      durationMs: 42,
      pinnedIp: "93.184.216.34",
    });

    const result = await useCase.execute({
      monitorId: monitor.id.toString(),
      scheduledFor: new Date("2026-10-24T12:00:00.000Z"),
    });

    expect(result.status).toBe("EXECUTED");
    expect(result.isSuccess).toBe(true);
    expect(result.healthStatus).toBe("UP");

    const updatedMonitor = await monitorRepo.findById(monitor.id);
    expect(updatedMonitor?.healthStatus).toBe("UP");
    expect(updatedMonitor?.consecutiveSuccesses).toBe(1);
    expect(updatedMonitor?.consecutiveFailures).toBe(0);

    const savedResults = await checkResultRepo.findByMonitorId(monitor.id, 10);
    expect(savedResults).toHaveLength(1);
    expect(savedResults[0]?.isSuccess).toBe(true);
    expect(savedResults[0]?.statusCode).toBe(200);
    expect(savedResults[0]?.durationMs).toBe(42);

    expect(uow.notifications).toHaveLength(1);
    expect(uow.notifications[0]?.channel).toBe("sentinel_events");
    const eventPayload = JSON.parse(uow.notifications[0]?.payload ?? "{}");
    expect(eventPayload.event).toBe("CHECK_COMPLETED");
    expect(eventPayload.status).toBe("UP");
  });

  it("transitions to DEGRADED on consecutive failures 1 and 2 without opening incident", async () => {
    const monitor = createActiveMonitor();
    await monitorRepo.save(monitor);

    // Failure 1 (HTTP 500)
    probe.enqueueResponse({
      statusCode: 500,
      headers: {},
      bodySnippet: "Internal error",
      durationMs: 120,
    });

    const res1 = await useCase.execute({ monitorId: monitor.id.toString() });
    expect(res1.isSuccess).toBe(false);
    expect(res1.healthStatus).toBe("DEGRADED");

    const monitorAfter1 = await monitorRepo.findById(monitor.id);
    expect(monitorAfter1?.healthStatus).toBe("DEGRADED");
    expect(monitorAfter1?.consecutiveFailures).toBe(1);
    expect(await incidentRepo.findAll()).toHaveLength(0);

    // Failure 2 (HTTP 502)
    probe.enqueueResponse({
      statusCode: 502,
      headers: {},
      bodySnippet: "Bad gateway",
      durationMs: 150,
    });

    const res2 = await useCase.execute({ monitorId: monitor.id.toString() });
    expect(res2.isSuccess).toBe(false);
    expect(res2.healthStatus).toBe("DEGRADED");

    const monitorAfter2 = await monitorRepo.findById(monitor.id);
    expect(monitorAfter2?.healthStatus).toBe("DEGRADED");
    expect(monitorAfter2?.consecutiveFailures).toBe(2);
    expect(await incidentRepo.findAll()).toHaveLength(0);
  });

  it("opens incident on 3rd consecutive failure, dispatches notification, and transitions to DOWN", async () => {
    const monitor = createActiveMonitor({
      consecutiveFailures: 2,
      healthStatus: "DEGRADED",
    });
    await monitorRepo.save(monitor);

    // Failure 3 (HTTP 503)
    probe.enqueueResponse({
      statusCode: 503,
      headers: {},
      bodySnippet: "Service Unavailable",
      durationMs: 200,
    });

    const result = await useCase.execute({ monitorId: monitor.id.toString() });
    expect(result.isSuccess).toBe(false);
    expect(result.healthStatus).toBe("DOWN");

    const updatedMonitor = await monitorRepo.findById(monitor.id);
    expect(updatedMonitor?.healthStatus).toBe("DOWN");
    expect(updatedMonitor?.consecutiveFailures).toBe(3);
    expect(updatedMonitor?.currentIncidentId).not.toBeNull();

    // Verify Incident created
    const incidents = await incidentRepo.findAll();
    const incident = incidents[0];
    expect(incident).toBeDefined();
    if (!incident) throw new Error("Incident not found");
    expect(incident.monitorId.toString()).toBe(monitor.id.toString());

    expect(incident.causeCategory).toBe(FailureCategory.HTTP_STATUS_MISMATCH);
    expect(incident.isResolved).toBe(false);

    // Verify Notification Delivery inserted PENDING
    const deliveries = await deliveryRepo.findByIncidentId(incident.id.toString());
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("PENDING");
    expect(deliveries[0]?.channel).toBe("TELEGRAM");

    // Verify pg-boss job queued with singletonKey
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]?.queueName).toBe("notification:send");
    expect(queue.jobs[0]?.options?.singletonKey).toBe(`${incident.id.toString()}:OPENED`);

    // Verify NOTIFY sent for INCIDENT_TRANSITION and CHECK_COMPLETED
    expect(uow.notifications).toHaveLength(2);
    const incidentEvent = JSON.parse(uow.notifications[0]?.payload ?? "{}");
    expect(incidentEvent.event).toBe("INCIDENT_TRANSITION");
    expect(incidentEvent.type).toBe("OPENED");
    expect(incidentEvent.healthStatus).toBe("DOWN");

    const checkEvent = JSON.parse(uow.notifications[1]?.payload ?? "{}");
    expect(checkEvent.event).toBe("CHECK_COMPLETED");
    expect(checkEvent.status).toBe("DOWN");
  });

  it("increments failure count on subsequent failures during open incident", async () => {
    const incidentId = UUIDv7.fromString(idGen.generate());
    const monitor = createActiveMonitor({
      consecutiveFailures: 3,
      healthStatus: "DOWN",
      currentIncidentId: incidentId,
    });
    await monitorRepo.save(monitor);

    // Failure 4
    probe.enqueueResponse({
      statusCode: 500,
      headers: {},
      bodySnippet: "Still failing",
      durationMs: 100,
    });

    const result = await useCase.execute({ monitorId: monitor.id.toString() });
    expect(result.healthStatus).toBe("DOWN");

    const updatedMonitor = await monitorRepo.findById(monitor.id);
    expect(updatedMonitor?.consecutiveFailures).toBe(4);
    // Should NOT create new incident, only 1 remains
    expect(await incidentRepo.findAll()).toHaveLength(0); // in-memory had none pre-seeded
  });

  it("recovers incident after 2 consecutive successes when status is DOWN", async () => {
    const incidentId = UUIDv7.fromString(idGen.generate());
    const monitor = createActiveMonitor({
      consecutiveFailures: 4,
      consecutiveSuccesses: 0,
      healthStatus: "DOWN",
      currentIncidentId: incidentId,
    });
    await monitorRepo.save(monitor);

    // Pre-seed the incident
    const incident = Incident.open(
      incidentId,
      monitor.id,
      FailureCategory.HTTP_STATUS_MISMATCH,
      "503 Service Unavailable",
      new Date("2026-10-24T11:00:00.000Z"),
    );
    await incidentRepo.save(incident);

    // Success 1: remains DOWN (recovering state)
    probe.enqueueResponse({
      statusCode: 200,
      headers: {},
      bodySnippet: "OK",
      durationMs: 30,
    });

    const res1 = await useCase.execute({ monitorId: monitor.id.toString() });
    expect(res1.isSuccess).toBe(true);
    expect(res1.healthStatus).toBe("DOWN");

    const monitorAfter1 = await monitorRepo.findById(monitor.id);
    expect(monitorAfter1?.consecutiveSuccesses).toBe(1);
    expect(monitorAfter1?.healthStatus).toBe("DOWN");

    // Success 2: transitions to UP and resolves incident
    probe.enqueueResponse({
      statusCode: 200,
      headers: {},
      bodySnippet: "OK",
      durationMs: 28,
    });

    const res2 = await useCase.execute({ monitorId: monitor.id.toString() });
    expect(res2.isSuccess).toBe(true);
    expect(res2.healthStatus).toBe("UP");

    const monitorAfter2 = await monitorRepo.findById(monitor.id);
    expect(monitorAfter2?.healthStatus).toBe("UP");
    expect(monitorAfter2?.currentIncidentId).toBeNull();

    // Verify incident resolved
    const resolvedIncident = await incidentRepo.findById(incidentId);
    expect(resolvedIncident?.isResolved).toBe(true);
    expect(resolvedIncident?.recoveredAt).not.toBeNull();

    // Verify recovery notification queued
    const recoveryDeliveries = await deliveryRepo.findByIncidentId(incidentId.toString());
    expect(recoveryDeliveries).toHaveLength(1);

    expect(
      queue.jobs.some((m) => m.options?.singletonKey === `${incidentId.toString()}:RECOVERED`),
    ).toBe(true);
  });

  it("handles downstream probe failure (network / SSRF / timeout) resiliently without crashing", async () => {
    const monitor = createActiveMonitor();
    await monitorRepo.save(monitor);

    // Probe returns network connection refused
    probe.enqueueResponse({
      statusCode: null,
      headers: {},
      bodySnippet: null,
      durationMs: 15,
      errorCategory: FailureCategory.CONNECTION_REFUSED,
      errorMessage: "connect ECONNREFUSED 127.0.0.1:8080",
    });

    const result = await useCase.execute({ monitorId: monitor.id.toString() });

    expect(result.status).toBe("EXECUTED");
    expect(result.isSuccess).toBe(false);
    expect(result.healthStatus).toBe("DEGRADED");

    const savedResults = await checkResultRepo.findByMonitorId(monitor.id, 10);
    expect(savedResults).toHaveLength(1);
    expect(savedResults[0]?.isSuccess).toBe(false);
    expect(savedResults[0]?.failureCategory).toBe(FailureCategory.CONNECTION_REFUSED);
    expect(savedResults[0]?.sanitizedDiagnostic).toContain("ECONNREFUSED");
  });

  it("executes manual check without modifying monitor health status or counters (D-13)", async () => {
    const monitor = createActiveMonitor({
      consecutiveFailures: 1,
      consecutiveSuccesses: 0,
      healthStatus: "DEGRADED",
    });
    await monitorRepo.save(monitor);

    probe.enqueueResponse({
      statusCode: 200,
      headers: {},
      bodySnippet: "OK",
      durationMs: 25,
    });

    const result = await useCase.execute({
      monitorId: monitor.id.toString(),
      triggerType: TriggerType.MANUAL,
    });

    expect(result.status).toBe("EXECUTED");
    expect(result.isSuccess).toBe(true);

    const savedMonitor = await monitorRepo.findById(monitor.id);
    expect(savedMonitor?.healthStatus).toBe("DEGRADED"); // Unchanged!
    expect(savedMonitor?.consecutiveFailures).toBe(1); // Unchanged!
    expect(savedMonitor?.consecutiveSuccesses).toBe(0); // Unchanged!

    const savedResults = await checkResultRepo.findByMonitorId(monitor.id, 10);
    expect(savedResults).toHaveLength(1);
    expect(savedResults[0]?.triggerType).toBe(TriggerType.MANUAL);
  });
});
