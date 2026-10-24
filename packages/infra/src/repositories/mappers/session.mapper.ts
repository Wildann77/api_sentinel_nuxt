import type { SessionData } from "@sentinel/application";
import type { SessionInsert, SessionSelect } from "../../db/schema/index.js";

export const SessionMapper = {
  toDomain(row: SessionSelect): SessionData {
    return {
      tokenHash: row.tokenHash,
      userId: row.userId,
      idleExpiresAt: row.idleExpiresAt,
      absoluteExpiresAt: row.absoluteExpiresAt,
      lastActiveAt: row.lastActiveAt,
      createdAt: row.createdAt,
    };
  },

  toInsert(session: SessionData, id: string): SessionInsert {
    return {
      id,
      userId: session.userId,
      tokenHash: session.tokenHash,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      lastActiveAt: session.lastActiveAt,
      createdAt: session.createdAt,
    };
  },
};
