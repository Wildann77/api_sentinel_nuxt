import { QueryClient } from "@tanstack/vue-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSentinelSocket } from "../app/composables/use-sentinel-socket.js";

class MockClientWebSocket {
  public static instances: MockClientWebSocket[] = [];
  public url: string;
  public readyState = 0; // 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
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

  public triggerError(): void {
    this.onerror?.(new Event("error"));
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

function getOrThrow<T>(value: T | undefined | null, msg = "Expected defined value"): T {
  if (value === undefined || value === null) {
    throw new Error(msg);
  }
  return value;
}

describe("P12.4 — useSentinelSocket Composable Unit Tests", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    MockClientWebSocket.instances = [];
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("initializes with DISCONNECTED status and does not auto-connect when autoConnect: false", () => {
    const client = useSentinelSocket({
      autoConnect: false,
      queryClient,
      WebSocketClass: MockClientWebSocket as unknown as typeof WebSocket,
    });

    expect(client.status.value).toBe("DISCONNECTED");
    expect(MockClientWebSocket.instances).toHaveLength(0);
  });

  it("connects and transitions to LIVE when socket opens", () => {
    const client = useSentinelSocket({
      autoConnect: false,
      queryClient,
      WebSocketClass: MockClientWebSocket as unknown as typeof WebSocket,
    });

    client.connect();
    expect(MockClientWebSocket.instances).toHaveLength(1);
    const mockWs = getOrThrow(MockClientWebSocket.instances[0]);

    mockWs.open();
    expect(client.status.value).toBe("LIVE");
  });

  it("subscribes and tracks topics, sending subscribe action to open socket", () => {
    const client = useSentinelSocket({
      autoConnect: false,
      queryClient,
      WebSocketClass: MockClientWebSocket as unknown as typeof WebSocket,
    });

    client.connect();
    const mockWs = getOrThrow(MockClientWebSocket.instances[0]);
    mockWs.open();

    const monitorId = "018f0000-0000-7000-8000-000000000001";
    client.subscribe(monitorId);

    expect(mockWs.sentMessages).toHaveLength(1);
    expect(JSON.parse(getOrThrow(mockWs.sentMessages[0]))).toEqual({
      action: "subscribe",
      monitorId,
    });

    client.unsubscribe(monitorId);
    expect(mockWs.sentMessages).toHaveLength(2);
    expect(JSON.parse(getOrThrow(mockWs.sentMessages[1]))).toEqual({
      action: "unsubscribe",
      monitorId,
    });
  });

  it("subscribes to all monitors when monitorId is omitted", () => {
    const client = useSentinelSocket({
      autoConnect: false,
      queryClient,
      WebSocketClass: MockClientWebSocket as unknown as typeof WebSocket,
    });

    client.connect();
    const mockWs = getOrThrow(MockClientWebSocket.instances[0]);
    mockWs.open();

    client.subscribe();
    expect(mockWs.sentMessages).toHaveLength(1);
    expect(JSON.parse(getOrThrow(mockWs.sentMessages[0]))).toEqual({
      action: "subscribe",
    });

    client.unsubscribe();
    expect(mockWs.sentMessages).toHaveLength(2);
    expect(JSON.parse(getOrThrow(mockWs.sentMessages[1]))).toEqual({
      action: "unsubscribe",
    });
  });

  it("sends periodic ping messages to keep connection alive", () => {
    const client = useSentinelSocket({
      autoConnect: false,
      pingIntervalMs: 5000,
      queryClient,
      WebSocketClass: MockClientWebSocket as unknown as typeof WebSocket,
    });

    client.connect();
    const mockWs = getOrThrow(MockClientWebSocket.instances[0]);
    mockWs.open();

    expect(mockWs.sentMessages).toHaveLength(0);

    vi.advanceTimersByTime(5000);
    expect(mockWs.sentMessages).toHaveLength(1);
    expect(JSON.parse(getOrThrow(mockWs.sentMessages[0]))).toEqual({ action: "ping" });

    vi.advanceTimersByTime(5000);
    expect(mockWs.sentMessages).toHaveLength(2);
  });

  it("reconnects with backoff and resyncs via invalidateQueries and resubscribes", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const client = useSentinelSocket({
      autoConnect: false,
      reconnectBaseMs: 500,
      reconnectMaxMs: 2000,
      queryClient,
      WebSocketClass: MockClientWebSocket as unknown as typeof WebSocket,
    });

    client.connect();
    const firstWs = getOrThrow(MockClientWebSocket.instances[0]);
    firstWs.open();

    const monitorId = "018f0000-0000-7000-8000-000000000002";
    client.subscribe(monitorId);
    client.subscribe(); // also subscribe all

    // Connection drops unexpectedly
    firstWs.triggerClose();
    expect(client.status.value).toBe("DISCONNECTED");

    // Advance timer to trigger backoff reconnect
    vi.advanceTimersByTime(500);

    expect(MockClientWebSocket.instances).toHaveLength(2);
    const secondWs = getOrThrow(MockClientWebSocket.instances[1]);

    // Reconnection socket opens
    secondWs.open();

    // While reconnecting, transitions to SYNCING and invalidateQueries is called
    expect(client.status.value).toBe("SYNCING");
    await vi.advanceTimersByTimeAsync(0);
    expect(invalidateSpy).toHaveBeenCalled();
    expect(client.status.value).toBe("LIVE");

    // Resubscribes automatically to previous active subscriptions
    const actions = secondWs.sentMessages.map((m) => JSON.parse(m));
    expect(actions).toContainEqual({ action: "subscribe" });
    expect(actions).toContainEqual({ action: "subscribe", monitorId });
  });

  it("does not reconnect if disconnect was called explicitly", () => {
    const client = useSentinelSocket({
      autoConnect: false,
      queryClient,
      WebSocketClass: MockClientWebSocket as unknown as typeof WebSocket,
    });

    client.connect();
    const ws = getOrThrow(MockClientWebSocket.instances[0]);
    ws.open();

    client.disconnect();
    expect(client.status.value).toBe("DISCONNECTED");

    vi.advanceTimersByTime(10000);
    expect(MockClientWebSocket.instances).toHaveLength(1);
  });

  it("triggers 500ms row flash and updates TanStack Query cache on CHECK_COMPLETED", () => {
    const monitorId = "018f0000-0000-7000-8000-000000000003";

    queryClient.setQueryData(
      ["monitors"],
      [{ id: monitorId, name: "Test API", status: "DOWN", lastDurationMs: null }],
    );

    const setQueriesDataSpy = vi.spyOn(queryClient, "setQueriesData");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const client = useSentinelSocket({
      autoConnect: false,
      flashDurationMs: 500,
      queryClient,
      WebSocketClass: MockClientWebSocket as unknown as typeof WebSocket,
    });

    client.connect();
    const ws = getOrThrow(MockClientWebSocket.instances[0]);
    ws.open();

    expect(client.isFlashing(monitorId)).toBe(false);

    ws.receiveMessage({
      event: "CHECK_COMPLETED",
      monitorId,
      status: "UP",
      durationMs: 78,
      executedAt: "2026-10-24T12:00:00.000Z",
    });

    // Flash is active
    expect(client.isFlashing(monitorId)).toBe(true);
    expect(setQueriesDataSpy).toHaveBeenCalledWith(
      { queryKey: ["monitors"] },
      expect.any(Function),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["checks", monitorId] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["metrics"] });

    // Updated monitor status in cache
    const updated = queryClient.getQueryData<
      Array<{ id: string; status: string; lastDurationMs: number }>
    >(["monitors"]);
    expect(updated?.[0]?.status).toBe("UP");
    expect(updated?.[0]?.lastDurationMs).toBe(78);

    // After 500ms flash turns off
    vi.advanceTimersByTime(500);
    expect(client.isFlashing(monitorId)).toBe(false);
  });

