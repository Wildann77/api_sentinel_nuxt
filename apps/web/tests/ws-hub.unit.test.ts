import type { CheckCompletedEventDto, IncidentTransitionEventDto } from "@sentinel/domain";
import type { Peer } from "crossws";
import { beforeEach, describe, expect, it } from "vitest";
import { processSentinelEventPayload } from "../server/plugins/sentinel-events.js";
import { getWsHub, resetWsHub, type WsHub } from "../server/utils/ws-hub.js";

let counter = 1;
function nextId(): string {
  const pad = String(counter++).padStart(12, "0");
  return `018f0000-0000-7000-8000-${pad}`;
}

class MockPeer implements Partial<Peer> {
  public id: string;
  public topics = new Set<string>();
  public sentMessages: string[] = [];
  public shouldThrowOnSend = false;

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
    if (this.shouldThrowOnSend) {
      throw new Error("Socket broken connection");
    }
    this.sentMessages.push(typeof data === "string" ? data : JSON.stringify(data));
  }
}

describe("P12.2 — WsHub and Real-time Broadcasting Unit Tests", () => {
  let wsHub: WsHub;

  beforeEach(() => {
    resetWsHub();
    wsHub = getWsHub();
  });

  it("registers peer with default monitors:all topic", () => {
    const peer = new MockPeer("p-1") as unknown as Peer;
    wsHub.registerPeer(peer);

    expect(wsHub.getConnectedPeerCount()).toBe(1);
    expect(wsHub.isSubscribed(peer, "monitors:all")).toBe(true);
  });

  it("unregisters peer on disconnect", () => {
    const peer = new MockPeer("p-1") as unknown as Peer;
    wsHub.registerPeer(peer);
    expect(wsHub.getConnectedPeerCount()).toBe(1);

    wsHub.unregisterPeer(peer);
    expect(wsHub.getConnectedPeerCount()).toBe(0);
  });

  it("handles ping action and replies with pong", () => {
    const mock = new MockPeer("p-1");
    const peer = mock as unknown as Peer;
    wsHub.registerPeer(peer);

    wsHub.handleClientMessage(peer, JSON.stringify({ action: "ping" }));

    expect(mock.sentMessages).toHaveLength(1);
    const reply = JSON.parse(mock.sentMessages[0] ?? "{}");
    expect(reply.event).toBe("pong");
    expect(reply.timestamp).toBeDefined();
  });

  it("handles subscribe and unsubscribe to specific monitor topic", () => {
    const mock = new MockPeer("p-1");
    const peer = mock as unknown as Peer;
    wsHub.registerPeer(peer);

    const monitorId = nextId();

    wsHub.handleClientMessage(peer, JSON.stringify({ action: "subscribe", monitorId }));
    expect(wsHub.isSubscribed(peer, `monitor:${monitorId}`)).toBe(true);

    wsHub.handleClientMessage(peer, JSON.stringify({ action: "unsubscribe", monitorId }));
    expect(wsHub.isSubscribed(peer, `monitor:${monitorId}`)).toBe(false);
  });

  it("broadcasts event to peers subscribed to monitors:all and specific monitor without duplicate sends", () => {
    const mockAll = new MockPeer("p-all");
    const mockSpecific1 = new MockPeer("p-m1");
    const mockSpecific2 = new MockPeer("p-m2");

    const peerAll = mockAll as unknown as Peer;
    const peer1 = mockSpecific1 as unknown as Peer;
    const peer2 = mockSpecific2 as unknown as Peer;

    wsHub.registerPeer(peerAll); // Subscribed to monitors:all by default
    wsHub.registerPeer(peer1);
    wsHub.registerPeer(peer2);

    const monitor1Id = nextId();
    const monitor2Id = nextId();

    // peer1 only wants monitor1Id (unsub from all)
    wsHub.unsubscribePeer(peer1, "monitors:all");
    wsHub.subscribePeer(peer1, `monitor:${monitor1Id}`);

    // peer2 only wants monitor2Id (unsub from all)
    wsHub.unsubscribePeer(peer2, "monitors:all");
    wsHub.subscribePeer(peer2, `monitor:${monitor2Id}`);

    const event1: CheckCompletedEventDto = {
      event: "CHECK_COMPLETED",
      monitorId: monitor1Id,
      status: "UP",
      durationMs: 45,
      executedAt: new Date().toISOString(),
    };

    wsHub.broadcastEvent(event1);

    expect(mockAll.sentMessages).toHaveLength(1);
    expect(JSON.parse(mockAll.sentMessages[0] ?? "{}").monitorId).toBe(monitor1Id);

    expect(mockSpecific1.sentMessages).toHaveLength(1);
    expect(JSON.parse(mockSpecific1.sentMessages[0] ?? "{}").monitorId).toBe(monitor1Id);

    expect(mockSpecific2.sentMessages).toHaveLength(0); // Not subscribed to monitor1
  });

  it("broadcasts incident transition events correctly", () => {
    const mock = new MockPeer("p-1");
    const peer = mock as unknown as Peer;
    wsHub.registerPeer(peer);

    const monitorId = nextId();
    const incidentId = nextId();

    const transition: IncidentTransitionEventDto = {
      event: "INCIDENT_TRANSITION",
      monitorId,
      incidentId,
      type: "OPENED",
      healthStatus: "DOWN",
      timestamp: new Date().toISOString(),
    };

    wsHub.broadcastEvent(transition);

    expect(mock.sentMessages).toHaveLength(1);
    const parsed = JSON.parse(mock.sentMessages[0] ?? "{}");
    expect(parsed.event).toBe("INCIDENT_TRANSITION");
    expect(parsed.type).toBe("OPENED");
    expect(parsed.healthStatus).toBe("DOWN");
  });

  it("safely prunes dead peers on send failure", () => {
    const mockDead = new MockPeer("p-dead");
    mockDead.shouldThrowOnSend = true;
    const deadPeer = mockDead as unknown as Peer;

    const mockAlive = new MockPeer("p-alive");
    const alivePeer = mockAlive as unknown as Peer;

    wsHub.registerPeer(deadPeer);
    wsHub.registerPeer(alivePeer);
    expect(wsHub.getConnectedPeerCount()).toBe(2);

    wsHub.broadcastEvent({
      event: "CHECK_COMPLETED",
      monitorId: nextId(),
      status: "UP",
      durationMs: 10,
      executedAt: new Date().toISOString(),
    });

    expect(wsHub.getConnectedPeerCount()).toBe(1);
    expect(mockAlive.sentMessages).toHaveLength(1);
  });

  it("processSentinelEventPayload validates and broadcasts or ignores malformed payload", () => {
    const mock = new MockPeer("p-1");
    const peer = mock as unknown as Peer;
    wsHub.registerPeer(peer);

    // Malformed JSON
    expect(processSentinelEventPayload("not-json", wsHub)).toBe(false);
    expect(mock.sentMessages).toHaveLength(0);

    // Invalid schema
    expect(processSentinelEventPayload(JSON.stringify({ event: "UNKNOWN" }), wsHub)).toBe(false);
    expect(mock.sentMessages).toHaveLength(0);

    // Valid check completed
    const valid = {
      event: "CHECK_COMPLETED",
      monitorId: nextId(),
      status: "UP",
      durationMs: 33,
      executedAt: new Date().toISOString(),
    };
    expect(processSentinelEventPayload(JSON.stringify(valid), wsHub)).toBe(true);
    expect(mock.sentMessages).toHaveLength(1);
  });
});
