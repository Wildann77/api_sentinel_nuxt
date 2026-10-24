export interface NotificationSendResult {
  readonly success: boolean;
  readonly retryAfterSeconds?: number;
  readonly error?: string;
}

export interface NotificationPort {
  sendTelegram(
    botToken: string,
    chatId: string,
    messageMarkdownV2: string,
  ): Promise<NotificationSendResult>;
}
