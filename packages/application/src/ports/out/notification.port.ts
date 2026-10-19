export interface NotificationSendResult {
  readonly success: boolean;
  readonly retryAfterSeconds?: number;
  readonly error?: string;
}

export interface IncidentNotificationPayload {
  readonly monitorName: string;
  readonly type: "OPENED" | "RECOVERED";
  readonly cause: string;
  readonly openedAt: Date;
  readonly recoveredAt?: Date | null;
  readonly durationSeconds?: number | null;
}

export interface NotificationPort {
  sendTelegram(
    botToken: string,
    chatId: string,
    messageMarkdownV2: string,
  ): Promise<NotificationSendResult>;
  formatIncidentMessage(payload: IncidentNotificationPayload): string;
}
