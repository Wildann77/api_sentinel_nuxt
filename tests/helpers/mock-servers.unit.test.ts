import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockDnsResolver } from "./mock-dns";
import { MockHttpServer } from "./mock-http-server";
import { MockTelegramServer } from "./mock-telegram";

describe("Test Helpers Suite", () => {
  const httpServer = new MockHttpServer();
  const telegramServer = new MockTelegramServer();
  let httpBaseUrl = "";
  let telegramBaseUrl = "";

  beforeAll(async () => {
    httpBaseUrl = await httpServer.start();
    telegramBaseUrl = await telegramServer.start();
  });

  afterAll(async () => {
    await httpServer.stop();
    await telegramServer.stop();
  });

  describe("MockHttpServer", () => {
    it("handles status code routes correctly", async () => {
      const res = await fetch(`${httpBaseUrl}/status/418`);
      expect(res.status).toBe(418);
      const json = await res.json();
      expect(json).toEqual({ status: 418 });
    });

    it("handles redirect routes correctly", async () => {
      const res = await fetch(`${httpBaseUrl}/redirect?status=301&target=/status/200`, {
        redirect: "manual",
      });
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe("/status/200");
    });

    it("records incoming requests with headers and method", async () => {
      httpServer.clearRequests();
      await fetch(`${httpBaseUrl}/status/200`, {
        headers: { "X-Sentinel-Test": "probe-active" },
      });
      const reqs = httpServer.getRequests();
      expect(reqs.length).toBe(1);
      expect(reqs[0].headers["x-sentinel-test"]).toBe("probe-active");
    });
  });

  describe("MockDnsResolver", () => {
    it("simulates DNS rebinding sequence correctly", () => {
      const dns = new MockDnsResolver();
      dns.setRebinding("target.sentinel.internal", [
        [{ address: "93.184.216.34", family: 4 }],
        [{ address: "127.0.0.1", family: 4 }],
      ]);

      const firstQuery = dns.resolve("target.sentinel.internal");
      expect(firstQuery[0].address).toBe("93.184.216.34");

      const secondQuery = dns.resolve("target.sentinel.internal");
      expect(secondQuery[0].address).toBe("127.0.0.1");
    });
  });

  describe("MockTelegramServer", () => {
    it("records and returns success for Telegram messages", async () => {
      telegramServer.clearSentMessages();
      telegramServer.setMode({ type: "success", messageId: 999 });

      const res = await fetch(`${telegramBaseUrl}/bot123456:ABC-DEF/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: "12345", text: "Alert: Monitor Down" }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; result: { message_id: number } };
      expect(json.ok).toBe(true);
      expect(json.result.message_id).toBe(999);

      const sent = telegramServer.getSentMessages();
      expect(sent.length).toBe(1);
      expect(sent[0].chatId).toBe("12345");
      expect(sent[0].text).toBe("Alert: Monitor Down");
    });

    it("simulates 429 rate limit with retry_after", async () => {
      telegramServer.setMode({ type: "rate_limit", retryAfterSeconds: 30 });

      const res = await fetch(`${telegramBaseUrl}/bot123456:ABC-DEF/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: "12345", text: "Test Rate Limit" }),
      });

      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe("30");
      const json = (await res.json()) as { ok: boolean; error_code: number };
      expect(json.ok).toBe(false);
      expect(json.error_code).toBe(429);
    });
  });
});
