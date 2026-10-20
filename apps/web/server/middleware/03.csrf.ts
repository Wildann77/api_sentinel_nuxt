import { ForbiddenException } from "@sentinel/domain";
import { defineEventHandler, getHeader } from "h3";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export default defineEventHandler((event) => {
  const isMutation = MUTATION_METHODS.has(event.method.toUpperCase());
  const isWebSocketUpgrade = getHeader(event, "upgrade")?.toLowerCase() === "websocket";

  if (!isMutation && !isWebSocketUpgrade) {
    return;
  }

  const hostHeader = getHeader(event, "host");
  const originHeader = getHeader(event, "origin");
  const refererHeader = getHeader(event, "referer");

  if (!hostHeader) {
    throw new ForbiddenException("Header Host tidak valid untuk verifikasi CSRF.");
  }

  const expectedHost = hostHeader.trim().toLowerCase();

  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      if (originUrl.host.toLowerCase() !== expectedHost) {
        throw new ForbiddenException("Origin CSRF tidak cocok dengan Host permintaan.");
      }
      return;
    } catch {
      throw new ForbiddenException("Format header Origin tidak valid.");
    }
  }

  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      if (refererUrl.host.toLowerCase() !== expectedHost) {
        throw new ForbiddenException("Referer CSRF tidak cocok dengan Host permintaan.");
      }
      return;
    } catch {
      throw new ForbiddenException("Format header Referer tidak valid.");
    }
  }

  throw new ForbiddenException("Permintaan mutasi wajib menyertakan header Origin atau Referer.");
});
