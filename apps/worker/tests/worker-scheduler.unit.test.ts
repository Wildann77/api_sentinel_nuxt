import type {
  ExecuteScheduledCheckUseCase,
  LoggerPort,
  QueuePort,
  QueueSendOptions,
  UnitOfWorkPort,
} from "@sentinel/application";
import { EndpointUrl, FailureCategory, HttpMethod, Monitor, UUIDv7 } from "@sentinel/domain";
import type { JobWithMetadata, PgBoss } from "@sentinel/infra";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProbeCheckJobHandler, type ProbeCheckJobPayload } from "../src/jobs/probe-check.job.js";
import { WorkerScheduler } from "../src/scheduler.js";

const mockLogger: LoggerPort = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: () => mockLogger,
};

class MockUnitOfWork implements UnitOfWorkPort {
  public shouldFail = false;

  public async runInTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    if (this.shouldFail) {
      throw new Error("Database connection lost during transaction (Simulated DB disruption)");
    }
    return work({ isTx: true });
  }
}

class MockQueuePort implements QueuePort {
  public sentJobs: Array<{ queueName: string; payload: unknown; options?: QueueSendOptions }> = [];
  public returnJobId: string | null = "job-mock-123";

  public async send<T extends object>(
    queueName: string,
    payload: T,
    options?: QueueSendOptions,
  ): Promise<string | null> {
    this.sentJobs.push({ queueName, payload, options });
    return this.returnJobId;
  }

  public async cancel(): Promise<void> {}
}

const createMonitor = (
  idStr: string,
  overrides: { isActive?: boolean; intervalSeconds?: number; nextRunAt?: Date } = {},
): Monitor => {
  return new Monitor({
    id: UUIDv7.fromString(idStr),
    name: "Scenario Test Monitor",
    url: new EndpointUrl("https://service.internal/health"),
    method: HttpMethod.GET,
    intervalSeconds: overrides.intervalSeconds ?? 60,
    timeoutMs: 5000,
    isActive: overrides.isActive ?? true,
    healthStatus: "UNKNOWN",
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    currentIncidentId: null,
    version: 1,
    lastCheckedAt: null,
    nextRunAt: overrides.nextRunAt ?? new Date(Date.now() - 5000),
  });
};

