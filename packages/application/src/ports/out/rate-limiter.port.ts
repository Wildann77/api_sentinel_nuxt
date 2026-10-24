export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAfterSeconds: number;
}

export interface RateLimiterPort {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}
