export interface PubSubPort {
  publish(channel: string, payload: string): Promise<void>;
  subscribe(channel: string, handler: (payload: string) => void): Promise<() => Promise<void>>;
}
