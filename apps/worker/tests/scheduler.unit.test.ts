import type {
  LoggerPort,
  QueuePort,
  QueueSendOptions,
  UnitOfWorkPort,
} from "@sentinel/application";
import { EndpointUrl, Monitor, UUIDv7 } from "@sentinel/domain";
import { describe, expect, it, vi } from "vitest";
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
  public async runInTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    return work({ isTx: true });
  }
}

class MockQueuePort implements QueuePort {
  public sentJobs: Array<{ queueName: string; payload: unknown; options?: QueueSendOptions }> = [];
  public returnJobId: string | null = "job-123";

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

const createTestMonitor = (idStr: string, intervalSeconds = 60): Monitor => {
  return new Monitor({
    id: UUIDv7.fromString(idStr),
    name: "Test Monitor",
    url: new EndpointUrl("https://example.com/api"),
    method: "GET",
    intervalSeconds,
    timeoutMs: 5000,
    isActive: true,
    healthStatus: "UP",
    consecutiveFailures: 0,
    consecutiveSuccesses: 1,
    currentIncidentId: null,
    version: 1,
    lastCheckedAt: null,
    nextRunAt: new Date(Date.now() - 1000),
  });
};

describe("WorkerScheduler (P9.2)", () => {
  it("claims due monitors, updates next_run_at with jitter, and enqueues probe:check with traceparent", async () => {
    const monitor1 = createTestMonitor("018d4d84-4824-7cc1-b957-8fbce5b8c001", 60);
    const monitor2 = createTestMonitor("018d4d84-4824-7cc1-b957-8fbce5b8c002", 120);

    const updatedNextRuns = new Map<string, Date>();
    const mockRepo = {
      claimDue: vi.fn().mockResolvedValue([monitor1, monitor2]),
      updateNextRun: vi.fn().mockImplementation((id: UUIDv7, nextRunAt: Date) => {
        updatedNextRuns.set(id.toString(), nextRunAt);
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

    const uow = new MockUnitOfWork();
    const queue = new MockQueuePort();

    const scheduler = new WorkerScheduler(mockRepo, uow, queue, mockLogger, {
      batchSize: 50,
    });

    const now = new Date("2026-10-24T12:00:00Z");
    const claimedCount = await scheduler.tick(now);

    expect(claimedCount).toBe(2);
    expect(mockRepo.claimDue).toHaveBeenCalledWith(50, { isTx: true });

    // Verify nextRunAt updated with jitter within ±5%
    expect(updatedNextRuns.has(monitor1.id.toString())).toBe(true);
    const nextRun1 = updatedNextRuns.get(monitor1.id.toString());
    expect(nextRun1).toBeDefined();
    if (!nextRun1) {
      throw new Error("nextRun1 is undefined");
    }
    const diffSeconds1 = (nextRun1.getTime() - now.getTime()) / 1000;
    expect(diffSeconds1).toBeGreaterThanOrEqual(60 * 0.95 - 1);
    expect(diffSeconds1).toBeLessThanOrEqual(60 * 1.05 + 1);

    // Verify jobs enqueued with traceparent and singletonKey
    expect(queue.sentJobs.length).toBe(2);
    expect(queue.sentJobs[0].queueName).toBe("probe:check");
    expect(queue.sentJobs[0].options?.singletonKey).toBe(monitor1.id.toString());
    expect(queue.sentJobs[0].options?.db).toEqual({ isTx: true });

    const payload1 = queue.sentJobs[0].payload as { monitorId: string; __traceparent: string };
    expect(payload1.monitorId).toBe(monitor1.id.toString());
    expect(payload1.__traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it("handles deduplication when jobId is null without throwing", async () => {
    const monitor = createTestMonitor("018d4d84-4824-7cc1-b957-8fbce5b8c003", 60);

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

    const uow = new MockUnitOfWork();
    const queue = new MockQueuePort();
    queue.returnJobId = null; // Stately deduplication rejected duplicate enqueue

    const scheduler = new WorkerScheduler(mockRepo, uow, queue, mockLogger);
    const result = await scheduler.tick();

    expect(result).toBe(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining("deduplication"),
      expect.objectContaining({ monitorId: monitor.id.toString() }),
    );
  });

  it("guards against overlapping tick execution", async () => {
    let slowResolve: () => void;
    const slowPromise = new Promise<void>((resolve) => {
      slowResolve = resolve;
    });

    const mockRepo = {
      claimDue: vi.fn().mockImplementation(async () => {
        await slowPromise;
        return [];
      }),
      updateNextRun: vi.fn(),
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

    const uow = new MockUnitOfWork();
    const queue = new MockQueuePort();

    const scheduler = new WorkerScheduler(mockRepo, uow, queue, mockLogger);

    const firstTick = scheduler.tick();
    const secondTick = scheduler.tick();

    expect(secondTick).toBe(firstTick); // Re-entrant call returns the in-flight promise

    slowResolve?.();
    await firstTick;
  });
});
