import type { CheckCompletedEventDto, IncidentTransitionEventDto } from "@sentinel/domain";
import { QueryClient } from "@tanstack/vue-query";
import type { Peer } from "crossws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSentinelSocket } from "../app/composables/use-sentinel-socket.js";
import { wsHooks } from "../server/api/ws.js";
import { processSentinelEventPayload } from "../server/plugins/sentinel-events.js";
import { getContainer, resetContainer } from "../server/utils/container.js";
import { SESSION_COOKIE_NAME, signCookieValue } from "../server/utils/session-cookie.js";
import { getWsHub, resetWsHub, type WsHub } from "../server/utils/ws-hub.js";

const VALID_KEYRING = JSON.stringify({
  activeKeyId: "key-1",
  keys: {
    "key-1": Buffer.alloc(32, 1).toString("base64"),
  },
});

const VALID_ENV = {
  NODE_ENV: "production",
  PORT: "3000",
  WORKER_PORT: "3001",
  DATABASE_URL: "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel",
  APP_KEYRING: VALID_KEYRING,
  SESSION_SECRET: "secure-session-secret-at-least-32-characters-long",
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

function getOrThrow<T>(value: T | undefined | null, msg = "Expected defined value"): T {
  if (value === undefined || value === null) {
    throw new Error(msg);
  }
  return value;
}

class MockClientWebSocket {
  public static instances: MockClientWebSocket[] = [];
  public url: string;
  public readyState = 0;
  public sentMessages: string[] = [];

  public onopen: ((ev: Event) => void) | null = null;
  public onmessage: ((ev: MessageEvent) => void) | null = null;
  public onclose: ((ev: CloseEvent) => void) | null = null;
  public onerror: ((ev: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockClientWebSocket.instances.push(this);
  }

  public open(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  public receiveMessage(data: unknown): void {
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    this.onmessage?.(new MessageEvent("message", { data: raw }));
  }

  public triggerClose(): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }

  public send(data: string): void {
    this.sentMessages.push(data);
  }

  public close(): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }
}

describe("P12.5 — Real-time End-to-End Integration Suite", () => {
  let wsHub: WsHub;

  beforeEach(async () => {
    vi.useFakeTimers();
    MockClientWebSocket.instances = [];
    await resetContainer();
    resetWsHub();
    getContainer(VALID_ENV);
    wsHub = getWsHub();
  });

  afterEach(async () => {
    vi.clearAllTimers();
    vi.useRealTimers();
    await resetContainer();
    resetWsHub();
  });

  describe("1. Handshake Security & Origin Protection", () => {
    it("rejects WebSocket handshake without session cookie with 401 Unauthorized", async () => {
      const request = {
        headers: {
          host: "sentinel.internal",
          origin: "https://sentinel.internal",
        },
      };

      const response = await wsHooks.upgrade(request);
      expect(response).toBeInstanceOf(Response);
      expect(response?.status).toBe(401);

      const body = await response?.text();
      expect(body).toContain("missing session cookie");
    });

    it("rejects WebSocket handshake with tampered/invalid session signature with 401 Unauthorized", async () => {
      const request = {
        headers: {
          host: "sentinel.internal",
          origin: "https://sentinel.internal",
          cookie: `${SESSION_COOKIE_NAME}=forged-token.bad-signature`,
        },
      };

      const response = await wsHooks.upgrade(request);
      expect(response).toBeInstanceOf(Response);
      expect(response?.status).toBe(401);

      const body = await response?.text();
      expect(body).toContain("invalid session cookie signature");
    });

    it("rejects WebSocket handshake from untrusted Origin with 403 Forbidden", async () => {
      const signed = signCookieValue("valid-session-token", VALID_ENV.SESSION_SECRET);
      const request = {
        headers: {
          host: "sentinel.internal",
          origin: "https://evil-attacker.example.com",
          cookie: `${SESSION_COOKIE_NAME}=${signed}`,
        },
      };

      const response = await wsHooks.upgrade(request);
      expect(response).toBeInstanceOf(Response);
      expect(response?.status).toBe(403);

      const body = await response?.text();
      expect(body).toContain("invalid or untrusted origin");
    });

    it("accepts WebSocket handshake when session cookie and origin are both valid", async () => {
      const container = getContainer();
      vi.spyOn(container.validateSessionUseCase, "execute").mockResolvedValue({
        authenticated: true,
        user: {
          id: "018f0000-0000-7000-8000-000000000001",
          username: "admin",
          role: "OWNER",
          createdAt: new Date().toISOString(),
        },
      });

      const signed = signCookieValue("session-token-abc", VALID_ENV.SESSION_SECRET);
      const context: Record<string, unknown> = {};
      const request = {
        headers: {
          host: "sentinel.internal",
          origin: "https://sentinel.internal",
          cookie: `${SESSION_COOKIE_NAME}=${signed}`,
        },
        context,
      };

      const response = await wsHooks.upgrade(request);
      expect(response).toBeUndefined(); // Upgrade allowed
      expect(context.sessionToken).toBe("session-token-abc");
    });
  });

  describe("2. NOTIFY → WS Peer Menerima Pipeline", () => {
    it("broadcasts CHECK_COMPLETED from PostgreSQL NOTIFY to connected peers", () => {
      const mockPeerAll = new MockPeer("peer-overview");
      const mockPeerSpecific = new MockPeer("peer-detail");
      const peerAll = mockPeerAll as unknown as Peer;
      const peerSpecific = mockPeerSpecific as unknown as Peer;

      wsHub.registerPeer(peerAll);
      wsHub.registerPeer(peerSpecific);

      const monitorId = "018f0000-0000-7000-8000-000000000010";
      wsHub.unsubscribePeer(peerSpecific, "monitors:all");
      wsHub.subscribePeer(peerSpecific, `monitor:${monitorId}`);

      const eventPayload: CheckCompletedEventDto = {
        event: "CHECK_COMPLETED",
        monitorId,
        status: "UP",
        durationMs: 42,
        executedAt: new Date().toISOString(),
      };

      // Simulated NOTIFY delivery into listener
      const delivered = processSentinelEventPayload(JSON.stringify(eventPayload), wsHub);
      expect(delivered).toBe(true);

      // Both peerAll (subscribed to monitors:all) and peerSpecific (subscribed to monitor) receive it
      expect(mockPeerAll.sentMessages).toHaveLength(1);
      expect(mockPeerSpecific.sentMessages).toHaveLength(1);

      const received1 = JSON.parse(getOrThrow(mockPeerAll.sentMessages[0]));
      expect(received1.event).toBe("CHECK_COMPLETED");
      expect(received1.monitorId).toBe(monitorId);
      expect(received1.durationMs).toBe(42);

      const received2 = JSON.parse(getOrThrow(mockPeerSpecific.sentMessages[0]));
      expect(received2.event).toBe("CHECK_COMPLETED");
      expect(received2.monitorId).toBe(monitorId);
    });

    it("broadcasts INCIDENT_TRANSITION from PostgreSQL NOTIFY to connected peers", () => {
      const mockPeer = new MockPeer("peer-1");
      const peer = mockPeer as unknown as Peer;
      wsHub.registerPeer(peer);

      const monitorId = "018f0000-0000-7000-8000-000000000020";
      const incidentId = "018f0000-0000-7000-8000-000000000021";

      const incidentPayload: IncidentTransitionEventDto = {
        event: "INCIDENT_TRANSITION",
        monitorId,
        incidentId,
        type: "OPENED",
        healthStatus: "DOWN",
        timestamp: new Date().toISOString(),
      };

      const delivered = processSentinelEventPayload(JSON.stringify(incidentPayload), wsHub);
      expect(delivered).toBe(true);

      expect(mockPeer.sentMessages).toHaveLength(1);
      const parsed = JSON.parse(getOrThrow(mockPeer.sentMessages[0]));
      expect(parsed.event).toBe("INCIDENT_TRANSITION");
      expect(parsed.type).toBe("OPENED");
      expect(parsed.healthStatus).toBe("DOWN");
    });
  });

  describe("3. Putus koneksi LISTEN/WS → Resync Benar, Tanpa Data Basi", () => {
    it("resyncs stale dashboard cache on reconnect and re-subscribes active topics", async () => {
      const monitorId = "018f0000-0000-7000-8000-000000000030";

      // Simulated server REST state that changes while client is disconnected
      let currentServerState = {
        id: monitorId,
        name: "Auth Microservice",
        status: "UP",
        consecutiveFailures: 0,
      };

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      });

      // Pre-populate client query cache with initial server state via prefetchQuery
      await queryClient.prefetchQuery({
        queryKey: ["monitors"],
        queryFn: () => Promise.resolve([currentServerState]),
      });

      const client = useSentinelSocket({
        autoConnect: false,
        reconnectBaseMs: 200,
        reconnectMaxMs: 1000,
        queryClient,
        WebSocketClass: MockClientWebSocket as unknown as typeof WebSocket,
      });

      // 1. Initial connect
      client.connect();
      expect(MockClientWebSocket.instances).toHaveLength(1);
      const ws1 = getOrThrow(MockClientWebSocket.instances[0]);
      ws1.open();
      expect(client.status.value).toBe("LIVE");

      // Subscribe to target monitor
      client.subscribe(monitorId);
      expect(ws1.sentMessages).toHaveLength(1);
      expect(JSON.parse(getOrThrow(ws1.sentMessages[0]))).toEqual({
        action: "subscribe",
        monitorId,
      });

      // 2. Unexpected connection drop (network partition / worker restart)
      ws1.triggerClose();
      expect(client.status.value).toBe("DISCONNECTED");

      // 3. During disconnection, server state transitions (incident opened, status DOWN)
      // Client missed the WS event! Cache is currently stale ("UP").
      currentServerState = {
        id: monitorId,
        name: "Auth Microservice",
        status: "DOWN",
        consecutiveFailures: 3,
      };

      const staleCache = queryClient.getQueryData<Array<{ id: string; status: string }>>([
        "monitors",
      ]);
      expect(staleCache?.[0]?.status).toBe("UP"); // Still stale

      // 4. Backoff timer fires and reconnection socket connects
      vi.advanceTimersByTime(200);
      expect(MockClientWebSocket.instances).toHaveLength(2);
      const ws2 = getOrThrow(MockClientWebSocket.instances[1]);

      // 5. Reconnection handshake succeeds
      ws2.open();

      // State briefly goes to SYNCING during query resync
      expect(client.status.value).toBe("SYNCING");

      await vi.advanceTimersByTimeAsync(0);

      // Transitions to LIVE once resync completes
      expect(client.status.value).toBe("LIVE");

      // Verify that queryClient refetched fresh state: no stale data!
      const freshCache = queryClient.getQueryData<Array<{ id: string; status: string }>>([
        "monitors",
      ]);
      expect(freshCache?.[0]?.status).toBe("DOWN");

      // Verify re-subscription occurred on new socket
      const sent = ws2.sentMessages.map((m) => JSON.parse(m));
      expect(sent).toContainEqual({ action: "subscribe", monitorId });
    });
  });
});
