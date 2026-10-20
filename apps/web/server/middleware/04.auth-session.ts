import { InvalidCredentialsException } from "@sentinel/domain";
import { defineEventHandler, getRequestPath } from "h3";
import { getContainer } from "../utils/container.js";
import { getSessionToken } from "../utils/session-cookie.js";

const PUBLIC_EXACT_PATHS = new Set([
  "/healthz",
  "/readyz",
  "/metrics",
  "/api/auth/login",
  "/favicon.ico",
]);

export default defineEventHandler(async (event) => {
  const path = getRequestPath(event);

  if (
    PUBLIC_EXACT_PATHS.has(path) ||
    path.startsWith("/_nuxt") ||
    path.startsWith("/__nuxt") ||
    !path.startsWith("/api/")
  ) {
    return;
  }

  const container = getContainer();
  const token = getSessionToken(event, container.env.SESSION_SECRET);

  if (!token) {
    if (path === "/api/auth/me") {
      event.context.user = null;
      event.context.sessionToken = null;
      return;
    }
    throw new InvalidCredentialsException("Sesi tidak ditemukan atau tidak valid.");
  }

  const validationResult = await container.validateSessionUseCase.execute({ token });

  if (!validationResult.authenticated || !validationResult.user) {
    if (path === "/api/auth/me") {
      event.context.user = null;
      event.context.sessionToken = null;
      return;
    }
    throw new InvalidCredentialsException("Sesi tidak valid atau telah kedaluwarsa.");
  }

  event.context.user = validationResult.user;
  event.context.sessionToken = token;
});
