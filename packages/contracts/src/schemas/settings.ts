import { z } from "zod";

export const TelegramBotTokenSchema = z
  .string()
  .trim()
  .regex(/^\d+:[A-Za-z0-9_-]+$/, "Format bot token Telegram tidak valid");

export const TelegramSettingsResponseSchema = z.object({
  configured: z.boolean(),
  chatId: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export const UpdateTelegramSettingsRequestSchema = z.object({
  botToken: TelegramBotTokenSchema,
  chatId: z.string().trim().min(1, "Chat ID Telegram wajib diisi"),
});

export const TestTelegramNotificationRequestSchema = z.object({
  botToken: TelegramBotTokenSchema.optional(),
  chatId: z.string().trim().min(1).optional(),
});
