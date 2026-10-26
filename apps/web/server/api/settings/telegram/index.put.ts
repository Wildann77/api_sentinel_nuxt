import type { TelegramSettingsResponseDto } from "@sentinel/contracts";
import { defineEventHandler, readBody } from "h3";
import { getContainer } from "../../../utils/container.js";

export default defineEventHandler(async (event): Promise<TelegramSettingsResponseDto> => {
  const body = await readBody(event);
  const container = getContainer();

  return container.updateTelegramSettingsUseCase.execute({
    request: body ?? {},
  });
});
