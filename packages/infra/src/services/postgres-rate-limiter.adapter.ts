import type { ClockPort, RateLimiterPort, RateLimitResult } from "@sentinel/application";
import { RateLimitExceededException } from "@sentinel/domain";
import { sql } from "drizzle-orm";
import type { DrizzleDatabase } from "../db/connection.js";

export const RATE_LIMIT_TIERS = {
  TIER_1_LOGIN_IP: {
    limit: 5,
    windowSeconds: 15 * 60,
    key: (ip: string) => `ip:login:${ip}`,
  },
  TIER_1_LOGIN_USER: {
    limit: 5,
    windowSeconds: 15 * 60,
    key: (username: string) => `user:login:${username}`,
  },
  TIER_2_MONITOR_CHECK: {
    limit: 1,
    windowSeconds: 10,
    key: (monitorId: string) => `monitor:check:${monitorId}`,
  },
  TIER_2_USER_CHECK: {
    limit: 20,
    windowSeconds: 60,
    key: (userId: string) => `user:check:${userId}`,
  },
  TIER_3_USER_API: {
    limit: 120,
    windowSeconds: 60,
    key: (userId: string) => `user:api:${userId}`,
  },
} as const;

export class PostgresRateLimiterAdapter implements RateLimiterPort {
  constructor(
    private readonly db: DrizzleDatabase,
    private readonly clock?: ClockPort,
  ) {}

  public async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    if (limit <= 0) {
      throw new Error("Rate limit must be greater than 0");
    }
    if (windowSeconds <= 0) {
      throw new Error("Window seconds must be greater than 0");
    }

    const now = this.clock ? this.clock.now() : new Date();
    const expireAt = new Date(now.getTime() + windowSeconds * 1000);

    const queryResult = await this.db.execute<{
      points: number | string;
      expire_at: Date | string;
    }>(sql`
      INSERT INTO "rate_limits" ("key", "points", "expire_at")
      VALUES (${key}, 1, ${expireAt})
      ON CONFLICT ("key") DO UPDATE
      SET
        points = CASE
          WHEN rate_limits.expire_at <= ${now} THEN 1
          WHEN rate_limits.points > ${limit} THEN rate_limits.points
          ELSE rate_limits.points + 1
        END,
        expire_at = CASE
          WHEN rate_limits.expire_at <= ${now} THEN ${expireAt}
          ELSE rate_limits.expire_at
        END
      RETURNING
        points,
        expire_at;
    `);

    const row = queryResult.rows[0];
    if (!row) {
      throw new Error(`Failed to consume rate limit for key '${key}': empty result`);
    }

    const currentPoints = Number(row.points);
    const rowExpireAt = row.expire_at instanceof Date ? row.expire_at : new Date(row.expire_at);

    const remainingMs = Math.max(0, rowExpireAt.getTime() - now.getTime());
    const resetAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    const allowed = currentPoints <= limit;
    const remaining = allowed ? Math.max(0, limit - currentPoints) : 0;

    return {
      allowed,
      remaining,
      resetAfterSeconds,
    };
  }

  public async consumeOrThrow(
    key: string,
    limit: number,
    windowSeconds: number,
    customMessage?: string,
  ): Promise<RateLimitResult> {
    const result = await this.consume(key, limit, windowSeconds);
    if (!result.allowed) {
      throw new RateLimitExceededException(
        customMessage ??
          `Batas laju permintaan untuk kunci '${key}' terlampaui. Coba lagi dalam ${result.resetAfterSeconds} detik.`,
        result.resetAfterSeconds,
      );
    }
    return result;
  }

  public async consumeTier1LoginByIp(ip: string): Promise<RateLimitResult> {
    const cfg = RATE_LIMIT_TIERS.TIER_1_LOGIN_IP;
    return this.consumeOrThrow(cfg.key(ip), cfg.limit, cfg.windowSeconds);
  }

  public async consumeTier1LoginByUsername(username: string): Promise<RateLimitResult> {
    const cfg = RATE_LIMIT_TIERS.TIER_1_LOGIN_USER;
    return this.consumeOrThrow(cfg.key(username), cfg.limit, cfg.windowSeconds);
  }

  public async consumeTier2MonitorCheck(monitorId: string): Promise<RateLimitResult> {
    const cfg = RATE_LIMIT_TIERS.TIER_2_MONITOR_CHECK;
    return this.consumeOrThrow(cfg.key(monitorId), cfg.limit, cfg.windowSeconds);
  }

  public async consumeTier2UserCheck(userId: string): Promise<RateLimitResult> {
    const cfg = RATE_LIMIT_TIERS.TIER_2_USER_CHECK;
    return this.consumeOrThrow(cfg.key(userId), cfg.limit, cfg.windowSeconds);
  }

  public async consumeTier3UserApi(userId: string): Promise<RateLimitResult> {
    const cfg = RATE_LIMIT_TIERS.TIER_3_USER_API;
    return this.consumeOrThrow(cfg.key(userId), cfg.limit, cfg.windowSeconds);
  }

  public async pruneExpired(before?: Date): Promise<number> {
    const cutoff = before ?? (this.clock ? this.clock.now() : new Date());
    const result = await this.db.execute(sql`
      DELETE FROM "rate_limits"
      WHERE "expire_at" <= ${cutoff};
    `);
    return result.rowCount ?? 0;
  }

  public async reset(key: string): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM "rate_limits"
      WHERE "key" = ${key};
    `);
  }
}
