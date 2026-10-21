import type {
  NotificationConfigRepositoryPort,
  TelegramConfigData,
} from "../ports/out/notification-config-repository.port.js";

export class InMemoryNotificationConfigRepository implements NotificationConfigRepositoryPort {
  private config: TelegramConfigData | null = null;

  public async getTelegramConfig(): Promise<TelegramConfigData | null> {
    return this.config ? { ...this.config } : null;
  }

  public async saveTelegramConfig(config: TelegramConfigData, _tx?: unknown): Promise<void> {
    this.config = { ...config };
  }

  public clear(): void {
    this.config = null;
  }
}
