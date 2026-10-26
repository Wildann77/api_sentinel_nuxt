import { getSentinelMetrics } from "@sentinel/infra";
import { defineEventHandler, setResponseHeader } from "h3";

export default defineEventHandler(async (event) => {
  const metrics = getSentinelMetrics();
  const body = await metrics.getMetrics();

  setResponseHeader(event, "Content-Type", metrics.getContentType());
  return body;
});
