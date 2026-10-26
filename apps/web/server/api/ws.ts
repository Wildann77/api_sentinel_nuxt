import type { Peer } from "crossws";
import { defineWebSocketHandler } from "h3";
import { getContainer } from "../utils/container.js";
import { SESSION_COOKIE_NAME, verifySignedCookie } from "../utils/session-cookie.js";
import { getWsHub } from "../utils/ws-hub.js";

function getHeader(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const map = headers as Record<string, string | string[] | undefined>;
  const val = map[name.toLowerCase()] ?? map[name];
  if (Array.isArray(val)) return val[0] ?? null;
  return typeof val === "string" ? val : null;
}

function parseCookiesFromHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [name, ...rest] = pair.split("=");
    if (name) {
      cookies[name.trim()] = rest.join("=").trim();
    }
  }
  return cookies;
}

export function validateWebSocketOrigin(
  origin: string | null,
  host: string | null,
  isDev = false,
): boolean {
  if (!origin) {
    return false;
  }
  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host.toLowerCase();

    if (host && originHost === host.trim().toLowerCase()) {
      return true;
    }

    if (isDev) {
      if (
        originUrl.hostname === "localhost" ||
        originUrl.hostname === "127.0.0.1" ||
        originUrl.hostname === "::1"
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export const wsHooks = {
  async upgrade(request: {
    url?: string;
    headers?: Headers | Record<string, string | string[] | undefined>;
    context?: Record<string, unknown>;
  }) {
    const container = getContainer();
    const headers = request.headers;

    // 1. Validate Origin (CSWSH Prevention)
    const origin = getHeader(headers, "origin");
    const host = getHeader(headers, "host");
    const isDev = container.env.NODE_ENV !== "production";

    if (!validateWebSocketOrigin(origin, host, isDev)) {
      return new Response("Forbidden: invalid or untrusted origin", { status: 403 });
    }

    // 2. Validate Session Cookie
    const cookieHeader = getHeader(headers, "cookie");
    const cookies = parseCookiesFromHeader(cookieHeader);
    const signedCookie = cookies[SESSION_COOKIE_NAME];

    if (!signedCookie) {
      return new Response("Unauthorized: missing session cookie", { status: 401 });
    }

    const token = verifySignedCookie(signedCookie, container.env.SESSION_SECRET);
    if (!token) {
      return new Response("Unauthorized: invalid session cookie signature", { status: 401 });
    }

    const validation = await container.validateSessionUseCase.execute({ token });
    if (!validation.authenticated || !validation.user) {
      return new Response("Unauthorized: session expired or invalid", { status: 401 });
    }

    request.context = request.context || {};
    request.context.user = validation.user;
    request.context.sessionToken = token;
  },

  open(peer: Peer) {
    const wsHub = getWsHub();
    wsHub.registerPeer(peer);
  },

  message(peer: Peer, message: unknown) {
    const wsHub = getWsHub();
    wsHub.handleClientMessage(peer, message);
  },

  close(peer: Peer) {
    const wsHub = getWsHub();
    wsHub.unregisterPeer(peer);
  },

  error(peer: Peer, error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const container = getContainer();
    container.logger.error(`WebSocket peer error: ${errorMsg}`, {
      peerId: peer.id,
      errorDetail: errorMsg,
    });
    const wsHub = getWsHub();
    wsHub.unregisterPeer(peer);
  },
};

export default defineWebSocketHandler(wsHooks);
