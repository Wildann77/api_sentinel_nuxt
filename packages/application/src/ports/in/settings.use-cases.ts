import type {
  TelegramSettingsResponseDto,
  TestTelegramNotificationRequestDto,
  UpdateTelegramSettingsRequestDto,
} from "@sentinel/contracts";

export interface GetTelegramSettingsQuery {
  execute(): Promise<TelegramSettingsResponseDto>;
}

export interface UpdateTelegramSettingsCommand {
  readonly request: UpdateTelegramSettingsRequestDto;
}

export interface UpdateTelegramSettingsUseCase {
  execute(command: UpdateTelegramSettingsCommand): Promise<TelegramSettingsResponseDto>;
}

export interface TestTelegramNotificationCommand {
  readonly request: TestTelegramNotificationRequestDto;
}

export interface TestTelegramNotificationResult {
  readonly success: boolean;
  readonly message: string;
}

export interface TestTelegramNotificationUseCase {
  execute(command: TestTelegramNotificationCommand): Promise<TestTelegramNotificationResult>;
}
