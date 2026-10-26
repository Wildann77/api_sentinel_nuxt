import type { CheckDetailDto } from "@sentinel/contracts";
import { defineEventHandler, readBody } from "h3";
import { getContainer } from "../../utils/container.js";

export default defineEventHandler(async (event): Promise<CheckDetailDto> => {
  const container = getContainer();
  const user = event.context.user;

  // Rate Limiting Tier 2 (ARCH §5.3.5): 20 req/menit per user
  if (user?.id) {
    await container.rateLimiter.consumeTier2UserCheck(user.id);
  }

  const body = await readBody(event);
  return container.testMonitorConfigUseCase.execute({ request: body });
});
