import type { ExecuteScheduledCheckUseCase, LoggerPort } from "@sentinel/application";
import {
  getSentinelMetrics,
  type JobWithMetadata,
  type PgBoss,
  recordChildSpan,
  withSpan,
} from "@sentinel/infra";

export interface ProbeCheckJobPayload {
  readonly monitorId: string;
  readonly __traceparent?: string;
  readonly scheduledFor?: string;
  readonly triggerType?: "SCHEDULED" | "MANUAL";
  readonly checkId?: string;
}

export interface ProbeCheckJobOptions {
  readonly concurrency?: number;
  readonly onLagMeasured?: (lagSeconds: number) => void;
  readonly onJobStarted?: () => void;
  readonly onJobFinished?: () => void;
}

export class ProbeCheckJobHandler {
  public static readonly QUEUE_NAME = "probe:check";
  public static readonly DEFAULT_CONCURRENCY = 20;

  constructor(
    private readonly boss: PgBoss,
    private readonly executeScheduledCheckUseCase: ExecuteScheduledCheckUseCase,
    private readonly logger: LoggerPort,
    private readonly options: ProbeCheckJobOptions = {},
  ) {}

  public async register(): Promise<void> {
    const concurrency = this.options.concurrency ?? ProbeCheckJobHandler.DEFAULT_CONCURRENCY;
    const metrics = getSentinelMetrics();

    await this.boss.work<ProbeCheckJobPayload>(
      ProbeCheckJobHandler.QUEUE_NAME,
      {
        batchSize: concurrency,
        localConcurrency: concurrency,
        includeMetadata: true,
      },
      async (jobs) => {
        await Promise.all(
          jobs.map(async (job) => {
            this.options.onJobStarted?.();
            const jobStartTime = Date.now();
            try {
              const data = job.data;
              const scheduledFor = data.scheduledFor
                ? new Date(data.scheduledFor)
                : ((job as JobWithMetadata).createdOn ?? new Date());

              const lagSeconds = Math.max(0, (jobStartTime - scheduledFor.getTime()) / 1000);
              this.options.onLagMeasured?.(lagSeconds);
              metrics.setJobLag({ queue: "probe:check", lagSeconds });

              await withSpan(
                "worker.job.probe_check",
                {
                  parentTraceparent: data.__traceparent,
                  attributes: {
                    "monitor.id": data.monitorId,
                    "job.id": job.id,
                    "trigger.type": data.triggerType ?? "SCHEDULED",
                  },
                },
                async () => {
                  recordChildSpan({
                    name: "queue.wait_duration",
                    startTime: scheduledFor,
                    endTime: jobStartTime,
                    attributes: {
                      "queue.name": "probe:check",
                      lag_seconds: lagSeconds,
                    },
                  });

                  const result = await this.executeScheduledCheckUseCase.execute({
                    monitorId: data.monitorId,
                    scheduledFor,
                    traceparent: data.__traceparent,
                    checkId: data.checkId,
                    triggerType: data.triggerType ?? "SCHEDULED",
                  });

                  if (result.status === "EXECUTED") {
                    metrics.recordProbe({
                      monitorId: data.monitorId,
                      isSuccess: Boolean(result.isSuccess),
                      durationMs: result.durationMs ?? null,
                      failureCategory: result.failureCategory ?? null,
                    });

                    if (result.healthStatus) {
                      metrics.setIncidentActive({
                        monitorId: data.monitorId,
                        isActive: result.healthStatus === "DOWN",
                      });
                    }
                  }
                },
              );
            } catch (error) {
              this.logger.error("Error executing probe:check job in worker", {
                jobId: job.id,
                monitorId: job.data.monitorId,
                error: error instanceof Error ? error.message : String(error),
              });
              throw error;
            } finally {
              this.options.onJobFinished?.();
            }
          }),
        );
      },
    );

    this.logger.info("Registered pg-boss probe:check worker", {
      queue: ProbeCheckJobHandler.QUEUE_NAME,
      concurrency,
    });
  }
}
