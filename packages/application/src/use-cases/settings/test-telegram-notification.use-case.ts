import {
  type TestTelegramNotificationRequestDto,
  TestTelegramNotificationRequestSchema,
} from "@sentinel/contracts";
import { ValidationException } from "@sentinel/domain";
import type {
  TestTelegramNotificationCommand,
  TestTelegramNotificationResult,
  TestTelegramNotificationUseCase,
} from "../../ports/in/settings.use-cases.js";
import {
  type CipherPort,
  formatNotificationConfigAad,
  type LoggerPort,
  type NotificationConfigRepositoryPort,
  type NotificationPort,
} from "../../ports/out/index.js";

export type TestTelegramNotificationInput =
  | TestTelegramNotificationCommand
  | TestTelegramNotificationRequestDto;

export class TestTelegramNotification implements TestTelegramNotificationUseCase {
  constructor(
    private readonly notificationConfigRepo: NotificationConfigRepositoryPort,
    private readonly notificationPort: NotificationPort,
    private readonly cipher: CipherPort,
    private readonly logger: LoggerPort,
  ) {}

  public async execute(
    command: TestTelegramNotificationInput,
  ): Promise<TestTelegramNotificationResult> {
    const rawInput = "request" in command && command.request ? command.request : command;
    const parseResult = TestTelegramNotificationRequestSchema.safeParse(rawInput);

    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      throw new ValidationException(
        issues[0]?.message ?? "Parameter tes notifikasi Telegram tidak valid.",
        issues.map((i) => ({
          name: i.path.join("."),
          reason: i.message,
        })),
      );
    }

    const { botToken: inputToken, chatId: inputChatId } = parseResult.data;

    let targetToken = inputToken;
    let targetChatId = inputChatId;

    if (!targetToken || !targetChatId) {
      const storedConfig = await this.notificationConfigRepo.getTelegramConfig();
      if (!storedConfig) {
        throw new ValidationException(
          "Konfigurasi Telegram belum tersimpan atau parameter botToken/chatId tidak lengkap.",
        );
      }

      if (!targetChatId) {
        targetChatId = storedConfig.chatId;
      }

      if (!targetToken) {
        const aad = formatNotificationConfigAad(storedConfig.id, "botToken");
        targetToken = await this.cipher.decrypt(storedConfig.encryptedBotToken, aad);
      }
    }

    const testMessage =
      "🔔 *API Sentinel — Tes Notifikasi Telegram*\n\n" +
      "Koneksi berhasil disiapkan\\! Sistem siap mengirim peringatan insiden\\.";

    const result = await this.notificationPort.sendTelegram(targetToken, targetChatId, testMessage);

    if (result.success) {
      this.logger.info("Telegram test ping sent successfully", {
        chatId: targetChatId,
      });

      return {
        success: true,
        message: "Notifikasi percobaan berhasil dikirim ke Telegram.",
      };
    }

    this.logger.warn("Telegram test ping failed", {
      chatId: targetChatId,
      error: result.error,
    });

    return {
      success: false,
      message: result.error ?? "Gagal mengirim notifikasi percobaan ke Telegram.",
    };
  }
}
