import { Buffer } from "node:buffer";
import {
  type AuthConfig,
  DENIED_HEADERS,
  EndpointUrl,
  type HttpMethod,
  isHttpMethod,
  ValidationException,
} from "@sentinel/domain";

export interface BuildProbeRequestOptions {
  readonly url: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string | null;
  readonly authConfig?: AuthConfig | null;
  readonly timeoutMs?: number;
  readonly needsResponseBody?: boolean;
}

export interface BuiltProbeRequest {
  readonly url: string;
  readonly endpointUrl: EndpointUrl;
  readonly method: HttpMethod;
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly timeoutMs: number;
  readonly needsResponseBody: boolean;
}

const DEFAULT_USER_AGENT = "API-Sentinel-Probe/1.0";
const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;

const INTERNAL_HEADER_PREFIXES = ["x-sentinel-", "sentinel-"] as const;

function isDeniedOrInternalHeader(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if ((DENIED_HEADERS as readonly string[]).includes(lower)) {
    return true;
  }
  for (const prefix of INTERNAL_HEADER_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function resolveTimeout(timeoutMs?: number): number {
  if (timeoutMs === undefined || timeoutMs === null || Number.isNaN(timeoutMs)) {
    return DEFAULT_TIMEOUT_MS;
  }
  if (timeoutMs < MIN_TIMEOUT_MS) {
    return MIN_TIMEOUT_MS;
  }
  if (timeoutMs > MAX_TIMEOUT_MS) {
    return MAX_TIMEOUT_MS;
  }
  return timeoutMs;
}

function applyAuthHeaders(headers: Record<string, string>, authConfig?: AuthConfig | null): void {
  if (!authConfig || authConfig.type === "none") {
    return;
  }

  const type = authConfig.type.toLowerCase();
  switch (type) {
    case "bearer": {
      if ("token" in authConfig && authConfig.token) {
        headers.authorization = `Bearer ${authConfig.token}`;
      }
      break;
    }
    case "basic": {
      if ("username" in authConfig && "password" in authConfig) {
        const credentials = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString(
          "base64",
        );
        headers.authorization = `Basic ${credentials}`;
      }
      break;
    }
    case "api_key": {
      if ("headerName" in authConfig && "headerValue" in authConfig) {
        if (!isDeniedOrInternalHeader(authConfig.headerName)) {
          headers[authConfig.headerName.toLowerCase()] = authConfig.headerValue;
        }
      }
      break;
    }
    case "custom_header": {
      if ("headers" in authConfig && authConfig.headers) {
        for (const [key, value] of Object.entries(authConfig.headers)) {
          if (!isDeniedOrInternalHeader(key)) {
            headers[key.toLowerCase()] = value;
          }
        }
      }
      break;
    }
  }
}

export function buildProbeRequest(options: BuildProbeRequestOptions): BuiltProbeRequest {
  const endpointUrl = new EndpointUrl(options.url);

  const rawMethod = (options.method ?? "GET").trim().toUpperCase();
  if (!isHttpMethod(rawMethod)) {
    throw new ValidationException(`HTTP method tidak didukung: "${options.method}"`, [
      {
        name: "method",
        reason: `Method harus salah satu dari HTTP_METHODS yang diizinkan. Diterima: ${options.method}`,
      },
    ]);
  }

  const headers: Record<string, string> = {
    "user-agent": DEFAULT_USER_AGENT,
  };

  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      if (isDeniedOrInternalHeader(key)) {
        continue;
      }
      if (/[\r\n]/.test(key) || /[\r\n]/.test(value)) {
        throw new ValidationException(`Header "${key}" mengandung karakter newline CRLF dilarang`, [
          {
            name: `headers.${key}`,
            reason: "Karakter CRLF dilarang dalam header untuk mencegah header injection.",
          },
        ]);
      }
      headers[key.toLowerCase()] = value;
    }
  }

  applyAuthHeaders(headers, options.authConfig);

  let body: string | undefined;
  if (rawMethod !== "GET" && rawMethod !== "HEAD" && options.body) {
    body = options.body;
    headers["content-length"] = Buffer.byteLength(body, "utf-8").toString();
    if (!headers["content-type"]) {
      const trimmedBody = body.trim();
      if (
        (trimmedBody.startsWith("{") && trimmedBody.endsWith("}")) ||
        (trimmedBody.startsWith("[") && trimmedBody.endsWith("]"))
      ) {
        headers["content-type"] = "application/json; charset=utf-8";
      }
    }
  }

  return {
    url: endpointUrl.value,
    endpointUrl,
    method: rawMethod,
    headers,
    body,
    timeoutMs: resolveTimeout(options.timeoutMs),
    needsResponseBody: options.needsResponseBody ?? true,
  };
}
