import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MockTelegramServer } from "../../../tests/helpers/mock-telegram.js";
import {
  escapeMarkdownV2,
  formatDuration,
  formatIncidentOpenedMessage,
  formatIncidentRecoveredMessage,
  formatUtcDateTime,
  TelegramBotNotificationAdapter,
} from "../src/notification/index.js";

describe("TelegramBotNotificationAdapter (P10.2)", () => {
  let mockServer: MockTelegramServer;
  let serverUrl: string;

  beforeAll(async () => {
    mockServer = new MockTelegramServer();
    serverUrl = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    mockServer.clearSentMessages();
    mockServer.setMode({ type: "success" });
  });

  describe("MarkdownV2 Escaper & Templates", () => {
    it("escapes all 18 MarkdownV2 reserved characters", () => {
      const dangerous = "_*[]()~`>#+-=|{}.!\\";
      const escaped = escapeMarkdownV2(dangerous);

      expect(escaped).toBe("\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!\\\\");
    });

    it("formats UTC date and duration accurately", () => {
      const date = new Date("2026-10-24T05:30:00.000Z");
      expect(formatUtcDateTime(date)).toBe("2026-10-24 05:30 UTC");

      expect(formatDuration(45)).toBe("45 detik");
      expect(formatDuration(300)).toBe("5 menit");
      expect(formatDuration(315)).toBe("5 menit 15 detik");
      expect(formatDuration(3600)).toBe("1 jam");
      expect(formatDuration(3720)).toBe("1 jam 2 menit");
    });

    it("formats incident opened message conforming to PRD §4.15", () => {
      const msg = formatIncidentOpenedMessage({
        monitorName: "Payment [Prod] API",
        cause: "Expected status 200, got 503!",
        openedAt: new Date("2026-10-22T10:00:00.000Z"),
      });

      expect(msg).toContain("*API Sentinel — INSIDEN TERBUKA*");
      expect(msg).toContain("*Monitor:* Payment \\[Prod\\] API");
      expect(msg).toContain("*Status:* DOWN");
      expect(msg).toContain("*Penyebab:* Expected status 200, got 503\\!");
      expect(msg).toContain("*Waktu mulai:* 2026\\-10\\-22 10:00 UTC");
    });

    it("formats incident recovered message conforming to PRD §4.15", () => {
      const msg = formatIncidentRecoveredMessage({
        monitorName: "Payment API",
        openedAt: new Date("2026-10-22T10:00:00.000Z"),
        recoveredAt: new Date("2026-10-22T10:05:00.000Z"),
        durationSeconds: 300,
      });

      expect(msg).toContain("*API Sentinel — INSIDEN DIPULIHKAN*");
      expect(msg).toContain("*Monitor:* Payment API");
      expect(msg).toContain("*Status:* UP");
      expect(msg).toContain("*Waktu mulai:* 2026\\-10\\-22 10:00 UTC");
      expect(msg).toContain("*Waktu pulih:* 2026\\-10\\-22 10:05 UTC");
      expect(msg).toContain("*Durasi:* 5 menit");
    });
  });

  describe("sendTelegram via MockTelegramServer", () => {
    it("successfully sends message via Bot API with MarkdownV2", async () => {
      const adapter = new TelegramBotNotificationAdapter({ baseUrl: serverUrl });
      const botToken = "123456789:ABCdefGHIjklMNO";
      const chatId = "-100123456789";
      const text = "*API Sentinel — INSIDEN TERBUKA*";

      const result = await adapter.sendTelegram(botToken, chatId, text);

      expect(result.success).toBe(true);
      expect(mockServer.getSentMessages()).toHaveLength(1);
      const sent = mockServer.getSentMessages()[0];
      expect(sent?.token).toBe(botToken);
      expect(sent?.chatId).toBe(chatId);
      expect(sent?.text).toBe(text);
      expect(sent?.parseMode).toBe("MarkdownV2");
    });

    it("handles 429 Too Many Requests and parses retry_after", async () => {
      mockServer.setMode({ type: "rate_limit", retryAfterSeconds: 24 });

      const adapter = new TelegramBotNotificationAdapter({ baseUrl: serverUrl });
      const botToken = "123456789:ABCdefGHIjklMNO";
      const chatId = "-100123456789";

      const result = await adapter.sendTelegram(botToken, chatId, "Test 429");

      expect(result.success).toBe(false);
      expect(result.retryAfterSeconds).toBe(24);
      expect(result.error).toContain("429");
    });

    it("redacts bot token from error description on 401 Unauthorized", async () => {
      mockServer.setMode({
        type: "error",
        statusCode: 401,
        description: "Unauthorized call to /bot123456789:SECRET_TOKEN/sendMessage",
      });

      const adapter = new TelegramBotNotificationAdapter({ baseUrl: serverUrl });
      const botToken = "123456789:SECRET_TOKEN";

      const result = await adapter.sendTelegram(botToken, "chat-1", "Hello");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).not.toContain("123456789:SECRET_TOKEN");
      expect(result.error).toContain("bot[REDACTED]");
    });

    it("handles network timeout gracefully with sanitized error", async () => {
      // Point to an unroutable port with short timeout to trigger abort/timeout
      const adapter = new TelegramBotNotificationAdapter({
        baseUrl: "http://127.0.0.1:59999",
        timeoutMs: 50,
      });

      const botToken = "999999999:LEAKY_TOKEN";
      const result = await adapter.sendTelegram(botToken, "chat-1", "Timeout test");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).not.toContain("999999999:LEAKY_TOKEN");
    });
  });
});
