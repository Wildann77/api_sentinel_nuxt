import type { RateLimiterPort, RateLimitResult } from "../ports/out/rate-limiter.port.js";

export class FakeRateLimiter implements RateLimiterPort {
  private keyRecords = new Map<string, number[]>();
  public forceDeny = false;

  public async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    if (this.forceDeny) {
      return {
        allowed: false,
        remaining: 0,
        resetAfterSeconds: windowSeconds,
      };
    }

    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    const timestamps = (this.keyRecords.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= limit) {
      const oldestInWindow = timestamps[0] ?? now;
      const resetAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));
      return {
        allowed: false,
        remaining: 0,
        resetAfterSeconds,
      };
    }

    timestamps.push(now);
    this.keyRecords.set(key, timestamps);

    return {
      allowed: true,
      remaining: Math.max(0, limit - timestamps.length),
      resetAfterSeconds: windowSeconds,
    };
  }

  public reset(): void {
    this.keyRecords.clear();
    this.forceDeny = false;
  }
}
