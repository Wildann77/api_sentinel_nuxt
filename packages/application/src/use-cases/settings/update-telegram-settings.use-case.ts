import {
  type TelegramSettingsResponseDto,
  type UpdateTelegramSettingsRequestDto,
  UpdateTelegramSettingsRequestSchema,
} from "@sentinel/contracts";
import { ValidationException } from "@sentinel/domain";
import type {
  UpdateTelegramSettingsCommand,
  UpdateTelegramSettingsUseCase,
} from "../../ports/in/settings.use-cases.js";
import {
  type CipherPort,
  type ClockPort,
  formatNotificationConfigAad,
  type IdGeneratorPort,
  type LoggerPort,
  type NotificationConfigRepositoryPort,
} from "../../ports/out/index.js";

export type UpdateTelegramSettingsInput =
  | UpdateTelegramSettingsCommand
  | UpdateTelegramSettingsRequestDto;

export class UpdateTelegramSettings implements UpdateTelegramSettingsUseCase {
  constructor(
    private readonly notificationConfigRepo: NotificationConfigRepositoryPort,
    private readonly cipher: CipherPort,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly logger: LoggerPort,
  ) {}

  public async execute(command: UpdateTelegramSettingsInput): Promise<TelegramSettingsResponseDto> {
    const rawInput = "request" in command && command.request ? command.request : command;
    const parseResult = UpdateTelegramSettingsRequestSchema.safeParse(rawInput);

    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      throw new ValidationException(
        issues[0]?.message ?? "Validasi pengaturan Telegram gagal.",
        issues.map((i) => ({
          name: i.path.join("."),
          reason: i.message,
        })),
      );
    }

    const { botToken, chatId } = parseResult.data;
    const existing = await this.notificationConfigRepo.getTelegramConfig();
    const configId = existing?.id ?? this.idGenerator.generate();
    const aad = formatNotificationConfigAad(configId, "botToken");
    const encryptedBotToken = await this.cipher.encrypt(botToken, aad);
    const now = this.clock.now();

    await this.notificationConfigRepo.saveTelegramConfig({
      id: configId,
      chatId,
      encryptedBotToken,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    this.logger.info("Telegram notification configuration saved", {
      configId,
      chatId,
    });

    return {
      configured: true,
      chatId,
      updatedAt: now.toISOString(),
    };
  }
}
