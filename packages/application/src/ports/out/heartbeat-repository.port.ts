export interface WorkerHeartbeatData {
  readonly workerId: string;
  readonly lastSeenAt: Date;
  readonly runningJobs: number;
}

export interface HeartbeatRepositoryPort {
  upsert(heartbeat: WorkerHeartbeatData, tx?: unknown): Promise<void>;
  findActive(cutoff: Date): Promise<WorkerHeartbeatData[]>;
  deleteStale(cutoff: Date, tx?: unknown): Promise<number>;
}
