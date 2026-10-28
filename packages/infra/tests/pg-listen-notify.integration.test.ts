import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePgPool, createPgPool } from "../src/db/connection.js";
import {
  MAX_NOTIFY_PAYLOAD_BYTES,
  PgListenNotifyAdapter,
} from "../src/pubsub/pg-listen-notify.adapter.js";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel_dev";

describe("P5.6 — PgListenNotifyAdapter Integration Test", () => {
  let pool: ReturnType<typeof createPgPool>;

  beforeAll(() => {
    pool = createPgPool({
      connectionString: TEST_DB_URL,
      applicationName: "sentinel_pubsub_test_pool",
      max: 5,
    });
  });

  afterAll(async () => {
    await closePgPool(pool);
  });

  it("publishes and receives events on subscribed channel", async () => {
    const adapter = new PgListenNotifyAdapter({
      pool,
      connectionConfig: {
        connectionString: TEST_DB_URL,
        applicationName: "sentinel_pubsub_sub_1",
      },
    });

    const received: string[] = [];
    const unsubscribe = await adapter.subscribe("sentinel_events", (payload) => {
      received.push(payload);
    });

    const message = JSON.stringify({
      type: "CHECK_COMPLETED",
      monitorId: "mon-123",
      status: "UP",
    });

    // Small delay to ensure subscription is active in Postgres
    await new Promise((r) => setTimeout(r, 50));

    await adapter.publish("sentinel_events", message);

    // Wait for event to arrive
    for (let i = 0; i < 20; i++) {
      if (received.length > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(received).toEqual([message]);

    await unsubscribe();
    await adapter.close();
  });

  it("validates channel names and payload byte limit (< 8000 bytes)", async () => {
    const adapter = new PgListenNotifyAdapter({
      pool,
      connectionConfig: { connectionString: TEST_DB_URL },
    });

    // Reject invalid channel names
    await expect(adapter.publish("invalid channel with spaces", "payload")).rejects.toThrow(
      /Invalid PostgreSQL LISTEN\/NOTIFY channel name/,
    );
    await expect(adapter.subscribe("invalid;drop table", () => {})).rejects.toThrow(
      /Invalid PostgreSQL LISTEN\/NOTIFY channel name/,
    );

    // Valid payload <= 8000 bytes
    const validPayload = "a".repeat(MAX_NOTIFY_PAYLOAD_BYTES);
    await expect(adapter.publish("sentinel_events", validPayload)).resolves.toBeUndefined();

    // Oversized payload > 8000 bytes (or >= 8000 bytes)
    const oversizedPayload = "a".repeat(MAX_NOTIFY_PAYLOAD_BYTES + 1);
    await expect(adapter.publish("sentinel_events", oversizedPayload)).rejects.toThrow(
      /exceeds PostgreSQL NOTIFY limit/,
    );

    await adapter.close();
  });

  it("handles multiple channels and clean unsubscriptions", async () => {
    const adapter = new PgListenNotifyAdapter({
      pool,
      connectionConfig: {
        connectionString: TEST_DB_URL,
        applicationName: "sentinel_pubsub_multichannel",
      },
    });

    const channelAMsgs: string[] = [];
    const channelBMsgs: string[] = [];

    const unsubA1 = await adapter.subscribe("channel_a", (msg) => channelAMsgs.push(`1:${msg}`));
    const unsubA2 = await adapter.subscribe("channel_a", (msg) => channelAMsgs.push(`2:${msg}`));
    const unsubB = await adapter.subscribe("channel_b", (msg) => channelBMsgs.push(msg));

    await new Promise((r) => setTimeout(r, 50));

    await adapter.publish("channel_a", "msg-a");
    await adapter.publish("channel_b", "msg-b");

    for (let i = 0; i < 20; i++) {
      if (channelAMsgs.length === 2 && channelBMsgs.length === 1) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(channelAMsgs).toContain("1:msg-a");
    expect(channelAMsgs).toContain("2:msg-a");
    expect(channelBMsgs).toEqual(["msg-b"]);

    // Unsubscribe A1
    await unsubA1();
    channelAMsgs.length = 0;

    await adapter.publish("channel_a", "msg-a-2");
    for (let i = 0; i < 20; i++) {
      if (channelAMsgs.length > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(channelAMsgs).toEqual(["2:msg-a-2"]);

    await unsubA2();
    await unsubB();
    await adapter.close();
  });

  it("reconnects when connection dropped, triggers onReconnect callback, and recovers subscriptions", async () => {
    let reconnectCalled = false;
    const testAppName = `sentinel_listener_reconnect_${Date.now()}`;

    const adapter = new PgListenNotifyAdapter({
      pool,
      connectionConfig: {
        connectionString: TEST_DB_URL,
        applicationName: testAppName,
      },
      initialReconnectDelayMs: 50,
      maxReconnectDelayMs: 200,
      onReconnect: () => {
        reconnectCalled = true;
      },
    });

    const received: string[] = [];
    await adapter.subscribe("sentinel_events", (payload) => {
      received.push(payload);
    });

    await new Promise((r) => setTimeout(r, 100));

    // Force terminate the subscriber backend connection from Postgres server
    await pool.query(
      `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE application_name = $1
        AND pid <> pg_backend_pid();
      `,
      [testAppName],
    );

    // Wait for reconnection and onReconnect hook
    for (let i = 0; i < 40; i++) {
      if (reconnectCalled && adapter.isConnected()) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(reconnectCalled).toBe(true);
    expect(adapter.isConnected()).toBe(true);

    // Verify subscriber is still receiving messages on sentinel_events without re-subscribing
    const postReconnectMsg = JSON.stringify({ type: "POST_RECONNECT_EVENT" });
    await adapter.publish("sentinel_events", postReconnectMsg);

    for (let i = 0; i < 20; i++) {
      if (received.includes(postReconnectMsg)) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(received).toContain(postReconnectMsg);

    await adapter.close();
  });

  it("validates channel names and protects against failing message handlers", async () => {
    const adapter = new PgListenNotifyAdapter({
      pool,
      connectionConfig: { connectionString: TEST_DB_URL },
    });

    // Invalid channel name throws
    await expect(adapter.subscribe("invalid channel!", () => {})).rejects.toThrow(
      /Invalid PostgreSQL LISTEN\/NOTIFY channel name/,
    );
    await expect(adapter.publish("invalid channel!", "data")).rejects.toThrow(
      /Invalid PostgreSQL LISTEN\/NOTIFY channel name/,
    );

    // Handler throwing does not crash listener
    let normalHandlerCalled = false;
    await adapter.subscribe("guard_test_channel", () => {
      throw new Error("Deliberate handler explosion");
    });
    await adapter.subscribe("guard_test_channel", () => {
      normalHandlerCalled = true;
    });

    await adapter.publish("guard_test_channel", "ping");

    for (let i = 0; i < 20; i++) {
      if (normalHandlerCalled) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(normalHandlerCalled).toBe(true);

    // Double close is safe & idempotent
    await adapter.close();
    await adapter.close();
  });
});
