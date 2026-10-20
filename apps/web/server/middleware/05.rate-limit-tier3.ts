import { RateLimitExceededException } from "@sentinel/domain";
import { defineEventHandler, getRequestPath } from "h3";
import { getContainer } from "../utils/container.js";

const RATE_LIMIT_TIER3_MAX = 120;
const RATE_LIMIT_TIER3_WINDOW_SECONDS = 60;

export default defineEventHandler(async (event) => {
  const path = getRequestPath(event);

  if (!path.startsWith("/api/")) {
    return;
  }

  const user = event.context.user;
  if (!user?.id) {
    return;
  }

  const container = getContainer();
  const limitResult = await container.rateLimiter.consume(
    `user:api:${user.id}`,
    RATE_LIMIT_TIER3_MAX,
    RATE_LIMIT_TIER3_WINDOW_SECONDS,
  );

  if (!limitResult.allowed) {
    throw new RateLimitExceededException(
      `Batas laju permintaan API terlampaui. Coba lagi dalam ${limitResult.resetAfterSeconds} detik.`,
      limitResult.resetAfterSeconds,
    );
  }
});
