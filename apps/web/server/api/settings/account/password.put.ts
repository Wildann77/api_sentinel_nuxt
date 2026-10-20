import { InvalidCredentialsException } from "@sentinel/domain";
import { defineEventHandler, readBody } from "h3";
import { getContainer } from "../../../utils/container.js";
import { getSessionToken } from "../../../utils/session-cookie.js";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const container = getContainer();

  const token =
    (event.context.sessionToken as string | undefined) ||
    getSessionToken(event, container.env.SESSION_SECRET);

  if (!token) {
    throw new InvalidCredentialsException("Sesi tidak ditemukan.");
  }

  await container.changeOwnerPasswordUseCase.execute({
    currentSessionToken: token,
    request: body ?? {},
  });

  return { success: true };
});
