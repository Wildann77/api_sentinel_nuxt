import type { TestTelegramNotificationResult } from "@sentinel/application";
import { defineEventHandler, readBody } from "h3";
import { getContainer } from "../../../utils/container.js";

export default defineEventHandler(async (event): Promise<TestTelegramNotificationResult> => {
  const body = await readBody(event);
  const container = getContainer();

  return container.testTelegramNotificationUseCase.execute({
    request: body ?? {},
  });
});
