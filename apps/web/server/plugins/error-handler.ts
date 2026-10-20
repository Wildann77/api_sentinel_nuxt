import { type H3Event, send, setResponseHeader, setResponseStatus } from "h3";
import { defineNitroPlugin } from "nitropack/dist/runtime/plugin";
import { getContainer } from "../utils/container.js";
import { createProblemDetails } from "../utils/problem-details.js";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("error", async (error: unknown, { event }: { event?: H3Event }) => {
    if (!event) return;

    const isProduction = process.env.NODE_ENV === "production";
    const path = event.path ?? "/";

    const { statusCode, payload, retryAfterSeconds } = createProblemDetails(
      error,
      path,
      isProduction,
    );

    if (statusCode >= 500) {
      try {
        const container = getContainer();
        container.logger.error(
          {
            err: error,
            path,
          },
          "Unhandled server exception occurred",
        );
      } catch {
        // Fallback logger if container is not initialized yet
        console.error(`[error-handler] Unhandled server exception at ${path}:`, error);
      }
    }

    setResponseStatus(event, statusCode);
    setResponseHeader(event, "Content-Type", "application/problem+json");

    if (retryAfterSeconds !== undefined) {
      setResponseHeader(event, "Retry-After", String(retryAfterSeconds));
    }

    await send(event, JSON.stringify(payload));
  });
});
