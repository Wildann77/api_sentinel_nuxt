import { defineEventHandler } from "h3";

const startTime = Date.now();

export default defineEventHandler(() => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  return {
    status: "ok",
    uptimeSeconds,
    timestamp: new Date().toISOString(),
  };
});
