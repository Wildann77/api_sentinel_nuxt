import type {
  IncidentNotificationPayload,
  NotificationPort,
  NotificationSendResult,
} from "@sentinel/application";
import { withSpan } from "../telemetry/otel-tracer.js";
import {
  formatIncidentOpenedMessage,
  formatIncidentRecoveredMessage,
} from "./telegram-message.formatter.js";

export interface TelegramBotAdapterOptions {
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
}

export class TelegramBotNotificationAdapter implements NotificationPort {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: TelegramBotAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://api.telegram.org").replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  public formatIncidentMessage(payload: IncidentNotificationPayload): string {
    if (payload.type === "OPENED") {
      return formatIncidentOpenedMessage({
        monitorName: payload.monitorName,
        cause: payload.cause,
        openedAt: payload.openedAt,
      });
    }

    return formatIncidentRecoveredMessage({
      monitorName: payload.monitorName,
      openedAt: payload.openedAt,
      recoveredAt: payload.recoveredAt ?? new Date(),
      durationSeconds: payload.durationSeconds,
    });
  }

  public async sendTelegram(
    botToken: string,
    chatId: string,
    messageMarkdownV2: string,
  ): Promise<NotificationSendResult> {
    return await withSpan(
      "notification.telegram_send",
      {
        attributes: { "telegram.chat_id": chatId },
      },
      async () => {
        const url = `${this.baseUrl}/bot${botToken}/sendMessage`;

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: messageMarkdownV2,
              parse_mode: "MarkdownV2",
            }),
            signal: AbortSignal.timeout(this.timeoutMs),
          });

          if (response.ok) {
            return { success: true };
          }

          const body = (await response.json().catch(() => null)) as {
            parameters?: { retry_after?: number };
            description?: string;
          } | null;

          if (response.status === 429) {
            const retryHeader = response.headers.get("retry-after");
            const retryAfterParam = body?.parameters?.retry_after;
            const parsedHeader = retryHeader ? Number.parseInt(retryHeader, 10) : Number.NaN;
            const retryAfterSeconds =
              typeof retryAfterParam === "number"
                ? retryAfterParam
                : !Number.isNaN(parsedHeader)
                  ? parsedHeader
                  : 10;

            return {
              success: false,
              retryAfterSeconds,
              error: "Telegram API 429: Too Many Requests",
            };
          }

          const rawDescription = body?.description ?? `HTTP ${response.status}`;
          const safeDescription = this.sanitizeError(rawDescription, botToken);

          return {
            success: false,
            error: `Telegram API error (${response.status}): ${safeDescription}`,
          };
        } catch (err) {
          const rawMessage = err instanceof Error ? err.message : String(err);
          const safeMessage = this.sanitizeError(rawMessage, botToken);

          return {
            success: false,
            error: `Telegram delivery error: ${safeMessage}`,
          };
        }
      },
    );
  }

  private sanitizeError(message: string, botToken: string): string {
    return message
      .replaceAll(botToken, "[REDACTED]")
      .replace(/(?:^|\/|\b)bot\d+:[A-Za-z0-9_-]+/g, "bot[REDACTED]");
  }
}
