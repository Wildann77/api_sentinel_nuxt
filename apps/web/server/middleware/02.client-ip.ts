import { defineEventHandler } from "h3";
import { extractClientIp } from "../utils/client-ip.js";
import { getContainer } from "../utils/container.js";

export default defineEventHandler((event) => {
  const container = getContainer();
  const trustedProxies = container.env.TRUSTED_PROXIES;
  const clientIp = extractClientIp(event, trustedProxies);

  event.context.clientIp = clientIp;
});
