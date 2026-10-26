import { sql } from "@sentinel/infra";
import { defineEventHandler, setResponseStatus } from "h3";
import { getContainer } from "../utils/container.js";

export default defineEventHandler(async (event) => {
  const container = getContainer();

  try {
    await container.db.execute(sql`SELECT 1`);

    return {
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    setResponseStatus(event, 503);
    container.logger.error("Readiness check failed: database unavailable", {
      err: error instanceof Error ? error.message : String(error),
    });

    return {
      status: "unhealthy",
      database: "disconnected",
      message: "Database connection failed",
      timestamp: new Date().toISOString(),
    };
  }
});
