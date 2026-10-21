import type { PubSubPort } from "@sentinel/application";
import type pg from "pg";
import {
  closePgClient,
  closePgPool,
  createListenClient,
  createPgPool,
  type PgPoolConfig,
} from "../db/connection.js";

export const MAX_NOTIFY_PAYLOAD_BYTES = 7999;

const CHANNEL_NAME_REGEX = /^[a-zA-Z0-9_]+$/;

export interface PgListenNotifyAdapterOptions {
  pool?: pg.Pool;
  clientFactory?: () => pg.Client;
  connectionConfig?: PgPoolConfig;
  onReconnect?: () => void | Promise<void>;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

export class PgListenNotifyAdapter implements PubSubPort {
  private readonly pool: pg.Pool;
  private readonly ownsPool: boolean;
  private readonly clientFactory: () => pg.Client;
  private readonly initialReconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;

  private client: pg.Client | null = null;
  private isConnecting = false;
  private isClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private onReconnectCallback?: () => void | Promise<void>;

  private readonly subscriptions = new Map<string, Set<(payload: string) => void>>();

  constructor(options: PgListenNotifyAdapterOptions = {}) {
    if (options.pool) {
      this.pool = options.pool;
      this.ownsPool = false;
    } else {
      this.pool = createPgPool(options.connectionConfig);
      this.ownsPool = true;
    }

    const connectionConfig = options.connectionConfig;
    this.clientFactory = options.clientFactory ?? (() => createListenClient(connectionConfig));

    this.onReconnectCallback = options.onReconnect;
    this.initialReconnectDelayMs = options.initialReconnectDelayMs ?? 100;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 5000;
  }

  public setOnReconnect(callback: () => void | Promise<void>): void {
    this.onReconnectCallback = callback;
  }

  public async publish(channel: string, payload: string): Promise<void> {
    this.assertValidChannel(channel);

    const byteLength = Buffer.byteLength(payload, "utf8");
    if (byteLength > MAX_NOTIFY_PAYLOAD_BYTES) {
      throw new Error(
        `Payload size (${byteLength} bytes) exceeds PostgreSQL NOTIFY limit of ${MAX_NOTIFY_PAYLOAD_BYTES} bytes`,
      );
    }

    await this.pool.query("SELECT pg_notify($1, $2)", [channel, payload]);
  }

  public async subscribe(
    channel: string,
    handler: (payload: string) => void,
  ): Promise<() => Promise<void>> {
    this.assertValidChannel(channel);

    if (this.isClosed) {
      throw new Error("Cannot subscribe: PgListenNotifyAdapter is closed");
    }

    let handlers = this.subscriptions.get(channel);
    const isNewChannel = !handlers || handlers.size === 0;

    if (!handlers) {
      handlers = new Set();
      this.subscriptions.set(channel, handlers);
    }
    handlers.add(handler);

    await this.ensureConnected();

    if (isNewChannel && this.client) {
      await this.client.query(`LISTEN ${this.escapeChannel(channel)}`);
    }

    return async () => {
      const currentHandlers = this.subscriptions.get(channel);
      if (!currentHandlers) return;

      currentHandlers.delete(handler);
      if (currentHandlers.size === 0) {
        this.subscriptions.delete(channel);
        if (this.client && !this.isClosed) {
          try {
            await this.client.query(`UNLISTEN ${this.escapeChannel(channel)}`);
          } catch {
            // Ignore UNLISTEN errors during channel cleanup or disconnect
          }
        }
      }
    };
  }

  public async close(): Promise<void> {
    this.isClosed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.client) {
      const activeClient = this.client;
      this.client = null;
      try {
        activeClient.removeAllListeners();
        await closePgClient(activeClient);
      } catch {
        // Ignore client shutdown errors
      }
    }

    this.subscriptions.clear();

    if (this.ownsPool) {
      await closePgPool(this.pool);
    }
  }

  public isConnected(): boolean {
    return this.client !== null && !this.isClosed && !this.isConnecting;
  }

  public getActiveChannels(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  private async ensureConnected(): Promise<void> {
    if (this.client || this.isClosed) {
      return;
    }

    if (this.isConnecting) {
      while (this.isConnecting && !this.isClosed) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return;
    }

    await this.connect(false);
  }

  private async connect(isReconnect: boolean): Promise<void> {
    if (this.isClosed) return;
    this.isConnecting = true;

    try {
      const newClient = this.clientFactory();

      newClient.on("notification", (msg) => this.handleNotification(msg));
      newClient.on("error", (err) => this.handleClientError(err));
      newClient.on("end", () => this.handleClientDisconnect());

      await newClient.connect();

      this.client = newClient;
      this.reconnectAttempts = 0;
      this.isConnecting = false;

      // Re-subscribe all active channels on the new client
      for (const channel of this.subscriptions.keys()) {
        await newClient.query(`LISTEN ${this.escapeChannel(channel)}`);
      }

      if (isReconnect && this.onReconnectCallback) {
        try {
          await this.onReconnectCallback();
        } catch {
          // Prevent onReconnect hook errors from crashing the listener
        }
      }
    } catch {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private handleNotification(msg: pg.Notification): void {
    if (!msg.channel) return;
    const handlers = this.subscriptions.get(msg.channel);
    if (!handlers || handlers.size === 0) return;

    const payload = msg.payload ?? "";
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch {
        // Guard against handler errors killing listener thread
      }
    }
  }

  private handleClientError(_err: Error): void {
    this.scheduleReconnect();
  }

  private handleClientDisconnect(): void {
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.isClosed || this.reconnectTimer) return;

    if (this.client) {
      const oldClient = this.client;
      this.client = null;
      try {
        oldClient.removeAllListeners();
        oldClient.end().catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
    }

    const attempt = this.reconnectAttempts++;
    const baseDelay = Math.min(
      this.maxReconnectDelayMs,
      this.initialReconnectDelayMs * 2 ** attempt,
    );
    const jitter = Math.floor(Math.random() * 50);
    const delay = baseDelay + jitter;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connect(true);
    }, delay);
  }

  private assertValidChannel(channel: string): void {
    if (!channel || !CHANNEL_NAME_REGEX.test(channel)) {
      throw new Error(
        `Invalid PostgreSQL LISTEN/NOTIFY channel name '${channel}'. Must match ${CHANNEL_NAME_REGEX}.`,
      );
    }
  }

  private escapeChannel(channel: string): string {
    return `"${channel.replace(/"/g, '""')}"`;
  }
}
