import { describe, expect, it } from "vitest";
import { EnvValidationError, validateEnv } from "../src/config/env";

describe("Environment Validation (P1.7)", () => {
  const validKey = Buffer.alloc(32, "a").toString("base64");
  const validKeyring = JSON.stringify({
    activeKeyId: "k1",
    keys: {
      k1: validKey,
    },
  });

  const validBaseEnv = {
    DATABASE_URL: "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel",
    APP_KEYRING: validKeyring,
    SESSION_SECRET: "supersecret32characterlongstringforauthsession",
  };

  it("validates a correct minimal environment and applies default values", () => {
    const env = validateEnv(validBaseEnv);

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.WORKER_PORT).toBe(3001);
    expect(env.HEARTBEAT_INTERVAL_SECONDS).toBe(15);
    expect(env.CHECK_RETENTION_DAYS).toBe(90);
    expect(env.TELEGRAM_API_BASE_URL).toBe("https://api.telegram.org");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.TRUSTED_PROXIES).toBe("127.0.0.1,::1");
    expect(env.DATABASE_URL).toBe(validBaseEnv.DATABASE_URL);
  });

  it("coerces numeric variables properly", () => {
    const env = validateEnv({
      ...validBaseEnv,
      PORT: "8080",
      WORKER_PORT: "8081",
      HEARTBEAT_INTERVAL_SECONDS: "30",
      CHECK_RETENTION_DAYS: "180",
    });

    expect(env.PORT).toBe(8080);
    expect(env.WORKER_PORT).toBe(8081);
    expect(env.HEARTBEAT_INTERVAL_SECONDS).toBe(30);
    expect(env.CHECK_RETENTION_DAYS).toBe(180);
  });

  it("fails fast if DATABASE_URL is missing or invalid URL", () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        DATABASE_URL: "not-a-valid-url",
      }),
    ).toThrow(EnvValidationError);
  });

  it("fails fast if SESSION_SECRET is shorter than 32 characters", () => {
    const secretValue = "too-short-secret";
    try {
      validateEnv({
        ...validBaseEnv,
        SESSION_SECRET: secretValue,
      });
      expect.fail("Expected EnvValidationError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const error = err as EnvValidationError;
      // Zero leak verification: error message must not expose the secret value
      expect(error.message).not.toContain(secretValue);
      expect(error.message).toContain("SESSION_SECRET");
    }
  });

  it("fails fast if APP_KEYRING is not JSON", () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        APP_KEYRING: "invalid-non-json-string",
      }),
    ).toThrow(EnvValidationError);
  });

  it("fails fast if APP_KEYRING has missing activeKeyId", () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        APP_KEYRING: JSON.stringify({ keys: { k1: validKey } }),
      }),
    ).toThrow(EnvValidationError);
  });

  it("fails fast if APP_KEYRING activeKeyId is not in keys dictionary", () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        APP_KEYRING: JSON.stringify({ activeKeyId: "k2", keys: { k1: validKey } }),
      }),
    ).toThrow(EnvValidationError);
  });

  it("fails fast if APP_KEYRING contains a key that is not 32 bytes base64", () => {
    const shortKey = Buffer.alloc(16, "x").toString("base64");
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        APP_KEYRING: JSON.stringify({ activeKeyId: "k1", keys: { k1: shortKey } }),
      }),
    ).toThrow(EnvValidationError);
  });

  it("fails fast if NODE_ENV has unknown value", () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        NODE_ENV: "staging",
      }),
    ).toThrow(EnvValidationError);
  });
});
