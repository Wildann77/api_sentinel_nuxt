import type { DispatchNotificationUseCase, LoggerPort } from "@sentinel/application";
import type { JobWithMetadata, PgBoss } from "@sentinel/infra";
import { describe, expect, it, vi } from "vitest";
import {
  NotificationJobHandler,
  type NotificationJobPayload,
} from "../src/jobs/notification.job.js";

const mockLogger: LoggerPort = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: () => mockLogger,
};

describe("NotificationJobHandler (P10.3)", () => {
  it("registers pg-boss worker for notification:send with concurrency 5", async () => {
    let registeredQueue: string | null = null;
    let registeredOptions: unknown = null;
    let registeredHandler:
      | ((jobs: JobWithMetadata<NotificationJobPayload>[]) => Promise<void>)
      | null = null;

    const mockBoss = {
      work: vi.fn(async (queue: string, options: unknown, handler: unknown) => {
        registeredQueue = queue;
        registeredOptions = options;
        registeredHandler = handler as (
          jobs: JobWithMetadata<NotificationJobPayload>[],
        ) => Promise<void>;
        return "handler-id";
      }),
    } as unknown as PgBoss;

    const mockUseCase = {
      execute: vi.fn(async () => undefined),
    } as unknown as DispatchNotificationUseCase;

    let activeCount = 0;

    const handler = new NotificationJobHandler(mockBoss, mockUseCase, mockLogger, {
      concurrency: 5,
      onJobStarted: () => {
        activeCount += 1;
      },
      onJobFinished: () => {
        activeCount -= 1;
      },
    });

    await handler.register();

    expect(registeredQueue).toBe("notification:send");
    expect(registeredOptions).toEqual({
      batchSize: 5,
      localConcurrency: 5,
      includeMetadata: true,
    });
    expect(registeredHandler).not.toBeNull();

    // Execute job
    const mockJobs: JobWithMetadata<NotificationJobPayload>[] = [
      {
        id: "job-1",
        name: "notification:send",
        data: {
          deliveryId: "deliv-1",
          incidentId: "inc-1",
          type: "OPENED",
        },
      } as unknown as JobWithMetadata<NotificationJobPayload>,
    ];

    if (registeredHandler) {
      await registeredHandler(mockJobs);
    }

    expect(mockUseCase.execute).toHaveBeenCalledWith({
      deliveryId: "deliv-1",
      incidentId: "inc-1",
      monitorId: undefined,
      type: "OPENED",
    });
    expect(activeCount).toBe(0);
  });

  it("propagates error on failure so pg-boss triggers retry backoff", async () => {
    let registeredHandler:
      | ((jobs: JobWithMetadata<NotificationJobPayload>[]) => Promise<void>)
      | null = null;

    const mockBoss = {
      work: vi.fn(async (_queue: string, _options: unknown, handler: unknown) => {
        registeredHandler = handler as (
          jobs: JobWithMetadata<NotificationJobPayload>[],
        ) => Promise<void>;
        return "handler-id";
      }),
    } as unknown as PgBoss;

    const mockUseCase = {
      execute: vi.fn(async () => {
        throw new Error("Telegram rate limited 429");
      }),
    } as unknown as DispatchNotificationUseCase;

    const handler = new NotificationJobHandler(mockBoss, mockUseCase, mockLogger);
    await handler.register();

    const mockJobs: JobWithMetadata<NotificationJobPayload>[] = [
      {
        id: "job-2",
        name: "notification:send",
        data: {
          incidentId: "inc-2",
          type: "RECOVERED",
        },
      } as unknown as JobWithMetadata<NotificationJobPayload>,
    ];

    if (registeredHandler) {
      await expect(registeredHandler(mockJobs)).rejects.toThrow("Telegram rate limited 429");
    }
  });
});