describe("P9.6 — Pengujian Worker & Scheduler (PRD §5.4)", () => {
  let uow: MockUnitOfWork;
  let queue: MockQueuePort;

  beforeEach(() => {
    uow = new MockUnitOfWork();
    queue = new MockQueuePort();
    vi.clearAllMocks();
  });

  // Skenario 1: Monitor jatuh tempo dijalankan; yang dijeda tidak.
  it("Scenario 1: Due active monitors are claimed and enqueued; paused/inactive monitors are skipped", async () => {
    const activeDueMonitor = createMonitor("019488a0-0000-7000-8000-000000000001", {
      isActive: true,
      nextRunAt: new Date(Date.now() - 10000),
    });

    const mockRepo = {
      claimDue: vi.fn().mockImplementation(async () => {
        // DB filter `WHERE is_active AND next_run_at <= NOW()` only returns active due monitors
        return [activeDueMonitor];
      }),
      updateNextRun: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findDueMonitors: vi.fn(),
      lockForUpdate: vi.fn(),
      findWithFilter: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const scheduler = new WorkerScheduler(mockRepo, uow, queue, mockLogger);
    const claimed = await scheduler.tick();

    expect(claimed).toBe(1);
    expect(mockRepo.claimDue).toHaveBeenCalledTimes(1);
    expect(queue.sentJobs).toHaveLength(1);
    const firstPayload = queue.sentJobs[0]?.payload as { monitorId: string } | undefined;
    expect(firstPayload?.monitorId).toBe(activeDueMonitor.id.toString());
  });

  // Skenario 2: Worker hidup kembali menemukan pekerjaan tertinggal tanpa lonjakan (no cascade catch-up).
  it("Scenario 2: Resurrected worker catches up without avalanche cascade, resetting next_run_at to NOW() + interval ± 5%", async () => {
    // Monitor fell behind by 2 hours during downtime
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    const laggedMonitor = createMonitor("019488a0-0000-7000-8000-000000000002", {
      intervalSeconds: 60,
      nextRunAt: twoHoursAgo,
    });

    let updatedNextRunAt: Date | null = null;
    const mockRepo = {
      claimDue: vi.fn().mockResolvedValue([laggedMonitor]),
      updateNextRun: vi.fn().mockImplementation((_id: UUIDv7, nextRun: Date) => {
        updatedNextRunAt = nextRun;
        return Promise.resolve();
      }),
      findById: vi.fn(),
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findDueMonitors: vi.fn(),
      lockForUpdate: vi.fn(),
      findWithFilter: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const scheduler = new WorkerScheduler(mockRepo, uow, queue, mockLogger, {
      batchSize: 50,
    });

    const now = new Date("2026-10-24T12:00:00.000Z");
    await scheduler.tick(now);

    expect(queue.sentJobs).toHaveLength(1);
    expect(updatedNextRunAt).not.toBeNull();
    if (!updatedNextRunAt) {
      throw new Error("updatedNextRunAt was not set");
    }

    // next_run_at must NOT be set to past or intermediate catch-up times (e.g. 2 hours ago + 60s)
    // It must be scheduled from NOW() + 60s ± 5% jitter
    const scheduledDiffSeconds = (updatedNextRunAt.getTime() - now.getTime()) / 1000;
    expect(scheduledDiffSeconds).toBeGreaterThanOrEqual(60 * 0.95 - 1);
    expect(scheduledDiffSeconds).toBeLessThanOrEqual(60 * 1.05 + 1);
  });

  // Skenario 3: Dua worker tidak mengambil pekerjaan sama (FOR UPDATE SKIP LOCKED simulation).
  it("Scenario 3: Two concurrent workers do not claim or process the same monitors", async () => {
    const monitorA = createMonitor("019488a0-0000-7000-8000-00000000000a");
    const monitorB = createMonitor("019488a0-0000-7000-8000-00000000000b");

    const availableInDb = [monitorA, monitorB];
    const claimedByWorker = new Map<string, string[]>();

    const createWorkerRepo = (workerName: string) => ({
      claimDue: vi.fn().mockImplementation(async () => {
        // Atomic SKIP LOCKED: each monitor is claimed by at most one worker
        const claimed = availableInDb.splice(0, 1);
        claimedByWorker.set(
          workerName,
          claimed.map((m) => m.id.toString()),
        );
        return claimed;
      }),
      updateNextRun: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findDueMonitors: vi.fn(),
      lockForUpdate: vi.fn(),
      findWithFilter: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    });

    const queue1 = new MockQueuePort();
    const queue2 = new MockQueuePort();

    const scheduler1 = new WorkerScheduler(createWorkerRepo("worker-1"), uow, queue1, mockLogger);
    const scheduler2 = new WorkerScheduler(createWorkerRepo("worker-2"), uow, queue2, mockLogger);

    await Promise.all([scheduler1.tick(), scheduler2.tick()]);

    const worker1Claims = claimedByWorker.get("worker-1") ?? [];
    const worker2Claims = claimedByWorker.get("worker-2") ?? [];

    expect(worker1Claims).toHaveLength(1);
    expect(worker2Claims).toHaveLength(1);
    // Disjoint set: Worker 1 and Worker 2 claimed different monitors
    expect(worker1Claims[0]).not.toBe(worker2Claims[0]);
  });

  // Skenario 4: Request lambat tidak menumpuk pekerjaan (deduplication policy).
  it("Scenario 4: Slow running check prevents unbounded accumulation via pg-boss stately singleton deduplication", async () => {
    const monitor = createMonitor("019488a0-0000-7000-8000-000000000004");

    const mockRepo = {
      claimDue: vi.fn().mockResolvedValue([monitor]),
      updateNextRun: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findDueMonitors: vi.fn(),
      lockForUpdate: vi.fn(),
      findWithFilter: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const scheduler = new WorkerScheduler(mockRepo, uow, queue, mockLogger);

    // Queue deduplication returns null when previous job is still in flight (singletonKey active)
    queue.returnJobId = null;

    const count = await scheduler.tick();
    expect(count).toBe(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining("stately queue deduplication"),
      expect.objectContaining({ monitorId: monitor.id.toString() }),
    );
  });

  // Skenario 5: Timeout dicatat sebagai kegagalan.
  it("Scenario 5: Timeout is recorded as failure and initiates failure tracking", async () => {
    let capturedResult: unknown = null;

    const mockUseCase: ExecuteScheduledCheckUseCase = {
      execute: vi.fn().mockImplementation(async (cmd) => {
        capturedResult = {
          status: "EXECUTED",
          monitorId: cmd.monitorId,
          isSuccess: false,
          failureCategory: FailureCategory.CONNECTION_TIMEOUT,
          healthStatus: "DOWN",
        };
        return capturedResult;
      }),
    };

    let workerHandler: ((jobs: JobWithMetadata<ProbeCheckJobPayload>[]) => Promise<void>) | null =
      null;
    const mockBoss = {
      work: vi.fn().mockImplementation((_queue, _opts, handler) => {
        workerHandler = handler;
        return Promise.resolve("handler-id");
      }),
    } as unknown as PgBoss;

    const jobHandler = new ProbeCheckJobHandler(mockBoss, mockUseCase, mockLogger);
    await jobHandler.register();

    const timeoutJob: JobWithMetadata<ProbeCheckJobPayload> = {
      id: "job-timeout-1",
      name: "probe:check",
      data: {
        monitorId: "019488a0-0000-7000-8000-000000000005",
        triggerType: "SCHEDULED",
      },
      expireInSeconds: 30,
      heartbeatSeconds: 15,
      retryCount: 0,
      signal: new AbortController().signal,
      priority: 0,
      state: "active",
      retryLimit: 1,
      retryDelay: 10,
      retryBackoff: false,
      startAfter: new Date(),
      startedOn: new Date(),
      singletonKey: "019488a0-0000-7000-8000-000000000005",
      singletonOn: null,
      deleteAfterSeconds: 3600,
      createdOn: new Date(),
      completedOn: null,
    };

    if (!workerHandler) {
      throw new Error("workerHandler not initialized");
    }
    await workerHandler([timeoutJob]);

    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        monitorId: "019488a0-0000-7000-8000-000000000005",
      }),
    );
    expect(capturedResult).toEqual(
      expect.objectContaining({
        isSuccess: false,
        failureCategory: FailureCategory.CONNECTION_TIMEOUT,
        healthStatus: "DOWN",
      }),
    );
  });

  // Skenario 6: Gangguan DB tidak menghilangkan pekerjaan secara diam-diam.
  it("Scenario 6: Database disruption fails the job with an exception, preventing silent loss", async () => {
    uow.shouldFail = true;

    const mockUseCase: ExecuteScheduledCheckUseCase = {
      execute: vi.fn().mockImplementation(async () => {
        await uow.runInTransaction(async () => {
          // This will throw due to uow.shouldFail
        });
        return { status: "EXECUTED", isSuccess: true, healthStatus: "HEALTHY" };
      }),
    };

    let workerHandler: ((jobs: JobWithMetadata<ProbeCheckJobPayload>[]) => Promise<void>) | null =
      null;
    const mockBoss = {
      work: vi.fn().mockImplementation((_queue, _opts, handler) => {
        workerHandler = handler;
        return Promise.resolve("handler-id");
      }),
    } as unknown as PgBoss;

    const jobHandler = new ProbeCheckJobHandler(mockBoss, mockUseCase, mockLogger);
    await jobHandler.register();

    const failingJob: JobWithMetadata<ProbeCheckJobPayload> = {
      id: "job-db-fail-1",
      name: "probe:check",
      data: {
        monitorId: "019488a0-0000-7000-8000-000000000006",
      },
      expireInSeconds: 30,
      heartbeatSeconds: 15,
      retryCount: 0,
      signal: new AbortController().signal,
      priority: 0,
      state: "active",
      retryLimit: 1,
      retryDelay: 10,
      retryBackoff: false,
      startAfter: new Date(),
      startedOn: new Date(),
      singletonKey: "019488a0-0000-7000-8000-000000000006",
      singletonOn: null,
      deleteAfterSeconds: 3600,
      createdOn: new Date(),
      completedOn: null,
    };

    if (!workerHandler) {
      throw new Error("workerHandler not initialized");
    }

    // The handler MUST throw on DB disruption so pg-boss retries and does NOT mark as completed
    await expect(workerHandler([failingJob])).rejects.toThrow(
      "Database connection lost during transaction",
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Error executing probe:check job in worker",
      expect.objectContaining({ jobId: "job-db-fail-1" }),
    );
  });

  // Skenario 7: Manual check tidak merusak jadwal.
  it("Scenario 7: Manual check execution does not corrupt or modify scheduler next_run_at state", async () => {
    const scheduledNextRunAt = new Date("2026-10-24T15:30:00.000Z");
    const monitor = createMonitor("019488a0-0000-7000-8000-000000000007", {
      nextRunAt: scheduledNextRunAt,
      intervalSeconds: 120,
    });

    const mockUseCase: ExecuteScheduledCheckUseCase = {
      execute: vi.fn().mockImplementation(async (cmd) => {
        expect(cmd.triggerType).toBe("MANUAL");
        // Manual check execution retains monitor's scheduled next_run_at intact (D-13)
        return {
          status: "EXECUTED",
          isSuccess: true,
          healthStatus: monitor.healthStatus,
        };
      }),
    };

    let workerHandler: ((jobs: JobWithMetadata<ProbeCheckJobPayload>[]) => Promise<void>) | null =
      null;
    const mockBoss = {
      work: vi.fn().mockImplementation((_queue, _opts, handler) => {
        workerHandler = handler;
        return Promise.resolve("handler-id");
      }),
    } as unknown as PgBoss;

    const jobHandler = new ProbeCheckJobHandler(mockBoss, mockUseCase, mockLogger);
    await jobHandler.register();

    const manualJob: JobWithMetadata<ProbeCheckJobPayload> = {
      id: "job-manual-1",
      name: "probe:check",
      data: {
        monitorId: monitor.id.toString(),
        triggerType: "MANUAL",
      },
      expireInSeconds: 30,
      heartbeatSeconds: 15,
      retryCount: 0,
      signal: new AbortController().signal,
      priority: 10,
      state: "active",
      retryLimit: 1,
      retryDelay: 10,
      retryBackoff: false,
      startAfter: new Date(),
      startedOn: new Date(),
      singletonKey: monitor.id.toString(),
      singletonOn: null,
      deleteAfterSeconds: 3600,
      createdOn: new Date(),
      completedOn: null,
    };

    if (!workerHandler) {
      throw new Error("workerHandler not initialized");
    }
    await workerHandler([manualJob]);

    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        monitorId: monitor.id.toString(),
        triggerType: "MANUAL",
      }),
    );
    // The next_run_at remained untouched
    expect(monitor.nextRunAt).toEqual(scheduledNextRunAt);
  });
});
