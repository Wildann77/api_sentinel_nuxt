import {
  type WebSocketClientMessageDto,
  WebSocketClientMessageSchema,
  type WebSocketEventDto,
  type WebSocketPongEventDto,
} from "@sentinel/contracts";
import type { Peer } from "crossws";

export interface WsPeerContext {
  userId?: string;
  sessionToken?: string;
}

export class WsHub {
  private readonly peers = new Set<Peer>();
  private readonly peerTopics = new Map<Peer, Set<string>>();

  public registerPeer(peer: Peer): void {
    this.peers.add(peer);
    if (!this.peerTopics.has(peer)) {
      this.peerTopics.set(peer, new Set(["monitors:all"]));
    }
    // Also call crossws peer.subscribe if available
    try {
      peer.subscribe?.("monitors:all");
    } catch {
      // In mock/test environments subscribe might not be implemented
    }
  }

  public unregisterPeer(peer: Peer): void {
    this.peers.delete(peer);
    this.peerTopics.delete(peer);
  }

  public getConnectedPeerCount(): number {
    return this.peers.size;
  }

  public isSubscribed(peer: Peer, topic: string): boolean {
    const topics = this.peerTopics.get(peer);
    if (topics?.has(topic)) {
      return true;
    }
    return peer.topics?.has(topic) ?? false;
  }

  public subscribePeer(peer: Peer, topic: string): void {
    let topics = this.peerTopics.get(peer);
    if (!topics) {
      topics = new Set();
      this.peerTopics.set(peer, topics);
    }
    topics.add(topic);
    try {
      peer.subscribe?.(topic);
    } catch {
      // Fallback in test doubles
    }
  }

  public unsubscribePeer(peer: Peer, topic: string): void {
    const topics = this.peerTopics.get(peer);
    if (topics) {
      topics.delete(topic);
    }
    try {
      peer.unsubscribe?.(topic);
    } catch {
      // Fallback in test doubles
    }
  }

  public handleClientMessage(peer: Peer, rawMessage: unknown): void {
    let parsed: unknown = rawMessage;

    if (typeof rawMessage === "string") {
      try {
        parsed = JSON.parse(rawMessage);
      } catch {
        return;
      }
    } else if (
      rawMessage &&
      typeof rawMessage === "object" &&
      "text" in rawMessage &&
      typeof (rawMessage as { text: () => string }).text === "function"
    ) {
      try {
        parsed = JSON.parse((rawMessage as { text: () => string }).text());
      } catch {
        return;
      }
    }

    const validation = WebSocketClientMessageSchema.safeParse(parsed);
    if (!validation.success) {
      return;
    }

    const msg: WebSocketClientMessageDto = validation.data;

    switch (msg.action) {
      case "ping": {
        const pong: WebSocketPongEventDto = {
          event: "pong",
          timestamp: new Date().toISOString(),
        };
        this.safeSend(peer, JSON.stringify(pong));
        break;
      }
      case "subscribe": {
        if (msg.monitorId) {
          this.subscribePeer(peer, `monitor:${msg.monitorId}`);
        } else {
          this.subscribePeer(peer, "monitors:all");
        }
        break;
      }
      case "unsubscribe": {
        if (msg.monitorId) {
          this.unsubscribePeer(peer, `monitor:${msg.monitorId}`);
        } else {
          this.unsubscribePeer(peer, "monitors:all");
        }
        break;
      }
    }
  }

  public broadcastEvent(event: WebSocketEventDto): void {
    const payload = JSON.stringify(event);
    const targetTopic = `monitor:${event.monitorId}`;
    const deadPeers: Peer[] = [];

    for (const peer of this.peers) {
      const hasAll = this.isSubscribed(peer, "monitors:all");
      const hasSpecific = this.isSubscribed(peer, targetTopic);

      if (hasAll || hasSpecific) {
        try {
          peer.send(payload);
        } catch {
          deadPeers.push(peer);
        }
      }
    }

    for (const deadPeer of deadPeers) {
      this.unregisterPeer(deadPeer);
    }
  }

  public broadcastToTopic(topic: string, data: unknown): void {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    const deadPeers: Peer[] = [];

    for (const peer of this.peers) {
      if (this.isSubscribed(peer, topic)) {
        try {
          peer.send(payload);
        } catch {
          deadPeers.push(peer);
        }
      }
    }

    for (const deadPeer of deadPeers) {
      this.unregisterPeer(deadPeer);
    }
  }

  public clear(): void {
    this.peers.clear();
    this.peerTopics.clear();
  }

  private safeSend(peer: Peer, data: string): void {
    try {
      peer.send(data);
    } catch {
      this.unregisterPeer(peer);
    }
  }
}

let wsHubInstance: WsHub | null = null;

export function getWsHub(): WsHub {
  if (!wsHubInstance) {
    wsHubInstance = new WsHub();
  }
  return wsHubInstance;
}

export function resetWsHub(): void {
  if (wsHubInstance) {
    wsHubInstance.clear();
    wsHubInstance = null;
  }
}
