import type { TelegramSettingsResponseDto } from "@sentinel/contracts";
import type { GetTelegramSettingsQuery } from "../../ports/in/settings.use-cases.js";
import type { NotificationConfigRepositoryPort } from "../../ports/out/index.js";

export class GetTelegramSettings implements GetTelegramSettingsQuery {
  constructor(private readonly notificationConfigRepo: NotificationConfigRepositoryPort) {}

  public async execute(): Promise<TelegramSettingsResponseDto> {
    const config = await this.notificationConfigRepo.getTelegramConfig();

    if (!config) {
      return {
        configured: false,
        chatId: null,
        updatedAt: null,
      };
    }

    return {
      configured: true,
      chatId: config.chatId,
      updatedAt: config.updatedAt.toISOString(),
    };
  }
}
