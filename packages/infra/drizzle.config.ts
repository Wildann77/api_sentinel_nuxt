import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  tablesFilter: [
    "users",
    "sessions",
    "rate_limits",
    "monitors",
    "incidents",
    "check_results",
    "monitor_metrics_hourly",
    "notification_configs",
    "notification_deliveries",
    "worker_heartbeats",
  ],
  extensionsFilters: ["pgcrypto"],
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel",
  },
  strict: true,
  verbose: true,
});