  it("triggers 500ms row flash and updates cache on INCIDENT_TRANSITION", () => {
    const monitorId = "018f0000-0000-7000-8000-000000000004";
    const incidentId = "018f0000-0000-7000-8000-000000000005";

    queryClient.setQueryData(
      ["monitors"],
      [{ id: monitorId, name: "Payment Service", status: "UP" }],
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const client = useSentinelSocket({
      autoConnect: false,
      flashDurationMs: 500,
      queryClient,
      WebSocketClass: MockClientWebSocket as unknown as typeof WebSocket,
    });

    client.connect();
    const ws = getOrThrow(MockClientWebSocket.instances[0]);
    ws.open();

    ws.receiveMessage({
      event: "INCIDENT_TRANSITION",
      monitorId,
      incidentId,
      type: "OPENED",
      healthStatus: "DOWN",
      timestamp: "2026-10-24T12:05:00.000Z",
    });

    expect(client.isFlashing(monitorId)).toBe(true);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["incidents"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["monitors"] });

    const updated = queryClient.getQueryData<Array<{ id: string; status: string }>>(["monitors"]);
    expect(updated?.[0]?.status).toBe("DOWN");

    vi.advanceTimersByTime(500);
    expect(client.isFlashing(monitorId)).toBe(false);
  });

  it("silently ignores invalid/malformed JSON without crashing", () => {
    const client = useSentinelSocket({
      autoConnect: false,
      queryClient,
      WebSocketClass: MockClientWebSocket as unknown as typeof WebSocket,
    });

    client.connect();
    const ws = getOrThrow(MockClientWebSocket.instances[0]);
    ws.open();

    expect(() => ws.receiveMessage("invalid-json")).not.toThrow();
    expect(() => ws.receiveMessage(JSON.stringify({ event: "UNKNOWN" }))).not.toThrow();
    expect(client.status.value).toBe("LIVE");
  });
});
