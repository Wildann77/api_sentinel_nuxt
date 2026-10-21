import { describe, expect, it } from "vitest";
import {
  formatMonitorAad,
  formatNotificationConfigAad,
  LibsodiumAeadCipherAdapter,
} from "../src/crypto/libsodium-aead-cipher.adapter.js";

const KEY_1_BASE64 = Buffer.alloc(32, 1).toString("base64");
const KEY_2_BASE64 = Buffer.alloc(32, 2).toString("base64");

describe("P5.2 — LibsodiumAeadCipherAdapter Unit Test", () => {
  const keyring = {
    activeKeyId: "k2",
    keys: {
      k1: KEY_1_BASE64,
      k2: KEY_2_BASE64,
    },
  };

  it("encrypts with active key in uniform v1:<keyId>:<hexNonce>:<hexCt> format and decrypts cleanly", async () => {
    const cipher = new LibsodiumAeadCipherAdapter(keyring);
    const plainText = "Bearer secret-api-key-12345";
    const aad = formatMonitorAad("018d0000-0000-7000-8000-000000000001", "headers");

    const encrypted = await cipher.encrypt(plainText, aad);

    expect(encrypted.startsWith("v1:k2:")).toBe(true);

    const parts = encrypted.split(":");
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe("v1");
    expect(parts[1]).toBe("k2");
    expect(parts[2].length).toBe(48); // 24 bytes hex nonce
    expect(parts[3].length).toBeGreaterThanOrEqual(32); // Ciphertext + 16-byte Poly1305 MAC tag

    const decrypted = await cipher.decrypt(encrypted, aad);
    expect(decrypted).toBe(plainText);
  });

  it("fails decryption when AAD is swapped or mismatched (context binding guard)", async () => {
    const cipher = new LibsodiumAeadCipherAdapter(keyring);
    const plainText = "Bearer token-abc";

    const monitorId1 = "018d0000-0000-7000-8000-000000000001";
    const monitorId2 = "018d0000-0000-7000-8000-000000000002";

    const aadHeaders1 = formatMonitorAad(monitorId1, "headers");
    const aadHeaders2 = formatMonitorAad(monitorId2, "headers");
    const aadBody1 = formatMonitorAad(monitorId1, "body");

    const encrypted = await cipher.encrypt(plainText, aadHeaders1);

    // Swap to different monitor row
    await expect(cipher.decrypt(encrypted, aadHeaders2)).rejects.toThrow(
      "Decryption failed: MAC verification failed or invalid AAD/ciphertext.",
    );

    // Swap to different column on same monitor row
    await expect(cipher.decrypt(encrypted, aadBody1)).rejects.toThrow(
      "Decryption failed: MAC verification failed or invalid AAD/ciphertext.",
    );
  });

  it("encrypts and decrypts Telegram bot token using D-21 notificationConfigId AAD", async () => {
    const cipher = new LibsodiumAeadCipherAdapter(keyring);
    const botToken = "bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";
    const configId = "018d0000-0000-7000-8000-000000000099";
    const aad = formatNotificationConfigAad(configId, "botToken");

    expect(aad).toBe(`notificationConfigId:${configId}:field:botToken`);

    const encrypted = await cipher.encrypt(botToken, aad);
    const decrypted = await cipher.decrypt(encrypted, aad);

    expect(decrypted).toBe(botToken);
  });

  it("supports key rotation: decrypts ciphertext produced by older key k1 when active key is k2", async () => {
    const oldKeyring = {
      activeKeyId: "k1",
      keys: {
        k1: KEY_1_BASE64,
        k2: KEY_2_BASE64,
      },
    };
    const oldCipher = new LibsodiumAeadCipherAdapter(oldKeyring);
    const newCipher = new LibsodiumAeadCipherAdapter(keyring);

    const secret = "legacy-database-secret";
    const aad = formatMonitorAad("018d0000-0000-7000-8000-000000000001", "authConfig");

    const encryptedWithK1 = await oldCipher.encrypt(secret, aad);
    expect(encryptedWithK1.startsWith("v1:k1:")).toBe(true);

    // newCipher with activeKeyId=k2 can still decrypt k1
    const decrypted = await newCipher.decrypt(encryptedWithK1, aad);
    expect(decrypted).toBe(secret);

    // needsReencryption returns true for k1 and false for k2
    expect(newCipher.needsReencryption(encryptedWithK1)).toBe(true);

    const encryptedWithK2 = await newCipher.encrypt(secret, aad);
    expect(newCipher.needsReencryption(encryptedWithK2)).toBe(false);
  });

  it("throws clear error when ciphertext references a key not present in keyring", async () => {
    const cipher = new LibsodiumAeadCipherAdapter({
      activeKeyId: "k2",
      keys: { k2: KEY_2_BASE64 },
    });

    const malformed =
      "v1:k_unknown:010203040506070809101112131415161718192021222324:aabbccddeeff00112233445566778899";
    await expect(cipher.decrypt(malformed, "some:aad")).rejects.toThrow(
      'Decryption failed: encryption key "k_unknown" not found in keyring.',
    );
  });

  it("rejects invalid ciphertext formats and corrupted payload", async () => {
    const cipher = new LibsodiumAeadCipherAdapter(keyring);

    await expect(cipher.decrypt("not-v1:format", "aad")).rejects.toThrow(
      "Invalid ciphertext format: missing or unsupported version prefix",
    );

    await expect(cipher.decrypt("v1:only_two_parts", "aad")).rejects.toThrow(
      "Invalid ciphertext structure: expected 'v1:<keyId>:<hexNonce>:<hexCt>'",
    );

    await expect(
      cipher.decrypt("v1:k2:shortnonce:abcdef0123456789abcdef0123456789", "aad"),
    ).rejects.toThrow("Invalid nonce length: expected 48 hex chars (24 bytes)");

    await expect(
      cipher.decrypt("v1:k2:010203040506070809101112131415161718192021222324:short", "aad"),
    ).rejects.toThrow("Invalid ciphertext length: missing minimum Poly1305 MAC tag");
  });
});
