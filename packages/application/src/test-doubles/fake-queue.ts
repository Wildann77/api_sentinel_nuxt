import type { QueuePort, QueueSendOptions } from "../ports/out/queue.port.js";

export interface EnqueuedJob<T = unknown> {
  readonly id: string;
  readonly queueName: string;
  readonly payload: T;
  readonly options?: QueueSendOptions;
  readonly enqueuedAt: Date;
}

export class FakeQueue implements QueuePort {
  public jobs: EnqueuedJob[] = [];
  private jobCounter = 1;
  public rejectDuplicateSingletonKey = false;

  public async send<T extends object>(
    queueName: string,
    payload: T,
    options?: QueueSendOptions,
  ): Promise<string | null> {
    if (this.rejectDuplicateSingletonKey && options?.singletonKey) {
      const exists = this.jobs.some(
        (job) => job.queueName === queueName && job.options?.singletonKey === options.singletonKey,
      );
      if (exists) {
        return null;
      }
    }

    const id = `job_${this.jobCounter++}`;
    this.jobs.push({
      id,
      queueName,
      payload,
      options,
      enqueuedAt: new Date(),
    });

    return id;
  }

  public findJobs<T = unknown>(queueName?: string): EnqueuedJob<T>[] {
    if (!queueName) {
      return this.jobs as EnqueuedJob<T>[];
    }
    return this.jobs.filter((j) => j.queueName === queueName) as EnqueuedJob<T>[];
  }

  public clear(): void {
    this.jobs = [];
    this.jobCounter = 1;
  }
}
