import * as http from "node:http";
import * as https from "node:https";
import type { ProbeRequest, ProbeResult } from "@sentinel/application";
import { FailureCategory, SSRFBlockedException, sanitizeDiagnostic } from "@sentinel/domain";
import {
  type DnsLookupFunctions,
  DnsResolutionException,
  type DnsResolutionResult,
  resolveDnsWithSsrfCheck,
} from "./dns-resolver.js";
import { type BuiltProbeRequest, buildProbeRequest } from "./request-builder.js";
import {
  consumeResponseBody,
  ResponseSizeExceededException,
  sanitizeResponseHeaders,
} from "./response-stream.js";
import {
  CONNECT_TIMEOUT_MS,
  ConnectionTimeoutException,
  createPinnedLookup,
  createSsrfAgent,
  HEADERS_TIMEOUT_MS,
  HeadersTimeoutException,
} from "./ssrf-agent.js";

function safeSanitize(text: string | null | undefined): string {
  if (!text) return "";
  return sanitizeDiagnostic(text) ?? text;
}

export function classifyNetworkError(error: unknown): {
  readonly category: FailureCategory;
  readonly message: string;
} {
  let category: FailureCategory = FailureCategory.EXECUTION_ABORTED;
  let rawMessage = error instanceof Error ? error.message : String(error);

  if (error && typeof error === "object") {
    if (
      error instanceof SSRFBlockedException ||
      (error instanceof Error &&
        (error.message.includes("rentang subnet privat") ||
          error.message.includes("kebijakan SSRF")))
    ) {
      return {
        category: FailureCategory.SSRF_BLOCKED,
        message: safeSanitize(error.message),
      };
    }

    if ("category" in error && typeof error.category === "string") {
      category = error.category as FailureCategory;
      const message =
        error instanceof Error
          ? error.message
          : "message" in error && typeof error.message === "string"
            ? error.message
            : String(error);
      return {
        category,
        message: safeSanitize(message),
      };
    }

    const code = (error as { code?: string }).code;
    const msg = (error as Error).message || String(error);

    if (
      code === "ECONNREFUSED" ||
      code === "ECONNRESET" ||
      code === "EPIPE" ||
      code === "EHOSTUNREACH" ||
      code === "ENETUNREACH" ||
      code === "ENETDOWN"
    ) {
      category = FailureCategory.CONNECTION_REFUSED;
      rawMessage = `Koneksi gagal atau ditolak oleh target (${code}): ${msg}`;
    } else if (
      code === "ETIMEDOUT" ||
      code === "ESOCKETTIMEDOUT" ||
      code === "UND_ERR_CONNECT_TIMEOUT" ||
      code === "UND_ERR_HEADERS_TIMEOUT" ||
      (error as Error).name === "TimeoutError" ||
      msg.toLowerCase().includes("timeout")
    ) {
      category = FailureCategory.CONNECTION_TIMEOUT;
      rawMessage = `Timeout jaringan saat menghubungi target: ${msg}`;
    } else if (
      code === "ENOTFOUND" ||
      code === "EAI_AGAIN" ||
      code === "SERVFAIL" ||
      code === "NXDOMAIN" ||
      code === "ENODATA"
    ) {
      category = FailureCategory.DNS_RESOLUTION_FAILED;
      rawMessage = `Resolusi DNS gagal: ${msg}`;
    } else if (
      code?.startsWith("ERR_TLS_") ||
      code?.startsWith("ERR_SSL_") ||
      code === "CERT_HAS_EXPIRED" ||
      code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
      code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
      code === "SELF_SIGNED_CERT_IN_CHAIN" ||
      code?.startsWith("ERR_CERT_") ||
      msg.includes("SSL") ||
      msg.includes("TLS")
    ) {
      category = FailureCategory.TLS_HANDSHAKE_FAILED;
      rawMessage = `Kegagalan TLS/SSL handshake (${code ?? "TLS_ERR"}): ${msg}`;
    } else if (code === "HPE_HEADER_OVERFLOW") {
      category = FailureCategory.RESPONSE_SIZE_EXCEEDED;
      rawMessage = `Header respons melebihi batas (${code}): ${msg}`;
    } else if ((error as Error).name === "AbortError" || code === "ABORT_ERR") {
      category = FailureCategory.CONNECTION_TIMEOUT;
      rawMessage = `Operasi probe dibatalkan karena batas waktu timeout (${msg})`;
    }
  }

  return {
    category,
    message: safeSanitize(rawMessage),
  };
}

