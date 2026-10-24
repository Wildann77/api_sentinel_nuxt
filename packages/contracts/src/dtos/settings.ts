import type { z } from "zod";
import type {
  TelegramSettingsResponseSchema,
  TestTelegramNotificationRequestSchema,
  UpdateTelegramSettingsRequestSchema,
} from "../schemas/settings.js";

export type TelegramSettingsResponseDto = z.infer<typeof TelegramSettingsResponseSchema>;
export type UpdateTelegramSettingsRequestDto = z.infer<typeof UpdateTelegramSettingsRequestSchema>;
export type TestTelegramNotificationRequestDto = z.infer<
  typeof TestTelegramNotificationRequestSchema
>;
