export interface UnitOfWorkPort {
  runInTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T>;
}
