import type { TelegramSettingsResponseDto } from "@sentinel/contracts";
import { defineEventHandler } from "h3";
import { getContainer } from "../../../utils/container.js";

export default defineEventHandler(async (): Promise<TelegramSettingsResponseDto> => {
  const container = getContainer();
  return container.getTelegramSettingsQuery.execute();
});
