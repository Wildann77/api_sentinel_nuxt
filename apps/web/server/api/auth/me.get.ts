import type { MeResponseDto, UserSummaryDto } from "@sentinel/contracts";
import { defineEventHandler } from "h3";

export default defineEventHandler((event): MeResponseDto => {
  const user = event.context.user as UserSummaryDto | null | undefined;

  if (user?.id) {
    return {
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  return {
    authenticated: false,
    user: null,
  };
});
