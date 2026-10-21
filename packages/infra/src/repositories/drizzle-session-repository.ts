import crypto from "node:crypto";
import type { SessionData, SessionRepositoryPort } from "@sentinel/application";
import { and, eq, lt, ne, or } from "drizzle-orm";
import type { DrizzleDatabase } from "../db/connection.js";
import { sessions } from "../db/schema/index.js";
import { SessionMapper } from "./mappers/session.mapper.js";

export class DrizzleSessionRepository implements SessionRepositoryPort {
  constructor(private readonly db: DrizzleDatabase) {}

  private getDb(tx?: unknown): DrizzleDatabase {
    return (tx as DrizzleDatabase) ?? this.db;
  }

  public async create(session: SessionData, tx?: unknown): Promise<void> {
    const targetDb = this.getDb(tx);
    const id = crypto.randomUUID();
    await targetDb.insert(sessions).values(SessionMapper.toInsert(session, id));
  }

  public async findByTokenHash(tokenHash: string): Promise<SessionData | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);

    return row ? SessionMapper.toDomain(row) : null;
  }

  public async touch(tokenHash: string, newIdleExpiresAt: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        idleExpiresAt: newIdleExpiresAt,
        lastActiveAt: new Date(),
      })
      .where(eq(sessions.tokenHash, tokenHash));
  }

  public async revoke(tokenHash: string, tx?: unknown): Promise<void> {
    const targetDb = this.getDb(tx);
    await targetDb.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }

  public async revokeAllForUser(
    userId: string,
    exceptTokenHash?: string,
    tx?: unknown,
  ): Promise<void> {
    const targetDb = this.getDb(tx);
    const condition = exceptTokenHash
      ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, exceptTokenHash))
      : eq(sessions.userId, userId);

    await targetDb.delete(sessions).where(condition);
  }

  public async deleteExpired(): Promise<number> {
    const now = new Date();
    const deleted = await this.db
      .delete(sessions)
      .where(or(lt(sessions.idleExpiresAt, now), lt(sessions.absoluteExpiresAt, now)))
      .returning({ id: sessions.id });

    return deleted.length;
  }
}
