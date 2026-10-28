import { RateLimitExceededException } from "@sentinel/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DrizzleDatabase } from "../src/db/connection.js";
import { closePgPool, createDrizzleDb, createPgPool } from "../src/db/connection.js";
import { rateLimits } from "../src/db/schema/index.js";
import {
  PostgresRateLimiterAdapter,
  RATE_LIMIT_TIERS,
} from "../src/services/postgres-rate-limiter.adapter.js";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel_dev";

class TestClock {
  public currentTime: Date;

  constructor(initialTime?: Date) {
    this.currentTime = initialTime ?? new Date();
  }

  public now(): Date {
    return this.currentTime;
  }

  public advanceSeconds(seconds: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + seconds * 1000);
  }
}

describe("P5.5 — PostgresRateLimiterAdapter Integration & Concurrency Test", () => {
  let pool: ReturnType<typeof createPgPool>;
  let db: DrizzleDatabase;
  let clock: TestClock;
  let limiter: PostgresRateLimiterAdapter;

  beforeAll(() => {
    pool = createPgPool({
      connectionString: TEST_DB_URL,
      applicationName: "sentinel_rate_limiter_test",
      max: 20,
    });
    db = createDrizzleDb(pool);
  });

  afterAll(async () => {
    await closePgPool(pool);
  });

  beforeEach(async () => {
    await db.delete(rateLimits);
    clock = new TestClock(new Date("2026-10-24T12:00:00Z"));
    limiter = new PostgresRateLimiterAdapter(db, clock);
  });

  it("consumes tokens within window and blocks when limit reached", async () => {
    const key = "test:user:1";
    const limit = 3;
    const windowSeconds = 10;

    // 1st consumption
    const res1 = await limiter.consume(key, limit, windowSeconds);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);
    expect(res1.resetAfterSeconds).toBe(10);

    // 2nd consumption
    const res2 = await limiter.consume(key, limit, windowSeconds);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(1);

    // 3rd consumption
    const res3 = await limiter.consume(key, limit, windowSeconds);
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);

    // 4th consumption: blocked
    const res4 = await limiter.consume(key, limit, windowSeconds);
    expect(res4.allowed).toBe(false);
    expect(res4.remaining).toBe(0);
    expect(res4.resetAfterSeconds).toBe(10);
  });

  it("resets window when time advances past expire_at", async () => {
    const key = "test:expiry:1";
    const limit = 2;
    const windowSeconds = 5;

    await limiter.consume(key, limit, windowSeconds);
    const blockedRes = await limiter.consume(key, limit, windowSeconds);
    expect(blockedRes.allowed).toBe(true);

    const third = await limiter.consume(key, limit, windowSeconds);
    expect(third.allowed).toBe(false);

    // Advance clock past the 5-second window
    clock.advanceSeconds(6);

    // Should successfully reset window and allow requests again
    const postExpiryRes = await limiter.consume(key, limit, windowSeconds);
    expect(postExpiryRes.allowed).toBe(true);
    expect(postExpiryRes.remaining).toBe(1);
    expect(postExpiryRes.resetAfterSeconds).toBe(5);
  });

  it("enforces strict concurrency without leaking requests beyond limit", async () => {
    const key = "test:concurrency:high_load";
    const limit = 10;
    const windowSeconds = 30;
    const concurrentRequests = 30;

    // Fire 30 requests concurrently
    const results = await Promise.all(
      Array.from({ length: concurrentRequests }).map(() =>
        limiter.consume(key, limit, windowSeconds),
      ),
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    const blockedCount = results.filter((r) => !r.allowed).length;

    // In a strict atomic rate limiter, EXACTLY 10 requests must be allowed, 20 blocked
    expect(allowedCount).toBe(limit);
    expect(blockedCount).toBe(concurrentRequests - limit);

    for (const blocked of results.filter((r) => !r.allowed)) {
      expect(blocked.remaining).toBe(0);
      expect(blocked.resetAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("throws RateLimitExceededException with retryAfterSeconds on consumeOrThrow", async () => {
    const key = "test:throw:1";
    const limit = 1;
    const windowSeconds = 15;

    await limiter.consumeOrThrow(key, limit, windowSeconds);

    try {
      await limiter.consumeOrThrow(key, limit, windowSeconds);
      expect.unreachable("Should have thrown RateLimitExceededException");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitExceededException);
      const ex = err as RateLimitExceededException;
      expect(ex.statusCode).toBe(429);
      expect(ex.errorType).toBe("rate-limit-exceeded");
      expect(ex.retryAfterSeconds).toBe(15);
    }
  });

  it("enforces multi-tier rate limiting policies", async () => {
    // Tier 1: 5 login gagal / 15 menit per IP dan per username
    const ip = "192.168.1.100";
    for (let i = 0; i < RATE_LIMIT_TIERS.TIER_1_LOGIN_IP.limit; i++) {
      const res = await limiter.consumeTier1LoginByIp(ip);
      expect(res.allowed).toBe(true);
    }
    await expect(limiter.consumeTier1LoginByIp(ip)).rejects.toBeInstanceOf(
      RateLimitExceededException,
    );

    const username = "admin";
    for (let i = 0; i < RATE_LIMIT_TIERS.TIER_1_LOGIN_USER.limit; i++) {
      const res = await limiter.consumeTier1LoginByUsername(username);
      expect(res.allowed).toBe(true);
    }
    await expect(limiter.consumeTier1LoginByUsername(username)).rejects.toBeInstanceOf(
      RateLimitExceededException,
    );

    // Tier 2: 1 check / 10 dtk per monitor ID
    const monitorId = "mon-001";
    const check1 = await limiter.consumeTier2MonitorCheck(monitorId);
    expect(check1.allowed).toBe(true);
    await expect(limiter.consumeTier2MonitorCheck(monitorId)).rejects.toBeInstanceOf(
      RateLimitExceededException,
    );

    // Tier 2: 20 check / menit per user
    const userId = "usr-001";
    for (let i = 0; i < RATE_LIMIT_TIERS.TIER_2_USER_CHECK.limit; i++) {
      await limiter.consumeTier2UserCheck(userId);
    }
    await expect(limiter.consumeTier2UserCheck(userId)).rejects.toBeInstanceOf(
      RateLimitExceededException,
    );

    // Tier 3: 120 request / menit per user
    const apiUserId = "usr-002";
    for (let i = 0; i < RATE_LIMIT_TIERS.TIER_3_USER_API.limit; i++) {
      await limiter.consumeTier3UserApi(apiUserId);
    }
    await expect(limiter.consumeTier3UserApi(apiUserId)).rejects.toBeInstanceOf(
      RateLimitExceededException,
    );
  });

  it("prunes expired entries and resets keys", async () => {
    const key1 = "test:prune:1";
    const key2 = "test:prune:2";

    await limiter.consume(key1, 5, 10);
    await limiter.consume(key2, 5, 60);

    // Advance 20 seconds: key1 is expired, key2 is not
    clock.advanceSeconds(20);

    const deleted = await limiter.pruneExpired();
    expect(deleted).toBe(1);

    // Reset remaining key2 manually
    await limiter.reset(key2);
    const postReset = await limiter.consume(key2, 5, 60);
    expect(postReset.remaining).toBe(4);
  });
});
