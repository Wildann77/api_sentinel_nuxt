import { defineEventHandler } from "h3";
import { getContainer } from "../../utils/container.js";
import { clearSessionCookie, getSessionToken } from "../../utils/session-cookie.js";

export default defineEventHandler(async (event) => {
  const container = getContainer();
  const token =
    (event.context.sessionToken as string | undefined) ||
    getSessionToken(event, container.env.SESSION_SECRET);

  if (token) {
    await container.revokeSessionUseCase.execute({ token });
  }

  clearSessionCookie(event);

  return { success: true };
});
