import { ValidationException } from "@sentinel/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { formatNotificationConfigAad } from "../src/ports/out/index.js";
import {
  FakeCipher,
  FakeClock,
  FakeLogger,
  FakeNotification,
  InMemoryNotificationConfigRepository,
  SequentialIdGenerator,
} from "../src/test-doubles/index.js";
import {
  GetTelegramSettings,
  TestTelegramNotification,
  UpdateTelegramSettings,
} from "../src/use-cases/settings/index.js";

describe("Settings Use Cases (P10.4)", () => {
  let notifConfigRepo: InMemoryNotificationConfigRepository;
  let cipher: FakeCipher;
  let clock: FakeClock;
  let idGen: SequentialIdGenerator;
  let logger: FakeLogger;
  let notificationPort: FakeNotification;

  let getSettings: GetTelegramSettings;
  let updateSettings: UpdateTelegramSettings;
  let testSettings: TestTelegramNotification;

  const validToken = "123456789:ABCdefGHIjklMNO12345";
  const validChatId = "-100123456789";

  beforeEach(() => {
    notifConfigRepo = new InMemoryNotificationConfigRepository();
    cipher = new FakeCipher();
    clock = new FakeClock(new Date("2026-10-24T12:00:00Z"));
    idGen = new SequentialIdGenerator("cfg");
    logger = new FakeLogger();
    notificationPort = new FakeNotification();

    getSettings = new GetTelegramSettings(notifConfigRepo);
    updateSettings = new UpdateTelegramSettings(notifConfigRepo, cipher, clock, idGen, logger);
    testSettings = new TestTelegramNotification(notifConfigRepo, notificationPort, cipher, logger);
  });

  describe("GetTelegramSettings", () => {
    it("returns configured: false when no Telegram config exists", async () => {
      const result = await getSettings.execute();
      expect(result).toEqual({
        configured: false,
        chatId: null,
        updatedAt: null,
      });
      expect(result).not.toHaveProperty("botToken");
    });

    it("returns configured: true without leaking token when config exists", async () => {
      await updateSettings.execute({
        request: {
          botToken: validToken,
          chatId: validChatId,
        },
      });

      const result = await getSettings.execute();
      expect(result.configured).toBe(true);
      expect(result.chatId).toBe(validChatId);
      expect(result.updatedAt).toBe("2026-10-24T12:00:00.000Z");
      expect(result).not.toHaveProperty("botToken");
      expect(JSON.stringify(result)).not.toContain(validToken);
    });
  });

  describe("UpdateTelegramSettings", () => {
    it("validates token format and rejects invalid token", async () => {
      await expect(
        updateSettings.execute({
          request: {
            botToken: "invalid_format_token",
            chatId: validChatId,
          },
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("validates chatId and rejects empty chatId", async () => {
      await expect(
        updateSettings.execute({
          request: {
            botToken: validToken,
            chatId: "   ",
          },
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("encrypts botToken with AAD D-21 and saves configuration", async () => {
      const result = await updateSettings.execute({
        request: {
          botToken: validToken,
          chatId: validChatId,
        },
      });

      expect(result.configured).toBe(true);
      expect(result.chatId).toBe(validChatId);

      const saved = await notifConfigRepo.getTelegramConfig();
      expect(saved).not.toBeNull();
      if (!saved) throw new Error("Expected saved config to exist");
      expect(saved.chatId).toBe(validChatId);

      // Verify token is encrypted with formatNotificationConfigAad
      const expectedAad = formatNotificationConfigAad(saved.id, "botToken");
      const decrypted = await cipher.decrypt(saved.encryptedBotToken, expectedAad);
      expect(decrypted).toBe(validToken);

      // Verify token never appears in logger
      const logs = logger.logs.map((e) => JSON.stringify(e)).join(" ");
      expect(logs).not.toContain(validToken);
    });
  });

  describe("TestTelegramNotification", () => {
    it("sends test ping with explicitly provided botToken and chatId", async () => {
      const result = await testSettings.execute({
        request: {
          botToken: validToken,
          chatId: validChatId,
        },
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("berhasil");
      expect(notificationPort.sentMessages).toHaveLength(1);
      expect(notificationPort.sentMessages[0]?.botToken).toBe(validToken);
      expect(notificationPort.sentMessages[0]?.chatId).toBe(validChatId);
      expect(notificationPort.sentMessages[0]?.messageMarkdownV2).toContain(
        "Tes Notifikasi Telegram",
      );
    });

    it("sends test ping using saved configuration when parameters omitted", async () => {
      await updateSettings.execute({
        request: {
          botToken: validToken,
          chatId: validChatId,
        },
      });

      const result = await testSettings.execute({
        request: {},
      });

      expect(result.success).toBe(true);
      expect(notificationPort.sentMessages).toHaveLength(1);
      expect(notificationPort.sentMessages[0]?.botToken).toBe(validToken);
      expect(notificationPort.sentMessages[0]?.chatId).toBe(validChatId);
    });

    it("throws ValidationException if parameters missing and no stored config", async () => {
      await expect(
        testSettings.execute({
          request: {},
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("returns success: false with safe error message when delivery fails", async () => {
      notificationPort.defaultResult = {
        success: false,
        error: "Telegram API error (401): Unauthorized",
      };

      const result = await testSettings.execute({
        request: {
          botToken: validToken,
          chatId: validChatId,
        },
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Telegram API error (401): Unauthorized");
      expect(result.message).not.toContain(validToken);
    });
  });
});
