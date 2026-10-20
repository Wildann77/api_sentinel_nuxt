import { InvalidCredentialsException, RateLimitExceededException } from "@sentinel/domain";
import type { H3Event } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import loginHandler from "../server/api/auth/login.post.js";
import logoutHandler from "../server/api/auth/logout.post.js";
import meHandler from "../server/api/auth/me.get.js";
import changePasswordHandler from "../server/api/settings/account/password.put.js";
import { getContainer } from "../server/utils/container.js";

interface MockEventOverrides {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  remoteAddress?: string;
  context?: Record<string, unknown>;
  body?: unknown;
}

function createMockEvent(overrides: MockEventOverrides = {}): H3Event {
  const headers: Record<string, string> = {
    host: "localhost:3000",
    ...(overrides.headers || {}),
  };
  const responseHeaders: Record<string, string | string[]> = {};

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
        setHeader: (name: string, value: string | string[]) => {
          responseHeaders[name.toLowerCase()] = value;
        },
        getHeader: (name: string) => responseHeaders[name.toLowerCase()],
        headersSent: false,
      },
    },
    context: overrides.context || {},
    _body: overrides.body,
  } as unknown as H3Event;
}

// Mock readBody from h3 for handler execution
vi.mock("h3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("h3")>();
  return {
    ...actual,
    readBody: vi.fn(async (event: unknown) => (event as { _body?: unknown })?._body),
  };
});

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

describe("P7.6 — Authentication & Settings Endpoints Unit Suite", () => {
  beforeEach(() => {
    getContainer(VALID_ENV);
    vi.restoreAllMocks();
  });

  describe("POST /api/auth/login", () => {
    it("logs in successfully and sets HttpOnly cookie", async () => {
      const container = getContainer();
      const mockResult = {
        token: "fake-jwt-or-opaque-token-abcdef1234567890",
        user: { id: "018f0000-0000-7000-8000-000000000001", username: "owner" },
      };

      vi.spyOn(container.authenticateUserUseCase, "execute").mockResolvedValue(mockResult);

      const event = createMockEvent({
        method: "POST",
        path: "/api/auth/login",
        body: { username: "owner", password: "Password123!" },
        context: { clientIp: "127.0.0.1" },
      });

      const response = await loginHandler(event);

      expect(response).toEqual({ user: mockResult.user });
      const setCookieHeader = event.node.res.getHeader("set-cookie");
      expect(setCookieHeader).toBeDefined();
      const cookieStr = Array.isArray(setCookieHeader)
        ? setCookieHeader.join(";")
        : String(setCookieHeader);
      expect(cookieStr).toContain("sentinel_session=");
      expect(cookieStr).toContain("HttpOnly");
      expect(cookieStr).toContain("SameSite=Lax");
      expect(cookieStr).toContain("Path=/");
    });

    it("propagates InvalidCredentialsException on invalid credentials without revealing reason", async () => {
      const container = getContainer();
      vi.spyOn(container.authenticateUserUseCase, "execute").mockRejectedValue(
        new InvalidCredentialsException("Kredensial tidak valid"),
      );

      const event = createMockEvent({
        method: "POST",
        body: { username: "wrong_user", password: "WrongPassword123!" },
      });

      await expect(loginHandler(event)).rejects.toThrow(InvalidCredentialsException);
    });

    it("propagates RateLimitExceededException after 5 failed attempts", async () => {
      const container = getContainer();
      vi.spyOn(container.authenticateUserUseCase, "execute").mockRejectedValue(
        new RateLimitExceededException("Batas percobaan login terlampaui", 900),
      );

      const event = createMockEvent({
        method: "POST",
        body: { username: "owner", password: "WrongPassword123!" },
      });

      await expect(loginHandler(event)).rejects.toThrow(RateLimitExceededException);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("revokes session and clears session cookie", async () => {
      const container = getContainer();
      const revokeSpy = vi.spyOn(container.revokeSessionUseCase, "execute").mockResolvedValue();

      const event = createMockEvent({
        method: "POST",
        path: "/api/auth/logout",
        context: { sessionToken: "active-token-to-revoke" },
      });

      const res = await logoutHandler(event);
      expect(res).toEqual({ success: true });
      expect(revokeSpy).toHaveBeenCalledWith({ token: "active-token-to-revoke" });

      const setCookieHeader = event.node.res.getHeader("set-cookie");
      const cookieStr = Array.isArray(setCookieHeader)
        ? setCookieHeader.join(";")
        : String(setCookieHeader);
      expect(cookieStr).toContain("Max-Age=0");
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns authenticated true with user details when session present", () => {
      const user = { id: "018f0000-0000-7000-8000-000000000001", username: "owner" };
      const event = createMockEvent({
        method: "GET",
        path: "/api/auth/me",
        context: { user },
      });

      const res = meHandler(event);
      expect(res).toEqual({
        authenticated: true,
        user,
      });
    });

    it("returns authenticated false with null user when unauthenticated", () => {
      const event = createMockEvent({
        method: "GET",
        path: "/api/auth/me",
        context: {},
      });

      const res = meHandler(event);
      expect(res).toEqual({
        authenticated: false,
        user: null,
      });
    });
  });

  describe("PUT /api/settings/account/password", () => {
    it("executes password change use case with current token", async () => {
      const container = getContainer();
      const changePasswordSpy = vi
        .spyOn(container.changeOwnerPasswordUseCase, "execute")
        .mockResolvedValue();

      const event = createMockEvent({
        method: "PUT",
        path: "/api/settings/account/password",
        body: {
          currentPassword: "OldPassword123!",
          newPassword: "NewSuperPassword123!",
        },
        context: { sessionToken: "my-valid-token" },
      });

      const res = await changePasswordHandler(event);
      expect(res).toEqual({ success: true });
      expect(changePasswordSpy).toHaveBeenCalledWith({
        currentSessionToken: "my-valid-token",
        request: {
          currentPassword: "OldPassword123!",
          newPassword: "NewSuperPassword123!",
        },
      });
    });

    it("throws InvalidCredentialsException if session token is missing", async () => {
      const event = createMockEvent({
        method: "PUT",
        path: "/api/settings/account/password",
        body: {
          currentPassword: "OldPassword123!",
          newPassword: "NewSuperPassword123!",
        },
      });

      await expect(changePasswordHandler(event)).rejects.toThrow(InvalidCredentialsException);
    });
  });
});
