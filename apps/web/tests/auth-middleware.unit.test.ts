import {
  ForbiddenException,
  InvalidCredentialsException,
  RateLimitExceededException,
} from "@sentinel/domain";
import type { H3Event } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import securityHeadersMiddleware from "../server/middleware/01.security-headers.js";
import csrfMiddleware from "../server/middleware/03.csrf.js";
import authSessionMiddleware from "../server/middleware/04.auth-session.js";
import rateLimitTier3Middleware from "../server/middleware/05.rate-limit-tier3.js";
import { getContainer } from "../server/utils/container.js";
import { signCookieValue } from "../server/utils/session-cookie.js";

interface MockEventOverrides {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  remoteAddress?: string;
  context?: Record<string, unknown>;
}

function createMockEvent(overrides: MockEventOverrides = {}): H3Event {
  const headers: Record<string, string> = {
    host: "localhost:3000",
    ...(overrides.headers || {}),
  };
  const responseHeaders: Record<string, string> = {};

  return {
    method: overrides.method || "GET",
    path: overrides.path || "/",
    node: {
      req: {
        method: overrides.method || "GET",
        url: overrides.path || "/",
        headers,
        socket: {
          remoteAddress: overrides.remoteAddress || "127.0.0.1",
        },
      },
      res: {
        setHeader: (name: string, value: string) => {
          responseHeaders[name.toLowerCase()] = value;
        },
        getHeader: (name: string) => responseHeaders[name.toLowerCase()],
        headersSent: false,
      },
    },
    context: overrides.context || {},
  } as unknown as H3Event;
}

const VALID_KEYRING = JSON.stringify({
  activeKeyId: "key-1",
  keys: {
    "key-1": Buffer.alloc(32, 1).toString("base64"),
  },
});

const VALID_ENV = {
  NODE_ENV: "test",
  PORT: "3000",
  WORKER_PORT: "3001",
  DATABASE_URL: "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel",
  APP_KEYRING: VALID_KEYRING,
  SESSION_SECRET: "a-very-long-and-secure-session-secret-key-32chars",
  LOG_LEVEL: "info",
};

describe("P7.5 — Nitro Middlewares Unit Suite", () => {
  beforeEach(() => {
    getContainer(VALID_ENV);
    vi.restoreAllMocks();
  });

  describe("01.security-headers", () => {
    it("sets security headers with strict CSP on every request", () => {
      const event = createMockEvent();
      securityHeadersMiddleware(event);

      const res = event.node.res;
      expect(res.getHeader("x-content-type-options")).toBe("nosniff");
      expect(res.getHeader("x-frame-options")).toBe("DENY");
      expect(res.getHeader("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(res.getHeader("content-security-policy")).toContain("default-src 'self'");
    });
  });

  describe("03.csrf", () => {
    it("allows GET requests without origin header", () => {
      const event = createMockEvent({ method: "GET" });
      expect(() => csrfMiddleware(event)).not.toThrow();
    });

    it("allows POST request when Origin host matches Host header", () => {
      const event = createMockEvent({
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
      });
      expect(() => csrfMiddleware(event)).not.toThrow();
    });

    it("rejects POST request when Origin does not match Host header", () => {
      const event = createMockEvent({
        method: "POST",
        headers: {
          host: "api-sentinel.local",
          origin: "https://evil-attacker.com",
        },
      });
      expect(() => csrfMiddleware(event)).toThrow(ForbiddenException);
    });

    it("rejects mutation request without Origin or Referer header", () => {
      const event = createMockEvent({
        method: "DELETE",
        headers: { host: "localhost:3000" },
      });
      expect(() => csrfMiddleware(event)).toThrow(ForbiddenException);
    });

    it("validates WebSocket upgrade request origin", () => {
      const event = createMockEvent({
        method: "GET",
        headers: {
          host: "localhost:3000",
          upgrade: "websocket",
          origin: "http://evil.com",
        },
      });
      expect(() => csrfMiddleware(event)).toThrow(ForbiddenException);
    });
  });

  describe("04.auth-session", () => {
    it("skips session validation for public paths like /healthz and /api/auth/login", async () => {
      const eventHealth = createMockEvent({ path: "/healthz" });
      await authSessionMiddleware(eventHealth);
      expect(eventHealth.context.user).toBeUndefined();

      const eventLogin = createMockEvent({ path: "/api/auth/login" });
      await authSessionMiddleware(eventLogin);
      expect(eventLogin.context.user).toBeUndefined();
    });

    it("throws InvalidCredentialsException for protected /api route without session cookie", async () => {
      const event = createMockEvent({ path: "/api/monitors" });
      await expect(authSessionMiddleware(event)).rejects.toThrow(InvalidCredentialsException);
    });

    it("populates user in context on valid session cookie", async () => {
      const container = getContainer();
      const mockUser = { id: "018f0000-0000-7000-8000-000000000001", username: "admin" };
      vi.spyOn(container.validateSessionUseCase, "execute").mockResolvedValue({
        authenticated: true,
        user: mockUser,
      });

      const rawToken = "valid-session-token-12345678901234567890";
      const signedCookie = signCookieValue(rawToken, container.env.SESSION_SECRET);

      const event = createMockEvent({
        path: "/api/monitors",
        headers: {
          cookie: `sentinel_session=${signedCookie}`,
        },
      });

      await authSessionMiddleware(event);

      expect(event.context.user).toEqual(mockUser);
      expect(event.context.sessionToken).toBe(rawToken);
    });
  });

  describe("05.rate-limit-tier3", () => {
    it("allows authenticated API calls within rate limit", async () => {
      const container = getContainer();
      vi.spyOn(container.rateLimiter, "consume").mockResolvedValue({
        allowed: true,
        remaining: 119,
        resetAfterSeconds: 60,
      });

      const event = createMockEvent({
        path: "/api/monitors",
        context: {
          user: { id: "user-123", username: "admin" },
        },
      });

      await expect(rateLimitTier3Middleware(event)).resolves.not.toThrow();
    });

    it("throws RateLimitExceededException when exceeding 120 req/min", async () => {
      const container = getContainer();
      vi.spyOn(container.rateLimiter, "consume").mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAfterSeconds: 45,
      });

      const event = createMockEvent({
        path: "/api/monitors",
        context: {
          user: { id: "user-123", username: "admin" },
        },
      });

      await expect(rateLimitTier3Middleware(event)).rejects.toThrow(RateLimitExceededException);
    });
  });
});
