import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AUTH_HEADER_REGEX,
  createPinoLogger,
  createSafeErrorSerializer,
  DEFAULT_REDACT_PATHS,
  PinoLoggerAdapter,
  RedactingTransform,
  redactSensitiveText,
  TELEGRAM_BOT_TOKEN_REGEX,
} from "../src/logging/pino-logger.adapter.js";

function createMemorySink(): {
  stream: Writable;
  getOutput: () => string;
  getLines: () => unknown[];
} {
  let buffer = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      callback();
    },
  });

  return {
    stream,
    getOutput: () => buffer,
    getLines: () =>
      buffer
        .trim()
        .split("\n")
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l)),
  };
}

describe("PinoLoggerAdapter & Redaction (ARCH §1.1.3, §13; PRD §4.20; TASK P5.4)", () => {
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
  });

  describe("JSON Structured Logging & Context Fields", () => {
    it("emits valid JSON logs with level, timestamp, and message", () => {
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream, level: "debug" });

      logger.info("Heartbeat tick");
      logger.debug("Debug diagnostics");
      logger.warn("Transient latency spike");
      logger.error("Database connection dropped");

      const lines = sink.getLines() as Array<{ level: number; msg: string; time: number }>;
      expect(lines).toHaveLength(4);

      expect(lines[0].msg).toBe("Heartbeat tick");
      expect(lines[0].level).toBe(30);
      expect(typeof lines[0].time).toBe("number");

      expect(lines[1].msg).toBe("Debug diagnostics");
      expect(lines[1].level).toBe(20);

      expect(lines[2].msg).toBe("Transient latency spike");
      expect(lines[2].level).toBe(40);

      expect(lines[3].msg).toBe("Database connection dropped");
      expect(lines[3].level).toBe(50);
    });

    it("includes monitorId, checkId, incidentId, correlationId as top-level fields from meta", () => {
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream });

      logger.info("Probe executed", {
        monitorId: "mon_01j7xyz123",
        checkId: "chk_01j7abc456",
        incidentId: "inc_01j7def789",
        correlationId: "corr_01j7ghi000",
        statusCode: 200,
        latencyMs: 42,
      });

      const [line] = sink.getLines() as Array<Record<string, unknown>>;
      expect(line.msg).toBe("Probe executed");
      expect(line.monitorId).toBe("mon_01j7xyz123");
      expect(line.checkId).toBe("chk_01j7abc456");
      expect(line.incidentId).toBe("inc_01j7def789");
      expect(line.correlationId).toBe("corr_01j7ghi000");
      expect(line.statusCode).toBe(200);
      expect(line.latencyMs).toBe(42);
    });

    it("creates child logger with bound fields that persist across multiple logs", () => {
      const sink = createMemorySink();
      const parent = createPinoLogger({ destination: sink.stream });

      const child = parent.child({
        monitorId: "mon_bound_111",
        correlationId: "corr_bound_222",
      });

      child.info("Step 1: starting DNS resolution");
      child.info("Step 2: probe TCP connect", { latencyMs: 15 });

      const lines = sink.getLines() as Array<Record<string, unknown>>;
      expect(lines).toHaveLength(2);

      expect(lines[0].monitorId).toBe("mon_bound_111");
      expect(lines[0].correlationId).toBe("corr_bound_222");
      expect(lines[0].msg).toBe("Step 1: starting DNS resolution");

      expect(lines[1].monitorId).toBe("mon_bound_111");
      expect(lines[1].correlationId).toBe("corr_bound_222");
      expect(lines[1].latencyMs).toBe(15);
      expect(lines[1].msg).toBe("Step 2: probe TCP connect");
    });
  });

  describe("Zero-Leak Telegram Bot Token Redaction", () => {
    const LEAK_TOKEN_1 = "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_12345";
    const LEAK_TOKEN_2 = "987654321:XYZ-abcdef_9999999999";
    const LEAK_TOKEN_3 = "888888888:secret_bare_token";

    it("redacts Telegram bot token from URL in log message", () => {
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream });

      logger.info(
        `Dispatching notification via https://api.telegram.org/bot${LEAK_TOKEN_1}/sendMessage`,
      );

      const raw = sink.getOutput();
      expect(raw).not.toContain(LEAK_TOKEN_1);
      expect(raw).toContain("https://api.telegram.org/bot[REDACTED]/sendMessage");
    });

    it("redacts Telegram bot token from path string in message", () => {
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream });

      logger.warn(`Failed endpoint call: /bot${LEAK_TOKEN_2}/getMe`);

      const raw = sink.getOutput();
      expect(raw).not.toContain(LEAK_TOKEN_2);
      expect(raw).toContain("/bot[REDACTED]/getMe");
    });

    it("redacts bare bot token in message", () => {
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream });

      logger.info(`Setting up bot with credentials bot${LEAK_TOKEN_3}`);

      const raw = sink.getOutput();
      expect(raw).not.toContain(LEAK_TOKEN_3);
      expect(raw).toContain("bot[REDACTED]");
    });

    it("redacts Telegram bot token from object metadata and child bindings", () => {
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream });

      logger.info("Probe meta", {
        endpoint: `https://api.telegram.org/bot${LEAK_TOKEN_1}/sendPhoto`,
        telegramBotToken: `bot${LEAK_TOKEN_2}`,
      });

      const raw = sink.getOutput();
      expect(raw).not.toContain(LEAK_TOKEN_1);
      expect(raw).not.toContain(LEAK_TOKEN_2);
    });
  });

  describe("Zero-Leak Authorization Header & Credential Redaction", () => {
    const SECRET_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretpayload.signature123";
    const SECRET_API_KEY = "sk-live-9999999999-secret-api-key";
    const SECRET_BASIC = "Basic dXNlcm5hbWU6c3VwZXJfc2VjcmV0X3Bhc3M=";
    const SECRET_PASSWORD = "SuperSecretPassword!@#123";

    it("redacts Authorization, Proxy-Authorization, and X-Api-Key headers in object meta", () => {
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream });

      logger.info("Outbound request headers", {
        headers: {
          authorization: `Bearer ${SECRET_JWT}`,
          "Proxy-Authorization": SECRET_BASIC,
          "X-Api-Key": SECRET_API_KEY,
          "content-type": "application/json",
        },
      });

      const raw = sink.getOutput();
      expect(raw).not.toContain(SECRET_JWT);
      expect(raw).not.toContain(SECRET_BASIC);
      expect(raw).not.toContain(SECRET_API_KEY);

      const [line] = sink.getLines() as Array<{
        headers: {
          authorization: string;
          "Proxy-Authorization": string;
          "X-Api-Key": string;
          "content-type": string;
        };
      }>;
      expect(line.headers.authorization).toBe("[REDACTED]");
      expect(line.headers["Proxy-Authorization"]).toBe("[REDACTED]");
      expect(line.headers["X-Api-Key"]).toBe("[REDACTED]");
      expect(line.headers["content-type"]).toBe("application/json");
    });

    it("redacts Authorization and API key headers in text messages", () => {
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream });

      logger.info(`Sending with Authorization: Bearer ${SECRET_JWT} in curl command`);
      logger.info(`Proxy configured with Proxy-Authorization: ${SECRET_BASIC}`);
      logger.info(`API Key set: X-Api-Key: ${SECRET_API_KEY}`);

      const raw = sink.getOutput();
      expect(raw).not.toContain(SECRET_JWT);
      expect(raw).not.toContain(SECRET_BASIC);
      expect(raw).not.toContain(SECRET_API_KEY);

      expect(raw).toContain("Authorization: [REDACTED]");
      expect(raw).toContain("Proxy-Authorization: [REDACTED]");
      expect(raw).toContain("X-Api-Key: [REDACTED]");
    });

    it("redacts sensitive credential fields in payloads", () => {
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream });

      logger.info("Auth payload submission", {
        user: {
          username: "admin@sentinel.local",
          password: SECRET_PASSWORD,
          passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$fakeHashString",
        },
        token: "session-token-xyz-123",
        secret: "app-internal-secret-999",
        sessionSecret: "32-byte-session-secret-string-val",
        appKeyring: '{"activeKeyId":"k1","keys":{"k1":"base64=="}}',
        apiKey: "api-key-value",
      });

      const raw = sink.getOutput();
      expect(raw).not.toContain(SECRET_PASSWORD);
      expect(raw).not.toContain("$argon2id$v=19$m=65536");
      expect(raw).not.toContain("session-token-xyz-123");
      expect(raw).not.toContain("app-internal-secret-999");
      expect(raw).not.toContain("32-byte-session-secret-string-val");

      const [line] = sink.getLines() as Array<{
        user: { username: string; password: string; passwordHash: string };
        token: string;
        secret: string;
        sessionSecret: string;
        apiKey: string;
      }>;
      expect(line.user.username).toBe("admin@sentinel.local");
      expect(line.user.password).toBe("[REDACTED]");
      expect(line.user.passwordHash).toBe("[REDACTED]");
      expect(line.token).toBe("[REDACTED]");
      expect(line.secret).toBe("[REDACTED]");
      expect(line.sessionSecret).toBe("[REDACTED]");
      expect(line.apiKey).toBe("[REDACTED]");
    });
  });

  describe("Safe Error Serializer", () => {
    const LEAK_TOKEN = "777777777:TELEGRAM_ERROR_LEAK_TOKEN";
    const SECRET_AUTH = "Bearer top-secret-bearer-token";

    it("serializes Error and redacts Telegram bot tokens in message and stack trace", () => {
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream });

      const err = new Error(
        `Failed request to https://api.telegram.org/bot${LEAK_TOKEN}/sendMessage`,
      );
      logger.error("Telegram delivery failure", { err });

      const raw = sink.getOutput();
      expect(raw).not.toContain(LEAK_TOKEN);
      expect(raw).toContain("https://api.telegram.org/bot[REDACTED]/sendMessage");

      const [line] = sink.getLines() as Array<{
        err: { type: string; message: string; stack: string };
        msg: string;
      }>;
      expect(line.err.type).toBe("Error");
      expect(line.err.message).toContain("/bot[REDACTED]/sendMessage");
      expect(line.err.stack).not.toContain(LEAK_TOKEN);
      expect(line.err.stack).toContain("/bot[REDACTED]/sendMessage");
    });

    it("safely serializes errors passed under the 'error' key as well", () => {
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream });

      const err = new Error(`Request Authorization: ${SECRET_AUTH} failed`);
      logger.error("Alternative error key", { error: err });

      const raw = sink.getOutput();
      expect(raw).not.toContain(SECRET_AUTH);
      expect(raw).toContain("Authorization: [REDACTED]");

      const [line] = sink.getLines() as Array<{
        error: { type: string; message: string };
      }>;
      expect(line.error.message).toContain("Authorization: [REDACTED]");
    });

    it("redacts nested cause errors and custom error properties", () => {
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream });

      const cause = new Error(`Root cause: /bot${LEAK_TOKEN}/getWebhookInfo`);
      const err = new Error("Parent error", { cause }) as Error & {
        url?: string;
        headers?: Record<string, string>;
      };
      err.url = `https://api.telegram.org/bot${LEAK_TOKEN}/getMe`;
      err.headers = { authorization: SECRET_AUTH };

      logger.error("Chained exception", { err });

      const raw = sink.getOutput();
      expect(raw).not.toContain(LEAK_TOKEN);
      expect(raw).not.toContain(SECRET_AUTH);
    });
  });

  describe("LOG_LEVEL & Runtime Level Control", () => {
    it("respects LOG_LEVEL from process.env when option is omitted", () => {
      process.env.LOG_LEVEL = "warn";
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream });

      expect(logger.getLevel()).toBe("warn");

      logger.debug("Debug msg");
      logger.info("Info msg");
      logger.warn("Warn msg");
      logger.error("Error msg");

      const lines = sink.getLines() as Array<{ msg: string }>;
      expect(lines).toHaveLength(2);
      expect(lines[0].msg).toBe("Warn msg");
      expect(lines[1].msg).toBe("Error msg");
    });

    it("allows dynamic runtime log level adjustment via setLevel", () => {
      const sink = createMemorySink();
      const logger = createPinoLogger({ destination: sink.stream, level: "error" });

      logger.info("Should not appear");
      expect(sink.getLines()).toHaveLength(0);

      logger.setLevel("info");
      expect(logger.getLevel()).toBe("info");

      logger.info("Should now appear");
      expect(sink.getLines()).toHaveLength(1);
    });
  });

  describe("Helper Functions & Utilities", () => {
    it("redactSensitiveText replaces bot tokens, auth headers, and json keys directly", () => {
      const input =
        'Bearer eyJ... Authorization: Bearer abc and /bot12345:token/send and {"password":"secret123"}';
      const output = redactSensitiveText(input);

      expect(output).not.toContain("abc");
      expect(output).not.toContain("12345:token");
      expect(output).not.toContain("secret123");
      expect(output).toContain("Authorization: [REDACTED]");
      expect(output).toContain("/bot[REDACTED]/send");
      expect(output).toContain('{"password":"[REDACTED]"}');
    });

    it("redactSensitiveText returns non-string or empty input safely", () => {
      // @ts-expect-error test non-string
      expect(redactSensitiveText(null)).toBeNull();
      // @ts-expect-error test non-string
      expect(redactSensitiveText(undefined)).toBeUndefined();
      expect(redactSensitiveText("")).toBe("");
    });

    it("exports default redact paths and regex patterns", () => {
      expect(DEFAULT_REDACT_PATHS).toContain("authorization");
      expect(DEFAULT_REDACT_PATHS).toContain("password");
      expect(TELEGRAM_BOT_TOKEN_REGEX).toBeInstanceOf(RegExp);
      expect(AUTH_HEADER_REGEX).toBeInstanceOf(RegExp);
    });

    it("supports direct instantiation with PinoLoggerAdapter class", () => {
      const sink = createMemorySink();
      const logger = new PinoLoggerAdapter({ destination: sink.stream, level: "info" });
      expect(logger).toBeInstanceOf(PinoLoggerAdapter);
      expect(logger.getPino()).toBeDefined();
      logger.info("Class instantiated");
      expect(sink.getLines()).toHaveLength(1);
    });

    it("RedactingTransform transforms chunks and redacts tokens", async () => {
      const transform = new RedactingTransform();
      const chunks: string[] = [];
      transform.on("data", (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
      });

      transform.write("url: https://api.telegram.org/bot112233:secretToken/send");
      transform.end();

      await new Promise((resolve) => transform.on("end", resolve));
      expect(chunks.join("")).toContain("https://api.telegram.org/bot[REDACTED]/send");
    });

    it("createSafeErrorSerializer sanitizes error messages and stacks", () => {
      const serializer = createSafeErrorSerializer();
      const err = new Error("Failed to call https://api.telegram.org/bot999:abc/getMe");
      const serialized = serializer(err);

      expect(serialized.message).toBe(
        "Failed to call https://api.telegram.org/bot[REDACTED]/getMe",
      );
      expect(serialized.stack).not.toContain("999:abc");
    });
  });
});
