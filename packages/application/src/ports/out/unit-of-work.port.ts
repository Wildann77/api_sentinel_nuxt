export interface UnitOfWorkPort {
  runInTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T>;
  notify(tx: unknown, channel: string, payload: string): Promise<void>;
}
