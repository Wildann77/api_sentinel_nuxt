import { WebSocketEventSchema } from "@sentinel/contracts";
import { defineNitroPlugin } from "nitropack/dist/runtime/plugin";
import { getContainer } from "../utils/container.js";
import { getWsHub, type WsHub } from "../utils/ws-hub.js";

export const SENTINEL_EVENTS_CHANNEL = "sentinel_events";

export function processSentinelEventPayload(
  rawPayload: string,
  wsHub: WsHub = getWsHub(),
): boolean {
  try {
    const parsed = JSON.parse(rawPayload);
    const parseResult = WebSocketEventSchema.safeParse(parsed);
    if (!parseResult.success) {
      return false;
    }

    wsHub.broadcastEvent(parseResult.data);
    return true;
  } catch {
    return false;
  }
}

export default defineNitroPlugin(async (nitroApp) => {
  const container = getContainer();
  const wsHub = getWsHub();
  const logger = container.logger;

  let unsubscribe: (() => Promise<void>) | null = null;

  try {
    unsubscribe = await container.pubSub.subscribe(
      SENTINEL_EVENTS_CHANNEL,
      (rawPayload: string) => {
        const success = processSentinelEventPayload(rawPayload, wsHub);
        if (!success) {
          logger.warn("Invalid payload received on sentinel_events channel", {
            rawPayload,
          });
        }
      },
    );

    logger.info("Subscribed to PostgreSQL LISTEN sentinel_events channel");
  } catch (err) {
    logger.error("Failed to initialize PostgreSQL LISTEN sentinel_events listener", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  nitroApp.hooks.hook("close", async () => {
    if (unsubscribe) {
      try {
        await unsubscribe();
      } catch {
        // Ignore during shutdown
      }
      unsubscribe = null;
    }
  });
});
