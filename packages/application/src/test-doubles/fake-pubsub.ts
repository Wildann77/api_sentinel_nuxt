import type { PubSubPort } from "../ports/out/pubsub.port.js";

export class FakePubSub implements PubSubPort {
  private handlers = new Map<string, Set<(payload: string) => void>>();
  public publishedMessages: Array<{ channel: string; payload: string; timestamp: Date }> = [];

  public async publish(channel: string, payload: string): Promise<void> {
    this.publishedMessages.push({ channel, payload, timestamp: new Date() });
    const channelHandlers = this.handlers.get(channel);
    if (channelHandlers) {
      for (const handler of channelHandlers) {
        handler(payload);
      }
    }
  }

  public async subscribe(
    channel: string,
    handler: (payload: string) => void,
  ): Promise<() => Promise<void>> {
    let channelHandlers = this.handlers.get(channel);
    if (!channelHandlers) {
      channelHandlers = new Set();
      this.handlers.set(channel, channelHandlers);
    }
    channelHandlers.add(handler);

    return async () => {
      const current = this.handlers.get(channel);
      if (current) {
        current.delete(handler);
        if (current.size === 0) {
          this.handlers.delete(channel);
        }
      }
    };
  }

  public clear(): void {
    this.handlers.clear();
    this.publishedMessages = [];
  }
}
