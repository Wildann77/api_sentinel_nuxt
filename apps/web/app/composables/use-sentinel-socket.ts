import { type WebSocketClientMessageDto, WebSocketServerMessageSchema } from "@sentinel/contracts";
import { type QueryClient, useQueryClient } from "@tanstack/vue-query";
import { getCurrentInstance, onMounted, onUnmounted, type Ref, ref } from "vue";

export type SocketStatus = "LIVE" | "SYNCING" | "DISCONNECTED";

export interface UseSentinelSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  flashDurationMs?: number;
  pingIntervalMs?: number;
  queryClient?: QueryClient;
  WebSocketClass?: typeof WebSocket;
}

export interface UseSentinelSocketReturn {
  status: Ref<SocketStatus>;
  isFlashing: (monitorId: string) => boolean;
  flashingMonitors: Ref<Set<string>>;
  subscribe: (monitorId?: string) => void;
  unsubscribe: (monitorId?: string) => void;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  socket: Ref<WebSocket | null>;
}

export function useSentinelSocket(options: UseSentinelSocketOptions = {}): UseSentinelSocketReturn {
  const status = ref<SocketStatus>("DISCONNECTED");
  const flashingMonitors = ref<Set<string>>(new Set<string>());
  const socketRef = ref<WebSocket | null>(null);

  const flashTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const subscribedMonitors = new Set<string>();
  let isSubscribedToAll = false;

  let ws: WebSocket | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let isExplicitlyClosed = false;

  const reconnectBaseMs = options.reconnectBaseMs ?? 1000;
  const reconnectMaxMs = options.reconnectMaxMs ?? 30000;
  const flashDurationMs = options.flashDurationMs ?? 500;
  const pingIntervalMs = options.pingIntervalMs ?? 30000;

  let resolvedQueryClient: QueryClient | undefined = options.queryClient;
  if (!resolvedQueryClient) {
    try {
      resolvedQueryClient = useQueryClient();
    } catch {
      resolvedQueryClient = undefined;
    }
  }

  function resolveWsUrl(): string {
    if (options.url) return options.url;
    if (typeof window !== "undefined" && window.location) {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${window.location.host}/api/ws`;
    }
    return "ws://localhost:3000/api/ws";
  }

  function triggerFlash(monitorId: string): void {
    const existing = flashTimers.get(monitorId);
    if (existing) {
      clearTimeout(existing);
    }

    const next = new Set(flashingMonitors.value);
    next.add(monitorId);
    flashingMonitors.value = next;

    const timer = setTimeout(() => {
      const s = new Set(flashingMonitors.value);
      s.delete(monitorId);
      flashingMonitors.value = s;
      flashTimers.delete(monitorId);
    }, flashDurationMs);

    flashTimers.set(monitorId, timer);
  }

  function isFlashing(monitorId: string): boolean {
    return flashingMonitors.value.has(monitorId);
  }

  function sendJson(msg: WebSocketClientMessageDto): void {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  function resubscribeAll(): void {
    if (isSubscribedToAll) {
      sendJson({ action: "subscribe" });
    }
    for (const monitorId of subscribedMonitors) {
      sendJson({ action: "subscribe", monitorId });
    }
  }

  function startPing(): void {
    stopPing();
    pingTimer = setInterval(() => {
      sendJson({ action: "ping" });
    }, pingIntervalMs);
  }

  function stopPing(): void {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function calculateBackoff(attempt: number): number {
    const exp = Math.min(reconnectMaxMs, reconnectBaseMs * 2 ** attempt);
    return Math.min(reconnectMaxMs, Math.round(exp));
  }

  function scheduleReconnect(): void {
    if (isExplicitlyClosed) return;
    if (reconnectTimer) return;

    status.value = "DISCONNECTED";
    const delay = calculateBackoff(reconnectAttempt);
    reconnectAttempt++;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
  }

  function handleServerMessage(rawData: unknown): void {
    let parsedJson: unknown = rawData;
    if (typeof rawData === "string") {
      try {
        parsedJson = JSON.parse(rawData);
      } catch {
        return;
      }
    }

    const parsed = WebSocketServerMessageSchema.safeParse(parsedJson);
    if (!parsed.success) return;

    const msg = parsed.data;

    if (msg.event === "CHECK_COMPLETED") {
      triggerFlash(msg.monitorId);

      if (resolvedQueryClient) {
        resolvedQueryClient.setQueriesData({ queryKey: ["monitors"] }, (old: unknown) => {
          if (!Array.isArray(old)) return old;
          return old.map((m: unknown) => {
            if (m && typeof m === "object" && "id" in m && m.id === msg.monitorId) {
              return {
                ...m,
                status: msg.status,
                lastCheckedAt: msg.executedAt,
                lastDurationMs: msg.durationMs,
              };
            }
            return m;
          });
        });
        void resolvedQueryClient.invalidateQueries({ queryKey: ["checks", msg.monitorId] });
        void resolvedQueryClient.invalidateQueries({ queryKey: ["metrics"] });
      }
    } else if (msg.event === "INCIDENT_TRANSITION") {
      triggerFlash(msg.monitorId);

      if (resolvedQueryClient) {
        resolvedQueryClient.setQueriesData({ queryKey: ["monitors"] }, (old: unknown) => {
          if (!Array.isArray(old)) return old;
          return old.map((m: unknown) => {
            if (m && typeof m === "object" && "id" in m && m.id === msg.monitorId) {
              return {
                ...m,
                status: msg.healthStatus,
              };
            }
            return m;
          });
        });
        void resolvedQueryClient.invalidateQueries({ queryKey: ["incidents"] });
        void resolvedQueryClient.invalidateQueries({ queryKey: ["monitors"] });
        void resolvedQueryClient.invalidateQueries({ queryKey: ["metrics"] });
      }
    }
  }

  function openSocket(): void {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) {
      return;
    }

    const WsCtor = options.WebSocketClass ?? (typeof WebSocket !== "undefined" ? WebSocket : null);
    if (!WsCtor) {
      status.value = "DISCONNECTED";
      return;
    }

    const url = resolveWsUrl();
    try {
      ws = new WsCtor(url);
    } catch {
      scheduleReconnect();
      return;
    }

    socketRef.value = ws;

    ws.onopen = async () => {
      const isReconnection = reconnectAttempt > 0;
      reconnectAttempt = 0;

      if (isReconnection) {
        status.value = "SYNCING";
        resubscribeAll();

        if (resolvedQueryClient) {
          try {
            await resolvedQueryClient.invalidateQueries({ refetchType: "all" });
          } catch {
            // Keep resilient
          }
        }
        status.value = "LIVE";
      } else {
        resubscribeAll();
        status.value = "LIVE";
      }

      startPing();
    };

    ws.onmessage = (event: MessageEvent) => {
      handleServerMessage(event.data);
    };

    ws.onclose = () => {
      stopPing();
      ws = null;
      socketRef.value = null;
      if (!isExplicitlyClosed) {
        scheduleReconnect();
      } else {
        status.value = "DISCONNECTED";
      }
    };

    ws.onerror = () => {
      stopPing();
      if (ws) {
        try {
          ws.close();
        } catch {
          // Ignore
        }
      }
    };
  }

  function connect(): void {
    isExplicitlyClosed = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    openSocket();
  }

  function disconnect(): void {
    isExplicitlyClosed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    stopPing();
    for (const timer of flashTimers.values()) {
      clearTimeout(timer);
    }
    flashTimers.clear();
    flashingMonitors.value = new Set();

    if (ws) {
      try {
        ws.close();
      } catch {
        // Ignore
      }
      ws = null;
      socketRef.value = null;
    }
    status.value = "DISCONNECTED";
  }

  function reconnect(): void {
    disconnect();
    reconnectAttempt = 1;
    connect();
  }

  function subscribe(monitorId?: string): void {
    if (monitorId) {
      subscribedMonitors.add(monitorId);
      sendJson({ action: "subscribe", monitorId });
    } else {
      isSubscribedToAll = true;
      sendJson({ action: "subscribe" });
    }
  }

  function unsubscribe(monitorId?: string): void {
    if (monitorId) {
      subscribedMonitors.delete(monitorId);
      sendJson({ action: "unsubscribe", monitorId });
    } else {
      isSubscribedToAll = false;
      sendJson({ action: "unsubscribe" });
    }
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      if (options.autoConnect !== false) {
        connect();
      }
    });
    onUnmounted(() => {
      disconnect();
    });
  }

  return {
    status,
    isFlashing,
    flashingMonitors,
    subscribe,
    unsubscribe,
    connect,
    disconnect,
    reconnect,
    socket: socketRef,
  };
}
