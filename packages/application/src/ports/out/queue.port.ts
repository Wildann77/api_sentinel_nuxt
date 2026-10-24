export interface QueueSendOptions {
  readonly db?: unknown;
  readonly startAfter?: number | string | Date;
  readonly singletonKey?: string;
  readonly retryLimit?: number;
  readonly retryDelay?: number;
  readonly expireInSeconds?: number;
}

export interface QueuePort {
  send<T extends object>(
    queueName: string,
    payload: T,
    options?: QueueSendOptions,
  ): Promise<string | null>;
}
