import type { SessionData, SessionRepositoryPort } from "../ports/out/session-repository.port.js";

export class InMemorySessionRepository implements SessionRepositoryPort {
  private sessions = new Map<string, SessionData>();

  public async create(session: SessionData, _tx?: unknown): Promise<void> {
    this.sessions.set(session.tokenHash, { ...session });
  }

  public async findByTokenHash(tokenHash: string): Promise<SessionData | null> {
    const session = this.sessions.get(tokenHash);
    return session ? { ...session } : null;
  }

  public async touch(tokenHash: string, newIdleExpiresAt: Date): Promise<void> {
    const session = this.sessions.get(tokenHash);
    if (session) {
      this.sessions.set(tokenHash, {
        ...session,
        idleExpiresAt: newIdleExpiresAt,
        lastActiveAt: new Date(),
      });
    }
  }

  public async revoke(tokenHash: string, _tx?: unknown): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  public async revokeAllForUser(
    userId: string,
    exceptTokenHash?: string,
    _tx?: unknown,
  ): Promise<void> {
    for (const [tokenHash, session] of this.sessions.entries()) {
      if (session.userId === userId && tokenHash !== exceptTokenHash) {
        this.sessions.delete(tokenHash);
      }
    }
  }

  public async deleteExpired(): Promise<number> {
    const now = new Date();
    let deleted = 0;
    for (const [tokenHash, session] of this.sessions.entries()) {
      if (session.idleExpiresAt < now || session.absoluteExpiresAt < now) {
        this.sessions.delete(tokenHash);
        deleted += 1;
      }
    }
    return deleted;
  }

  public clear(): void {
    this.sessions.clear();
  }
}
