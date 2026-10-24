export interface SessionData {
  readonly tokenHash: string;
  readonly userId: string;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly createdAt: Date;
  readonly lastActiveAt: Date;
}

export interface SessionRepositoryPort {
  create(session: SessionData, tx?: unknown): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<SessionData | null>;
  touch(tokenHash: string, newIdleExpiresAt: Date): Promise<void>;
  revoke(tokenHash: string, tx?: unknown): Promise<void>;
  revokeAllForUser(userId: string, exceptTokenHash?: string, tx?: unknown): Promise<void>;
  deleteExpired(): Promise<number>;
}
