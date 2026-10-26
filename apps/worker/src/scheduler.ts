import crypto from "node:crypto";
import type {
  ClockPort,
  LoggerPort,
  MonitorRepositoryPort,
  QueuePort,
  UnitOfWorkPort,
} from "@sentinel/application";

export interface WorkerSchedulerOptions {
  readonly intervalMs?: number;
  readonly batchSize?: number;
  readonly clock?: ClockPort;
}

export class WorkerScheduler {
  public static readonly DEFAULT_INTERVAL_MS = 5000;
  public static readonly DEFAULT_BATCH_SIZE = 50;

  private isRunningState = false;
  private timer: NodeJS.Timeout | null = null;
  private tickPromise: Promise<number> | null = null;
  private readonly intervalMs: number;
  private readonly batchSize: number;

  constructor(
    private readonly monitorRepository: MonitorRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly queuePort: QueuePort,
    private readonly logger: LoggerPort,
    private readonly options: WorkerSchedulerOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? WorkerScheduler.DEFAULT_INTERVAL_MS;
    this.batchSize = options.batchSize ?? WorkerScheduler.DEFAULT_BATCH_SIZE;
  }

  public get isRunning(): boolean {
    return this.isRunningState;
  }

  public start(): void {
    if (this.isRunningState) {
      return;
    }

    this.isRunningState = true;
    this.logger.info("Worker scheduler loop started", {
      intervalMs: this.intervalMs,
      batchSize: this.batchSize,
    });

    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    this.timer.unref();
  }

  public async stop(): Promise<void> {
    if (!this.isRunningState) {
      return;
    }

    this.isRunningState = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.tickPromise) {
      await this.tickPromise;
    }

    this.logger.info("Worker scheduler loop stopped");
  }

  public tick(executionTime?: Date): Promise<number> {
    if (this.tickPromise) {
      return this.tickPromise;
    }

    const now = executionTime ?? (this.options.clock ? this.options.clock.now() : new Date());

    this.tickPromise = (async () => {
      try {
        return await this.unitOfWork.runInTransaction(async (tx) => {
          const claimedMonitors = await this.monitorRepository.claimDue(this.batchSize, tx);

          if (claimedMonitors.length === 0) {
            return 0;
          }

          let enqueuedCount = 0;
          let dedupedCount = 0;

          for (const monitor of claimedMonitors) {
            const scheduledFor = monitor.nextRunAt;
            const nextRunAt = monitor.computeNextRun(now);
            await this.monitorRepository.updateNextRun(monitor.id, nextRunAt, tx);

            const traceparent = this.createTraceparent();
            const monitorIdStr = monitor.id.toString();

            const jobId = await this.queuePort.send(
              "probe:check",
              {
                monitorId: monitorIdStr,
                __traceparent: traceparent,
                scheduledFor: scheduledFor.toISOString(),
              },
              {
                singletonKey: monitorIdStr,
                db: tx,
              },
            );

            if (jobId === null) {
              dedupedCount += 1;
              this.logger.debug(
                "Probe check skipped due to stately queue deduplication (job already pending)",
                { monitorId: monitorIdStr },
              );
            } else {
              enqueuedCount += 1;
            }
          }

          this.logger.info("Worker scheduler tick completed", {
            claimed: claimedMonitors.length,
            enqueued: enqueuedCount,
            deduped: dedupedCount,
          });

          return claimedMonitors.length;
        });
      } catch (error) {
        this.logger.error("Worker scheduler tick failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return 0;
      } finally {
        this.tickPromise = null;
      }
    })();

    return this.tickPromise;
  }

  private createTraceparent(): string {
    const traceId = crypto.randomBytes(16).toString("hex");
    const spanId = crypto.randomBytes(8).toString("hex");
    return `00-${traceId}-${spanId}-01`;
  }
}
