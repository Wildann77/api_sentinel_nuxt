import type { DispatchNotificationUseCase, LoggerPort } from "@sentinel/application";
import type { PgBoss } from "@sentinel/infra";

export interface NotificationJobPayload {
  readonly deliveryId?: string;
  readonly incidentId: string;
  readonly monitorId?: string;
  readonly type: "OPENED" | "RECOVERED";
}

export interface NotificationJobOptions {
  readonly concurrency?: number;
  readonly onJobStarted?: () => void;
  readonly onJobFinished?: () => void;
}

export class NotificationJobHandler {
  public static readonly QUEUE_NAME = "notification:send";
  public static readonly DEFAULT_CONCURRENCY = 5;

  constructor(
    private readonly boss: PgBoss,
    private readonly dispatchNotificationUseCase: DispatchNotificationUseCase,
    private readonly logger: LoggerPort,
    private readonly options: NotificationJobOptions = {},
  ) {}

  public async register(): Promise<void> {
    const concurrency = this.options.concurrency ?? NotificationJobHandler.DEFAULT_CONCURRENCY;

    await this.boss.work<NotificationJobPayload>(
      NotificationJobHandler.QUEUE_NAME,
      {
        batchSize: concurrency,
        localConcurrency: concurrency,
        includeMetadata: true,
      },
      async (jobs) => {
        await Promise.all(
          jobs.map(async (job) => {
            this.options.onJobStarted?.();
            try {
              const data = job.data;
              await this.dispatchNotificationUseCase.execute({
                deliveryId: data.deliveryId,
                incidentId: data.incidentId,
                monitorId: data.monitorId,
                type: data.type,
              });
            } catch (error) {
              this.logger.error("Error executing notification:send job in worker", {
                jobId: job.id,
                incidentId: job.data.incidentId,
                type: job.data.type,
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

    this.logger.info("Registered pg-boss notification:send worker", {
      queue: NotificationJobHandler.QUEUE_NAME,
      concurrency,
    });
  }
}
