import type { Peer } from "crossws";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateWebSocketOrigin, wsHooks } from "../server/api/ws.js";
import { getContainer, resetContainer } from "../server/utils/container.js";
import { SESSION_COOKIE_NAME, signCookieValue } from "../server/utils/session-cookie.js";
import { getWsHub, resetWsHub } from "../server/utils/ws-hub.js";

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

class MockPeer implements Partial<Peer> {
  public id: string;
  public topics = new Set<string>();
  public sentMessages: string[] = [];

  constructor(id: string) {
    this.id = id;
  }

  public subscribe(topic: string): void {
    this.topics.add(topic);
  }

  public unsubscribe(topic: string): void {
    this.topics.delete(topic);
  }

  public send(data: unknown): void {
    this.sentMessages.push(typeof data === "string" ? data : JSON.stringify(data));
  }
}

describe("P12.3 — WebSocket /api/ws Endpoint and Hooks Unit Suite", () => {
  beforeEach(async () => {
    await resetContainer();
    resetWsHub();
    getContainer(VALID_ENV);
    vi.restoreAllMocks();
  });

  describe("validateWebSocketOrigin", () => {
    it("rejects when Origin header is missing", () => {
      expect(validateWebSocketOrigin(null, "localhost:3000", false)).toBe(false);
    });

    it("allows when Origin host matches Host header", () => {
      expect(validateWebSocketOrigin("https://sentinel.internal", "sentinel.internal", false)).toBe(
        true,
      );
    });

    it("rejects when Origin host does not match Host header in production", () => {
      expect(validateWebSocketOrigin("https://evil.com", "sentinel.internal", false)).toBe(false);
    });

    it("allows localhost and 127.0.0.1 in development mode", () => {
      expect(validateWebSocketOrigin("http://localhost:5173", "127.0.0.1:3000", true)).toBe(true);
      expect(validateWebSocketOrigin("http://127.0.0.1:5173", "localhost:3000", true)).toBe(true);
    });

    it("rejects invalid/malformed origin string", () => {
      expect(validateWebSocketOrigin("not-a-valid-url", "localhost:3000", true)).toBe(false);
    });
  });

  describe("wsHooks.upgrade", () => {
    it("rejects with 403 Forbidden if Origin is invalid or untrusted", async () => {
      const request = {
        headers: {
          host: "sentinel.company.com",
          origin: "https://attacker.site",
        },
      };

      const res = await wsHooks.upgrade(request);
      expect(res).toBeInstanceOf(Response);
      expect(res?.status).toBe(403);
    });

    it("rejects with 401 Unauthorized if session cookie is missing", async () => {
      const request = {
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
      };

      const res = await wsHooks.upgrade(request);
      expect(res).toBeInstanceOf(Response);
      expect(res?.status).toBe(401);
      const text = await res?.text();
      expect(text).toContain("missing session cookie");
    });

    it("rejects with 401 Unauthorized if session cookie signature is invalid", async () => {
      const request = {
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          cookie: `${SESSION_COOKIE_NAME}=rawtoken.invalidsignature`,
        },
      };

      const res = await wsHooks.upgrade(request);
      expect(res).toBeInstanceOf(Response);
      expect(res?.status).toBe(401);
      const text = await res?.text();
      expect(text).toContain("invalid session cookie signature");
    });

    it("rejects with 401 Unauthorized if session is expired or not found", async () => {
      const container = getContainer();
      vi.spyOn(container.validateSessionUseCase, "execute").mockResolvedValue({
        authenticated: false,
        user: null,
      });

      const signed = signCookieValue("session-token-xyz", container.env.SESSION_SECRET);
      const request = {
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          cookie: `${SESSION_COOKIE_NAME}=${signed}`,
        },
      };

      const res = await wsHooks.upgrade(request);
      expect(res).toBeInstanceOf(Response);
      expect(res?.status).toBe(401);
      const text = await res?.text();
      expect(text).toContain("session expired or invalid");
    });

    it("succeeds and attaches user to context when origin and session are valid", async () => {
      const container = getContainer();
      const mockUser = {
        id: "018f0000-0000-7000-8000-000000000001",
        username: "admin",
        role: "OWNER" as const,
        createdAt: new Date().toISOString(),
      };

      vi.spyOn(container.validateSessionUseCase, "execute").mockResolvedValue({
        authenticated: true,
        user: mockUser,
      });

      const signed = signCookieValue("session-token-123", container.env.SESSION_SECRET);
      const context: Record<string, unknown> = {};
      const request = {
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
        context,
      };
      // Provide headers with get method (Headers-like)
      const headers = new Headers({
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${SESSION_COOKIE_NAME}=${signed}`,
      });
      request.headers = headers;

      const res = await wsHooks.upgrade(request);
      expect(res).toBeUndefined(); // Successful upgrade returns undefined or void
      expect(context.user).toEqual(mockUser);
      expect(context.sessionToken).toBe("session-token-123");
    });
  });

  describe("peer lifecycle hooks", () => {
    it("registers and unregisters peer on open and close", () => {
      const wsHub = getWsHub();
      const mockPeer = new MockPeer("p-lifecycle");
      const peer = mockPeer as unknown as Peer;

      wsHooks.open(peer);
      expect(wsHub.getConnectedPeerCount()).toBe(1);

      wsHooks.close(peer);
      expect(wsHub.getConnectedPeerCount()).toBe(0);
    });

    it("handles client messages through wsHub on message event", () => {
      const mockPeer = new MockPeer("p-msg");
      const peer = mockPeer as unknown as Peer;

      wsHooks.open(peer);
      wsHooks.message(peer, JSON.stringify({ action: "ping" }));

      expect(mockPeer.sentMessages).toHaveLength(1);
      const pong = JSON.parse(mockPeer.sentMessages[0] ?? "{}");
      expect(pong.event).toBe("pong");
    });

    it("cleans up peer on error event", () => {
      const wsHub = getWsHub();
      const mockPeer = new MockPeer("p-err");
      const peer = mockPeer as unknown as Peer;

      wsHooks.open(peer);
      expect(wsHub.getConnectedPeerCount()).toBe(1);

      wsHooks.error(peer, new Error("Unexpected connection reset"));
      expect(wsHub.getConnectedPeerCount()).toBe(0);
    });
  });
});