export interface ExecuteProbeOptions {
  readonly lookup?: DnsLookupFunctions;
  readonly overridePinnedIp?: string;
}

export async function executeSsrfProbe(
  request: ProbeRequest,
  options?: ExecuteProbeOptions,
): Promise<ProbeResult> {
  let built: BuiltProbeRequest;
  try {
    built = buildProbeRequest({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body,
      authConfig: request.authConfig,
      timeoutMs: request.timeoutMs,
      needsResponseBody: request.needsResponseBody,
    });
  } catch (buildErr) {
    if (
      buildErr instanceof SSRFBlockedException ||
      (buildErr instanceof Error &&
        (buildErr.message.includes("rentang subnet privat") ||
          buildErr.message.includes("kebijakan SSRF")))
    ) {
      return {
        statusCode: null,
        headers: {},
        bodySnippet: null,
        durationMs: null,
        dnsDurationMs: null,
        connectDurationMs: null,
        tlsDurationMs: null,
        firstByteDurationMs: null,
        pinnedIp: null,
        errorCategory: FailureCategory.SSRF_BLOCKED,
        errorMessage: safeSanitize(buildErr.message),
      };
    }
    const classified = classifyNetworkError(buildErr);
    return {
      statusCode: null,
      headers: {},
      bodySnippet: null,
      durationMs: null,
      dnsDurationMs: null,
      connectDurationMs: null,
      tlsDurationMs: null,
      firstByteDurationMs: null,
      pinnedIp: null,
      errorCategory: classified.category,
      errorMessage: safeSanitize(classified.message),
    };
  }

  let dnsResult: DnsResolutionResult;
  try {
    dnsResult = await resolveDnsWithSsrfCheck(built.endpointUrl.hostname, options?.lookup);
  } catch (dnsErr) {
    if (dnsErr instanceof SSRFBlockedException) {
      return {
        statusCode: null,
        headers: {},
        bodySnippet: null,
        durationMs: null,
        dnsDurationMs: null,
        connectDurationMs: null,
        tlsDurationMs: null,
        firstByteDurationMs: null,
        pinnedIp: null,
        errorCategory: FailureCategory.SSRF_BLOCKED,
        errorMessage: safeSanitize(dnsErr.message),
      };
    }
    if (dnsErr instanceof DnsResolutionException) {
      return {
        statusCode: null,
        headers: {},
        bodySnippet: null,
        durationMs: null,
        dnsDurationMs: null,
        connectDurationMs: null,
        tlsDurationMs: null,
        firstByteDurationMs: null,
        pinnedIp: null,
        errorCategory: FailureCategory.DNS_RESOLUTION_FAILED,
        errorMessage: safeSanitize(dnsErr.message),
      };
    }
    const classified = classifyNetworkError(dnsErr);
    return {
      statusCode: null,
      headers: {},
      bodySnippet: null,
      durationMs: null,
      dnsDurationMs: null,
      connectDurationMs: null,
      tlsDurationMs: null,
      firstByteDurationMs: null,
      pinnedIp: null,
      errorCategory: classified.category,
      errorMessage: safeSanitize(classified.message),
    };
  }

  const effectivePinnedIp = options?.overridePinnedIp ?? dnsResult.pinnedIp;
  const isHttps = built.endpointUrl.protocol === "https:";
  const agent = createSsrfAgent({
    pinnedIp: effectivePinnedIp,
    isHttps,
    originalHostname: built.endpointUrl.hostname,
  });

  const port = built.endpointUrl.port ?? (isHttps ? 443 : 80);
  const path = built.endpointUrl.pathname + built.endpointUrl.search;

  // ARCH §5.1.B: Explicitly ignore inherited proxy environment variables
  const savedProxies: Record<string, string | undefined> = {
    HTTP_PROXY: process.env.HTTP_PROXY,
    http_proxy: process.env.http_proxy,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    https_proxy: process.env.https_proxy,
    ALL_PROXY: process.env.ALL_PROXY,
    all_proxy: process.env.all_proxy,
    NO_PROXY: process.env.NO_PROXY,
    no_proxy: process.env.no_proxy,
  };

  delete process.env.HTTP_PROXY;
  delete process.env.http_proxy;
  delete process.env.HTTPS_PROXY;
  delete process.env.https_proxy;
  delete process.env.ALL_PROXY;
  delete process.env.all_proxy;
  process.env.NO_PROXY = "*";
  process.env.no_proxy = "*";

  const restoreProxies = () => {
    for (const [key, val] of Object.entries(savedProxies)) {
      if (val !== undefined) {
        process.env[key] = val;
      } else {
        delete process.env[key];
      }
    }
  };

  return new Promise<ProbeResult>((resolve) => {
    let settled = false;

    const safeResolve = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      restoreProxies();
      agent.destroy();
      resolve(result);
    };

    const abortController = new AbortController();
    const totalTimeoutTimer = setTimeout(() => {
      abortController.abort(new Error(`Batas timeout total (${built.timeoutMs} ms) tercapai.`));
    }, built.timeoutMs);

    const connectTimeoutLimit = Math.min(CONNECT_TIMEOUT_MS, built.timeoutMs);
    const headersTimeoutLimit = Math.min(HEADERS_TIMEOUT_MS, built.timeoutMs);

    let connectTimer: NodeJS.Timeout | null = null;
    let headersTimer: NodeJS.Timeout | null = null;

    let connectDurationMs: number | null = null;
    let tlsDurationMs: number | null = null;
    let firstByteDurationMs: number | null = null;

    const connectStartTime = performance.now();
    let tcpConnectTime: number | null = null;

    const clearAllTimers = () => {
      clearTimeout(totalTimeoutTimer);
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      if (headersTimer) {
        clearTimeout(headersTimer);
        headersTimer = null;
      }
    };

    connectTimer = setTimeout(() => {
      req.destroy(
        new ConnectionTimeoutException(`TCP connect timeout setelah ${connectTimeoutLimit} ms`),
      );
    }, connectTimeoutLimit);

    const requestFn = isHttps ? https.request : http.request;
    const req = requestFn(
      {
        protocol: built.endpointUrl.protocol,
        host: built.endpointUrl.hostname,
        port,
        path,
        method: built.method,
        headers: {
          ...built.headers,
          host: built.endpointUrl.host,
        },
        servername: built.endpointUrl.hostname,
        agent,
        lookup: createPinnedLookup(effectivePinnedIp),
        signal: abortController.signal,
      },
      async (res) => {
        if (headersTimer) {
          clearTimeout(headersTimer);
          headersTimer = null;
        }

        firstByteDurationMs = Math.round((performance.now() - connectStartTime) * 100) / 100;
        const statusCode = res.statusCode ?? 200;
        const responseHeaders = sanitizeResponseHeaders(res.headers);
        const isRedirect = statusCode >= 300 && statusCode < 400;

        try {
          const { bodySnippet } = await consumeResponseBody(res, {
            needsResponseBody: isRedirect ? true : built.needsResponseBody,
          });

          const totalDurationMs = Math.round((performance.now() - connectStartTime) * 100) / 100;
          clearAllTimers();

          if (isRedirect) {
            const redirectLoc = responseHeaders.location || "unknown";
            safeResolve({
              statusCode,
              headers: responseHeaders,
              bodySnippet,
              durationMs: totalDurationMs,
              dnsDurationMs: dnsResult.dnsDurationMs,
              connectDurationMs,
              tlsDurationMs,
              firstByteDurationMs,
              pinnedIp: effectivePinnedIp,
              errorCategory: FailureCategory.REDIRECT_NOT_ALLOWED,
              errorMessage: safeSanitize(
                `HTTP redirect (${statusCode}) ke "${redirectLoc}" tidak diizinkan.`,
              ),
            });
            return;
          }

          safeResolve({
            statusCode,
            headers: responseHeaders,
            bodySnippet,
            durationMs: totalDurationMs,
            dnsDurationMs: dnsResult.dnsDurationMs,
            connectDurationMs,
            tlsDurationMs,
            firstByteDurationMs,
            pinnedIp: effectivePinnedIp,
            errorCategory: null,
            errorMessage: null,
          });
        } catch (bodyErr) {
          clearAllTimers();
          const totalDurationMs = Math.round((performance.now() - connectStartTime) * 100) / 100;

          if (bodyErr instanceof ResponseSizeExceededException) {
            safeResolve({
              statusCode,
              headers: responseHeaders,
              bodySnippet: null,
              durationMs: totalDurationMs,
              dnsDurationMs: dnsResult.dnsDurationMs,
              connectDurationMs,
              tlsDurationMs,
              firstByteDurationMs,
              pinnedIp: effectivePinnedIp,
              errorCategory: FailureCategory.RESPONSE_SIZE_EXCEEDED,
              errorMessage: safeSanitize(bodyErr.message),
            });
            return;
          }

          const classified = classifyNetworkError(bodyErr);
          safeResolve({
            statusCode,
            headers: responseHeaders,
            bodySnippet: null,
            durationMs: totalDurationMs,
            dnsDurationMs: dnsResult.dnsDurationMs,
            connectDurationMs,
            tlsDurationMs,
            firstByteDurationMs,
            pinnedIp: effectivePinnedIp,
            errorCategory: classified.category,
            errorMessage: classified.message,
          });
        }
      },
    );

    req.on("socket", (socket) => {
      const handleConnect = () => {
        tcpConnectTime = performance.now();
        connectDurationMs = Math.round((tcpConnectTime - connectStartTime) * 100) / 100;

        if (!isHttps) {
          if (connectTimer) {
            clearTimeout(connectTimer);
            connectTimer = null;
          }
          headersTimer = setTimeout(() => {
            req.destroy(
              new HeadersTimeoutException(
                `Headers timeout: server tidak merespons setelah ${headersTimeoutLimit} ms`,
              ),
            );
          }, headersTimeoutLimit);
        }
      };

      if (socket.connecting) {
        socket.once("connect", handleConnect);
      } else {
        handleConnect();
      }

      if (isHttps) {
        socket.once("secureConnect", () => {
          const tlsFinishTime = performance.now();
          if (tcpConnectTime !== null) {
            tlsDurationMs = Math.round((tlsFinishTime - tcpConnectTime) * 100) / 100;
          }
          if (connectTimer) {
            clearTimeout(connectTimer);
            connectTimer = null;
          }
          headersTimer = setTimeout(() => {
            req.destroy(
              new HeadersTimeoutException(
                `Headers timeout: server tidak merespons setelah ${headersTimeoutLimit} ms`,
              ),
            );
          }, headersTimeoutLimit);
        });
      }
    });

    req.on("error", (err) => {
      clearAllTimers();
      const totalDurationMs = Math.round((performance.now() - connectStartTime) * 100) / 100;
      let classified = classifyNetworkError(err);

      if (abortController.signal.aborted) {
        classified = {
          category: FailureCategory.CONNECTION_TIMEOUT,
          message: safeSanitize(
            `Operasi probe dibatalkan karena batas waktu timeout (${built.timeoutMs} ms) tercapai.`,
          ),
        };
      }

      safeResolve({
        statusCode: null,
        headers: {},
        bodySnippet: null,
        durationMs: totalDurationMs,
        dnsDurationMs: dnsResult.dnsDurationMs,
        connectDurationMs,
        tlsDurationMs,
        firstByteDurationMs,
        pinnedIp: effectivePinnedIp,
        errorCategory: classified.category,
        errorMessage: classified.message,
      });
    });

    if (built.body && built.method !== "GET" && built.method !== "HEAD") {
      req.write(built.body);
    }
    req.end();
  });
}
