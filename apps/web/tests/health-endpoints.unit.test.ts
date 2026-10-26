import type { H3Event } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import healthzHandler from "../server/routes/healthz.get.js";
import readyzHandler from "../server/routes/readyz.get.js";
import { getContainer, resetContainer } from "../server/utils/container.js";

const VALID_KEYRING = JSON.stringify({
  activeKeyId: "key-1",
  keys: {
    "key-1": Buffer.alloc(32, 1).toString("base64"),
  },
});

const TEST_ENV = {
  NODE_ENV: "test",
  PORT: "3000",
  WORKER_PORT: "3001",
  DATABASE_URL: "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel",
  APP_KEYRING: VALID_KEYRING,
  SESSION_SECRET: "a-very-long-and-secure-session-secret-key-32chars",
  LOG_LEVEL: "error",
  CORS_ALLOWED_ORIGINS: "http://localhost:3000",
};

describe("P13.3 — Web Health & Readiness Endpoints Unit Tests", () => {
  beforeEach(async () => {
    await resetContainer();
  });

  describe("GET /healthz (Liveness)", () => {
    it("returns 200 OK with status ok and uptime", async () => {
      const mockEvent = {} as H3Event;
      const res = await healthzHandler(mockEvent);

      expect(res.status).toBe("ok");
      expect(typeof res.uptimeSeconds).toBe("number");
      expect(typeof res.timestamp).toBe("string");
    });
  });

  describe("GET /readyz (Readiness)", () => {
    it("returns 200 OK with connected status when DB responds", async () => {
      const container = getContainer(TEST_ENV);
      vi.spyOn(container.db, "execute").mockResolvedValueOnce([] as never);

      let statusCode = 200;
      const mockEvent = {
        node: {
          res: {
            get statusCode() {
              return statusCode;
            },
            set statusCode(code: number) {
              statusCode = code;
            },
          },
        },
      } as unknown as H3Event;

      const res = await readyzHandler(mockEvent);

      expect(statusCode).toBe(200);
      expect(res.status).toBe("ok");
      expect(res.database).toBe("connected");
      expect(typeof res.timestamp).toBe("string");
    });

    it("returns 503 Service Unavailable when DB is down without claiming success", async () => {
      const container = getContainer(TEST_ENV);
      vi.spyOn(container.db, "execute").mockRejectedValueOnce(new Error("Connection refused"));

      let statusCode = 200;
      const mockEvent = {
        node: {
          res: {
            get statusCode() {
              return statusCode;
            },
            set statusCode(code: number) {
              statusCode = code;
            },
          },
        },
      } as unknown as H3Event;

      const res = await readyzHandler(mockEvent);

      expect(statusCode).toBe(503);
      expect(res.status).toBe("unhealthy");
      expect(res.database).toBe("disconnected");
      expect(res.message).toBe("Database connection failed");
      expect(typeof res.timestamp).toBe("string");
    });
  });
});
