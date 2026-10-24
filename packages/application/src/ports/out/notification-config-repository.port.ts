export interface TelegramConfigData {
  readonly id: string;
  readonly encryptedBotToken: string;
  readonly chatId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NotificationConfigRepositoryPort {
  getTelegramConfig(): Promise<TelegramConfigData | null>;
  saveTelegramConfig(config: TelegramConfigData, tx?: unknown): Promise<void>;
}
