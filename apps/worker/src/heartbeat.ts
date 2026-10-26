import type { HeartbeatRepositoryPort, LoggerPort } from "@sentinel/application";
import { getSentinelMetrics } from "@sentinel/infra";

export interface WorkerHeartbeatOptions {
  readonly intervalSeconds?: number;
  readonly getRunningJobs?: () => number;
}

export class WorkerHeartbeatService {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private tickPromise: Promise<void> | null = null;
  private lastHeartbeatEpoch: number = Math.floor(Date.now() / 1000);
  private runningJobsCount = 0;

  constructor(
    private readonly heartbeatRepository: HeartbeatRepositoryPort,
    private readonly logger: LoggerPort,
    public readonly workerId: string,
    private readonly options: WorkerHeartbeatOptions = {},
  ) {}

  public get running(): boolean {
    return this.isRunning;
  }

  public getLastHeartbeatEpoch(): number {
    return this.lastHeartbeatEpoch;
  }

  public getRunningJobs(): number {
    return this.options.getRunningJobs ? this.options.getRunningJobs() : this.runningJobsCount;
  }

  public setRunningJobs(count: number): void {
    this.runningJobsCount = Math.max(0, count);
  }

  public start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    const intervalMs = Math.max(1, this.options.intervalSeconds ?? 15) * 1000;

    void this.tick();

    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref();
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.tickPromise) {
      await this.tickPromise;
    }
  }

  public async tick(): Promise<void> {
    if (this.tickPromise) {
      return this.tickPromise;
    }

    this.tickPromise = (async () => {
      try {
        const now = new Date();
        const runningJobs = this.getRunningJobs();

        await this.heartbeatRepository.upsert({
          workerId: this.workerId,
          lastSeenAt: now,
          runningJobs,
        });

        this.lastHeartbeatEpoch = Math.floor(now.getTime() / 1000);
        getSentinelMetrics().setWorkerHeartbeat({
          workerId: this.workerId,
          timestampEpochSeconds: this.lastHeartbeatEpoch,
        });
        this.logger.debug("Worker heartbeat emitted", {
          workerId: this.workerId,
          runningJobs,
          epoch: this.lastHeartbeatEpoch,
        });
      } catch (error) {
        this.logger.error("Failed to emit worker heartbeat", {
          workerId: this.workerId,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.tickPromise = null;
      }
    })();

    return this.tickPromise;
  }
}
