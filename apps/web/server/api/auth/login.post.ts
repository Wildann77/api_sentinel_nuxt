import type { LoginResponseDto } from "@sentinel/contracts";
import { defineEventHandler, getHeader, readBody } from "h3";
import { getContainer } from "../../utils/container.js";
import { setSessionCookie } from "../../utils/session-cookie.js";

export default defineEventHandler(async (event): Promise<LoginResponseDto> => {
  const body = await readBody(event);
  const container = getContainer();

  const clientIp = event.context.clientIp as string | undefined;

  const authResult = await container.authenticateUserUseCase.execute({
    credentials: body ?? {},
    clientIp,
  });

  const isSecure =
    Boolean(event.node?.req?.socket && "encrypted" in event.node.req.socket) ||
    getHeader(event, "x-forwarded-proto") === "https" ||
    container.env.NODE_ENV === "production";

  setSessionCookie(event, authResult.token, container.env.SESSION_SECRET, isSecure);

  return {
    user: authResult.user,
  };
});
