import {
  AssertionRule,
  EndpointUrl,
  FailureCategory,
  HttpMethod,
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
  FakeUnitOfWork,
  InMemoryCheckResultRepository,
  InMemoryMonitorRepository,
  SequentialIdGenerator,
} from "../src/test-doubles/index.js";
import { ExecuteManualCheck } from "../src/use-cases/monitors/execute-manual-check.use-case.js";

describe("P9.4 — ExecuteManualCheckUseCase Unit Tests", () => {
  let monitorRepo: InMemoryMonitorRepository;
  let checkResultRepo: InMemoryCheckResultRepository;
  let uow: FakeUnitOfWork;
  let probe: FakeProbe;
  let cipher: FakeCipher;
  let idGen: SequentialIdGenerator;
  let clock: FakeClock;
  let logger: FakeLogger;
  let useCase: ExecuteManualCheck;

  const createActiveMonitor = (overrides: Partial<Parameters<typeof Monitor.create>[0]> = {}) => {
    const id = UUIDv7.fromString(idGen.generate());
    const monitor = Monitor.create({
      id,
      name: "API Manual Check Test",
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
    uow = new FakeUnitOfWork();
    probe = new FakeProbe();
    cipher = new FakeCipher();
    idGen = new SequentialIdGenerator();
    clock = new FakeClock();
    logger = new FakeLogger();

    useCase = new ExecuteManualCheck(
      monitorRepo,
      checkResultRepo,
      uow,
      cipher,
      clock,
      idGen,
      logger,
      probe,
    );
  });

  it("executes manual check successfully and saves result with trigger_type = MANUAL (D-13)", async () => {
    const monitor = createActiveMonitor();
    await monitorRepo.save(monitor);

    probe.enqueueResponse({
      statusCode: 200,
      durationMs: 45,
      headers: { "content-type": "application/json" },
      bodySnippet: '{"status":"ok"}',
    });

    const result = await useCase.execute({ monitorId: monitor.id.toString() });

    expect(result.status).toBe("UP");
    expect(result.statusCode).toBe(200);
    expect(result.triggerType).toBe("MANUAL");
    expect(result.diagnostics.assertionResults[0]?.passed).toBe(true);

    const savedChecks = await checkResultRepo.findByMonitorId(monitor.id.toString());
    expect(savedChecks).toHaveLength(1);
    expect(savedChecks[0]?.triggerType).toBe(TriggerType.MANUAL);
    expect(savedChecks[0]?.isSuccess).toBe(true);

    // Verify monitor health status and counters remain untouched (D-13)
    const refreshed = await monitorRepo.findById(monitor.id.toString());
    expect(refreshed?.healthStatus).toBe("UNKNOWN");
    expect(refreshed?.consecutiveSuccesses).toBe(0);
    expect(refreshed?.consecutiveFailures).toBe(0);
  });

  it("handles failed probe without modifying monitor state or opening incidents (D-13)", async () => {
    const monitor = createActiveMonitor({ healthStatus: "HEALTHY" });
    await monitorRepo.save(monitor);

    probe.enqueueResponse({
      errorCategory: FailureCategory.CONNECTION_TIMEOUT,
      errorMessage: "Gateway timeout occurred after 5000ms",
      durationMs: 5000,
    });

    const result = await useCase.execute({ monitorId: monitor.id.toString() });

    expect(result.status).toBe("DOWN");
    expect(result.failureCategory).toBe(FailureCategory.CONNECTION_TIMEOUT);
    expect(result.failureReason).toContain("Gateway timeout");
    expect(result.triggerType).toBe("MANUAL");

    const savedChecks = await checkResultRepo.findByMonitorId(monitor.id.toString());
    expect(savedChecks).toHaveLength(1);
    expect(savedChecks[0]?.isSuccess).toBe(false);

    // Monitor healthStatus remains HEALTHY, failureCount remains 0
    const refreshed = await monitorRepo.findById(monitor.id.toString());
    expect(refreshed?.healthStatus).toBe("HEALTHY");
    expect(refreshed?.consecutiveFailures).toBe(0);
  });

  it("throws error when monitor is not found", async () => {
    const nonExistentId = idGen.generate();
    await expect(useCase.execute({ monitorId: nonExistentId })).rejects.toThrow(
      `Monitor with ID '${nonExistentId}' not found.`,
    );
  });
});
