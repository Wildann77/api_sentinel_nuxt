import { z } from "zod";

export interface AppKeyring {
  activeKeyId: string;
  keys: Record<string, string>;
}

const is32ByteBase64 = (val: string): boolean => {
  if (typeof val !== "string" || val.trim().length === 0) return false;
  try {
    const buf = Buffer.from(val, "base64");
    // Ensure 32 bytes and re-encoded string matches (or valid canonical base64)
    return buf.length === 32;
  } catch {
    return false;
  }
};

export const KeyringSchema = z
  .string()
  .min(1, "APP_KEYRING is required")
  .refine(
    (val) => {
      try {
        const parsed = JSON.parse(val);
        if (!parsed || typeof parsed !== "object") return false;
        if (typeof parsed.activeKeyId !== "string" || parsed.activeKeyId.length === 0) return false;
        if (!parsed.keys || typeof parsed.keys !== "object" || Array.isArray(parsed.keys))
          return false;

        const activeKey = parsed.keys[parsed.activeKeyId];
        if (!is32ByteBase64(activeKey)) return false;

        for (const [keyId, keyVal] of Object.entries(parsed.keys)) {
          if (typeof keyId !== "string" || !is32ByteBase64(keyVal as string)) {
            return false;
          }
        }

        return true;
      } catch {
        return false;
      }
    },
    {
      message:
        "APP_KEYRING must be valid JSON containing activeKeyId and 32-byte base64 encoded keys.",
    },
  );

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WORKER_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL."),
  APP_KEYRING: KeyringSchema,
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters long."),
  TRUSTED_PROXIES: z.string().default("127.0.0.1,::1"),
  HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().int().positive().default(15),
  CHECK_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  TELEGRAM_API_BASE_URL: z
    .string()
    .url("TELEGRAM_API_BASE_URL must be a valid URL.")
    .default("https://api.telegram.org"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z
    .string()
    .url("OTEL_EXPORTER_OTLP_ENDPOINT must be a valid URL.")
    .optional(),
  OTEL_SERVICE_NAME: z.string().min(1).default("api-sentinel"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvValidationError extends Error {
  public readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Environment validation failed:\n  - ${issues.join("\n  - ")}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

export function validateEnv(rawEnv: Record<string, unknown> = process.env): Env {
  const result = EnvSchema.safeParse(rawEnv);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return `[${path || "root"}]: ${issue.message}`;
    });

    throw new EnvValidationError(issues);
  }

  return result.data;
}

export function parseKeyring(keyringJson: string): AppKeyring {
  return JSON.parse(keyringJson) as AppKeyring;
}
