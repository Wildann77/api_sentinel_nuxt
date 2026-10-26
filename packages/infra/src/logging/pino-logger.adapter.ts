import { Transform, type TransformCallback } from "node:stream";
import type { LoggerPort } from "@sentinel/application";
import pino, { type LevelWithSilent, type Logger as PinoInstance } from "pino";

export interface LogContext {
  readonly monitorId?: string;
  readonly checkId?: string;
  readonly incidentId?: string;
  readonly correlationId?: string;
  readonly [key: string]: unknown;
}

export interface PinoLoggerOptions {
  readonly level?: string;
  readonly context?: LogContext;
  readonly destination?: NodeJS.WritableStream;
  readonly redactPaths?: readonly string[];
  readonly pinoInstance?: PinoInstance;
  readonly transform?: RedactingTransform;
}

export const TELEGRAM_BOT_TOKEN_REGEX = /(?:^|\/|\b)bot\d+:[A-Za-z0-9_-]+/g;

export const AUTH_HEADER_REGEX =
  /((?:authorization|proxy-authorization|x-api-key)\s*[:=]\s*)(?:Bearer\s+|Basic\s+)?[^\r\n",\s}]+/gi;

const JSON_SECRET_KEY_REGEX =
  /(("|')?(?:password|passwordHash|botToken|telegramBotToken|sessionSecret|appKeyring|apiKey|credentials)("|')?\s*:\s*)("[^"\\]*(?:\\.[^"\\]*)*"|null|\d+|true|false)/gi;

const JSON_HEADER_KEY_REGEX =
  /(("|')?(?:authorization|proxy-authorization|x-api-key)("|')?\s*:\s*)("[^"\\]*(?:\\.[^"\\]*)*")/gi;

export const DEFAULT_REDACT_PATHS: readonly string[] = [
  "authorization",
  "Authorization",
  "*.authorization",
  "*.Authorization",
  "*.*.authorization",
  "*.*.Authorization",
  "*.*.*.authorization",
  "*.*.*.Authorization",
  "proxy-authorization",
  "Proxy-Authorization",
  "*.proxy-authorization",
  "*.Proxy-Authorization",
  "*.*.proxy-authorization",
  "*.*.Proxy-Authorization",
  "x-api-key",
  "X-Api-Key",
  "*.x-api-key",
  "*.X-Api-Key",
  "*.*.x-api-key",
  "*.*.X-Api-Key",
  "headers.authorization",
  "headers.Authorization",
  "headers.proxy-authorization",
  "headers.Proxy-Authorization",
  "headers.x-api-key",
  "headers.X-Api-Key",
  "req.headers.authorization",
  "req.headers.Authorization",
  "req.headers.proxy-authorization",
  "req.headers.Proxy-Authorization",
  "req.headers.x-api-key",
  "req.headers.X-Api-Key",
  "password",
  "*.password",
  "*.*.password",
  "*.*.*.password",
  "passwordHash",
  "*.passwordHash",
  "*.*.passwordHash",
  "token",
  "*.token",
  "*.*.token",
  "botToken",
  "*.botToken",
  "*.*.botToken",
  "telegramBotToken",
  "*.telegramBotToken",
  "*.*.telegramBotToken",
  "secret",
  "*.secret",
  "*.*.secret",
  "sessionSecret",
  "*.sessionSecret",
  "*.*.sessionSecret",
  "appKeyring",
  "*.appKeyring",
  "*.*.appKeyring",
  "apiKey",
  "*.apiKey",
  "*.*.apiKey",
  "credentials",
  "*.credentials",
  "*.*.credentials",
  "cookie",
  "*.cookie",
  "*.*.cookie",
  "set-cookie",
  "*.set-cookie",
  "*.*.set-cookie",
];

export function redactSensitiveText(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(TELEGRAM_BOT_TOKEN_REGEX, (match) =>
      match.startsWith("/") ? "/bot[REDACTED]" : "bot[REDACTED]",
    )
    .replace(AUTH_HEADER_REGEX, "$1[REDACTED]")
    .replace(JSON_SECRET_KEY_REGEX, '$1"[REDACTED]"')
    .replace(JSON_HEADER_KEY_REGEX, '$1"[REDACTED]"');
}

export class RedactingTransform extends Transform {
  override _transform(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    const raw =
      typeof chunk === "string"
        ? chunk
        : Buffer.isBuffer(chunk)
          ? chunk.toString("utf8")
          : String(chunk);
    const sanitized = redactSensitiveText(raw);
    this.push(sanitized);
    callback();
  }
}

export function createSafeErrorSerializer(
  baseSerializer: (err: Error) => Record<string, unknown> = pino.stdSerializers.err,
): (err: Error) => Record<string, unknown> {
  return (err: Error): Record<string, unknown> => {
    if (typeof err === "string") {
      return { message: redactSensitiveText(err) };
    }
    if (!err || typeof err !== "object") {
      return { message: String(err) };
    }

    const rawSerialized = baseSerializer(err);
    if (!rawSerialized || typeof rawSerialized !== "object") {
      return { message: redactSensitiveText(String(rawSerialized)) };
    }
    const serialized: Record<string, unknown> = { ...rawSerialized };

    if (typeof serialized.message === "string") {
      serialized.message = redactSensitiveText(serialized.message);
    }
    if (typeof serialized.stack === "string") {
      serialized.stack = redactSensitiveText(serialized.stack);
    }

    if (serialized.cause) {
      if (typeof serialized.cause === "string") {
        serialized.cause = redactSensitiveText(serialized.cause);
      } else if (typeof serialized.cause === "object" && serialized.cause !== null) {
        const causeObj = { ...(serialized.cause as Record<string, unknown>) };
        if (typeof causeObj.message === "string") {
          causeObj.message = redactSensitiveText(causeObj.message);
        }
        if (typeof causeObj.stack === "string") {
          causeObj.stack = redactSensitiveText(causeObj.stack);
        }
        serialized.cause = causeObj;
      }
    }

    for (const [key, val] of Object.entries(serialized)) {
      if (typeof val === "string" && key !== "type") {
        serialized[key] = redactSensitiveText(val);
      }
    }

    return serialized;
  };
}

export class PinoLoggerAdapter implements LoggerPort {
  private readonly pino: PinoInstance;
  private readonly transform?: RedactingTransform;

  constructor(options?: PinoLoggerOptions) {
    if (options?.pinoInstance) {
      this.pino = options.pinoInstance;
      this.transform = options.transform;
      return;
    }

    const level = (options?.level ?? process.env.LOG_LEVEL ?? "info").toLowerCase();
    const destination = options?.destination ?? process.stdout;
    const transform = new RedactingTransform();
    transform.pipe(destination);
    this.transform = transform;

    const safeErrSerializer = createSafeErrorSerializer();

    const redactPaths = options?.redactPaths
      ? [...DEFAULT_REDACT_PATHS, ...options.redactPaths]
      : DEFAULT_REDACT_PATHS;

    const rootLogger = pino(
      {
        level: level as LevelWithSilent,
        serializers: {
          err: safeErrSerializer,
          error: safeErrSerializer,
        },
        redact: {
          paths: redactPaths as string[],
          censor: "[REDACTED]",
        },
        hooks: {
          logMethod(inputArgs, method) {
            const [first, ...rest] = inputArgs;
            const sanitizedFirst = typeof first === "string" ? redactSensitiveText(first) : first;
            const sanitizedRest = rest.map((arg) =>
              typeof arg === "string" ? redactSensitiveText(arg) : arg,
            );
            method.call(this, sanitizedFirst, ...(sanitizedRest as [string?, ...unknown[]]));
          },
        },
      },
      transform,
    );

    this.pino = options?.context ? rootLogger.child(options.context) : rootLogger;
  }

  public info(msg: string, meta?: Record<string, unknown>): void {
    if (meta) {
      this.pino.info(meta, msg);
    } else {
      this.pino.info(msg);
    }
  }

  public warn(msg: string, meta?: Record<string, unknown>): void {
    if (meta) {
      this.pino.warn(meta, msg);
    } else {
      this.pino.warn(msg);
    }
  }

  public error(msg: string, meta?: Record<string, unknown>): void {
    if (meta) {
      this.pino.error(meta, msg);
    } else {
      this.pino.error(msg);
    }
  }

  public debug(msg: string, meta?: Record<string, unknown>): void {
    if (meta) {
      this.pino.debug(meta, msg);
    } else {
      this.pino.debug(msg);
    }
  }

  public child(bindings: LogContext): PinoLoggerAdapter {
    const childPino = this.pino.child(bindings);
    return new PinoLoggerAdapter({
      pinoInstance: childPino,
      transform: this.transform,
    });
  }

  public getLevel(): string {
    return this.pino.level;
  }

  public setLevel(level: string): void {
    this.pino.level = level;
  }

  public getPino(): PinoInstance {
    return this.pino;
  }
}

export function createPinoLogger(options?: PinoLoggerOptions): PinoLoggerAdapter {
  return new PinoLoggerAdapter(options);
}
