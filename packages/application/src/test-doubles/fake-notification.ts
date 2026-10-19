import type { NotificationPort, NotificationSendResult } from "../ports/out/notification.port.js";

export interface SentTelegramMessage {
  readonly botToken: string;
  readonly chatId: string;
  readonly messageMarkdownV2: string;
  readonly sentAt: Date;
}

export class FakeNotification implements NotificationPort {
  public sentMessages: SentTelegramMessage[] = [];
  public defaultResult: NotificationSendResult = { success: true };
  private queuedResults: NotificationSendResult[] = [];

  public async sendTelegram(
    botToken: string,
    chatId: string,
    messageMarkdownV2: string,
  ): Promise<NotificationSendResult> {
    this.sentMessages.push({
      botToken,
      chatId,
      messageMarkdownV2,
      sentAt: new Date(),
    });

    const next = this.queuedResults.shift();
    return next ?? this.defaultResult;
  }

  public queueResult(result: NotificationSendResult): void {
    this.queuedResults.push(result);
  }

  public formatIncidentMessage(payload: {
    readonly monitorName: string;
    readonly type: "OPENED" | "RECOVERED";
    readonly cause: string;
    readonly openedAt: Date;
    readonly recoveredAt?: Date | null;
    readonly durationSeconds?: number | null;
  }): string {
    return `[${payload.type}] ${payload.monitorName}: ${payload.cause}`;
  }

  public clear(): void {
    this.sentMessages = [];
    this.queuedResults = [];
    this.defaultResult = { success: true };
  }
}
