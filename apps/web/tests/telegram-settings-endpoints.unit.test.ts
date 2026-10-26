import { ValidationException } from "@sentinel/domain";
import type { H3Event } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import getTelegramSettingsHandler from "../server/api/settings/telegram/index.get.js";
import updateTelegramSettingsHandler from "../server/api/settings/telegram/index.put.js";
import testTelegramSettingsHandler from "../server/api/settings/telegram/test.post.js";
import { getContainer } from "../server/utils/container.js";

interface MockEventOverrides {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  remoteAddress?: string;
  context?: Record<string, unknown>;
  body?: unknown;
}

function createMockEvent(overrides: MockEventOverrides = {}): H3Event {
  const headers: Record<string, string> = {
    host: "localhost:3000",
    ...(overrides.headers || {}),
  };
  const responseHeaders: Record<string, string | string[]> = {};

  return {
    method: overrides.method || "GET",
    path: overrides.path || "/",
    node: {
      req: {
        method: overrides.method || "GET",
        url: overrides.path || "/",
        headers,
        socket: {
          remoteAddress: overrides.remoteAddress || "127.0.0.1",
        },
      },
      res: {
        setHeader: (name: string, value: string | string[]) => {
          responseHeaders[name.toLowerCase()] = value;
        },
        getHeader: (name: string) => responseHeaders[name.toLowerCase()],
        headersSent: false,
      },
    },
    context: overrides.context || {},
    _body: overrides.body,
  } as unknown as H3Event;
}

vi.mock("h3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("h3")>();
  return {
    ...actual,
    readBody: vi.fn(async (event: unknown) => (event as { _body?: unknown })?._body),
  };
});

const VALID_KEYRING = JSON.stringify({
  activeKeyId: "key-1",
  keys: {
    "key-1": Buffer.alloc(32, 1).toString("base64"),
  },
});

const VALID_ENV = {
  NODE_ENV: "test",
  PORT: "3000",
  WORKER_PORT: "3001",
  DATABASE_URL: "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel",
  APP_KEYRING: VALID_KEYRING,
  SESSION_SECRET: "a-very-long-and-secure-session-secret-key-32chars",
  LOG_LEVEL: "info",
};

describe("P10.4 — Telegram Settings API Endpoints", () => {
  beforeEach(() => {
    getContainer(VALID_ENV);
    vi.restoreAllMocks();
  });

  describe("GET /api/settings/telegram", () => {
    it("returns configuration status without leaking token", async () => {
      const container = getContainer();
      vi.spyOn(container.getTelegramSettingsQuery, "execute").mockResolvedValue({
        configured: true,
        chatId: "-100123456789",
        updatedAt: "2026-10-24T12:00:00.000Z",
      });

      const event = createMockEvent({
        method: "GET",
        path: "/api/settings/telegram",
      });

      const response = await getTelegramSettingsHandler(event);

      expect(response).toEqual({
        configured: true,
        chatId: "-100123456789",
        updatedAt: "2026-10-24T12:00:00.000Z",
      });
      expect(response).not.toHaveProperty("botToken");
      expect(JSON.stringify(response)).not.toContain("botToken");
    });
  });

  describe("PUT /api/settings/telegram", () => {
    it("saves encrypted telegram settings and returns status without token", async () => {
      const container = getContainer();
      const rawToken = "123456789:ABCdefGHIjklMNO";
      const chatId = "-100123456789";

      vi.spyOn(container.updateTelegramSettingsUseCase, "execute").mockResolvedValue({
        configured: true,
        chatId,
        updatedAt: "2026-10-24T12:00:00.000Z",
      });

      const event = createMockEvent({
        method: "PUT",
        path: "/api/settings/telegram",
        body: {
          botToken: rawToken,
          chatId,
        },
      });

      const response = await updateTelegramSettingsHandler(event);

      expect(response).toEqual({
        configured: true,
        chatId,
        updatedAt: "2026-10-24T12:00:00.000Z",
      });
      expect(response).not.toHaveProperty("botToken");
      expect(JSON.stringify(response)).not.toContain(rawToken);
    });

    it("propagates validation error on invalid payload", async () => {
      const container = getContainer();
      vi.spyOn(container.updateTelegramSettingsUseCase, "execute").mockRejectedValue(
        new ValidationException("Format bot token Telegram tidak valid"),
      );

      const event = createMockEvent({
        method: "PUT",
        path: "/api/settings/telegram",
        body: {
          botToken: "invalid",
          chatId: "",
        },
      });

      await expect(updateTelegramSettingsHandler(event)).rejects.toThrow(ValidationException);
    });
  });

  describe("POST /api/settings/telegram/test", () => {
    it("triggers test ping and returns success message", async () => {
      const container = getContainer();
      vi.spyOn(container.testTelegramNotificationUseCase, "execute").mockResolvedValue({
        success: true,
        message: "Notifikasi percobaan berhasil dikirim ke Telegram.",
      });

      const event = createMockEvent({
        method: "POST",
        path: "/api/settings/telegram/test",
        body: {},
      });

      const response = await testTelegramSettingsHandler(event);

      expect(response.success).toBe(true);
      expect(response.message).toContain("berhasil");
      expect(JSON.stringify(response)).not.toContain("botToken");
    });

    it("returns failure summary when test ping delivery fails", async () => {
      const container = getContainer();
      vi.spyOn(container.testTelegramNotificationUseCase, "execute").mockResolvedValue({
        success: false,
        message: "Telegram API error (401): Unauthorized",
      });

      const event = createMockEvent({
        method: "POST",
        path: "/api/settings/telegram/test",
        body: {
          botToken: "123456789:badToken",
          chatId: "-100123456789",
        },
      });

      const response = await testTelegramSettingsHandler(event);

      expect(response.success).toBe(false);
      expect(response.message).toContain("401");
      expect(JSON.stringify(response)).not.toContain("badToken");
    });
  });
});
