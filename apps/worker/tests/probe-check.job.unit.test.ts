import type { ExecuteScheduledCheckUseCase, LoggerPort } from "@sentinel/application";
import type { JobWithMetadata, PgBoss } from "@sentinel/infra";
import { describe, expect, it, vi } from "vitest";
import { ProbeCheckJobHandler, type ProbeCheckJobPayload } from "../src/jobs/probe-check.job.js";

const mockLogger: LoggerPort = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: () => mockLogger,
};

describe("ProbeCheckJobHandler (P9.3)", () => {
  it("registers pg-boss work handler with concurrency 20 and processes batches", async () => {
    let registeredQueue: string | null = null;
    let registeredOptions: unknown = null;
    let registeredHandler:
      | ((jobs: JobWithMetadata<ProbeCheckJobPayload>[]) => Promise<void>)
      | null = null;

    const mockBoss = {
      work: vi.fn(async (queue: string, options: unknown, handler: unknown) => {
        registeredQueue = queue;
        registeredOptions = options;
        registeredHandler = handler as (
          jobs: JobWithMetadata<ProbeCheckJobPayload>[],
        ) => Promise<void>;
        return "handler-id";
      }),
    } as unknown as PgBoss;

    const mockUseCase = {
      execute: vi.fn(async () => ({
        status: "EXECUTED" as const,
        checkResultId: "018f0000-0000-7000-8000-000000000001",
        isSuccess: true,
        healthStatus: "UP",
      })),
    } as unknown as ExecuteScheduledCheckUseCase;

    const measuredLags: number[] = [];
    let activeCount = 0;

    const handler = new ProbeCheckJobHandler(mockBoss, mockUseCase, mockLogger, {
      concurrency: 20,
      onLagMeasured: (lag) => measuredLags.push(lag),
      onJobStarted: () => {
        activeCount += 1;
      },
      onJobFinished: () => {
        activeCount -= 1;
      },
    });

    await handler.register();

    expect(registeredQueue).toBe("probe:check");
    expect(registeredOptions).toEqual({
      batchSize: 20,
      localConcurrency: 20,
      includeMetadata: true,
    });
    expect(registeredHandler).toBeDefined();

    // Simulate batch execution
    const now = Date.now();
    const scheduledForDate = new Date(now - 3500); // 3.5s ago

    const mockJob: JobWithMetadata<ProbeCheckJobPayload> = {
      id: "job-1",
      name: "probe:check",
      data: {
        monitorId: "018f0000-0000-7000-8000-000000000010",
        __traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        scheduledFor: scheduledForDate.toISOString(),
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
      startAfter: scheduledForDate,
      startedOn: new Date(),
      singletonKey: "018f0000-0000-7000-8000-000000000010",
      singletonOn: null,
      deleteAfterSeconds: 3600,
      createdOn: scheduledForDate,
      completedOn: null,
    };

    await registeredHandler?.([mockJob]);

    expect(mockUseCase.execute).toHaveBeenCalledWith({
      monitorId: "018f0000-0000-7000-8000-000000000010",
      scheduledFor: expect.any(Date),
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      checkId: undefined,
      triggerType: "SCHEDULED",
    });

    expect(measuredLags).toHaveLength(1);
    expect(measuredLags[0]).toBeGreaterThanOrEqual(3);
    expect(activeCount).toBe(0);
  });
});
