import type { CipherPort } from "@sentinel/application";
import sodium from "libsodium-wrappers-sumo";
import type { AppKeyring } from "../config/env.js";
import { parseKeyring, validateEnv } from "../config/env.js";

export function formatMonitorAad(monitorId: string, fieldName: string): string {
  return `monitorId:${monitorId}:field:${fieldName}`;
}

export function formatNotificationConfigAad(configId: string, fieldName: string): string {
  return `notificationConfigId:${configId}:field:${fieldName}`;
}

export class LibsodiumAeadCipherAdapter implements CipherPort {
  private readonly keyring: AppKeyring;
  private readonly keyBuffers = new Map<string, Uint8Array>();
  private initialized = false;

  constructor(keyring?: AppKeyring | string) {
    if (!keyring) {
      const env = validateEnv();
      this.keyring = parseKeyring(env.APP_KEYRING);
    } else if (typeof keyring === "string") {
      this.keyring = parseKeyring(keyring);
    } else {
      this.keyring = keyring;
    }

    // Pre-decode 32-byte keys from base64
    for (const [keyId, base64Key] of Object.entries(this.keyring.keys)) {
      const buf = Buffer.from(base64Key, "base64");
      if (buf.length !== 32) {
        throw new Error(
          `Key "${keyId}" in keyring is invalid: expected 32 bytes, got ${buf.length}`,
        );
      }
      this.keyBuffers.set(keyId, new Uint8Array(buf));
    }

    if (!this.keyBuffers.has(this.keyring.activeKeyId)) {
      throw new Error(`Active key "${this.keyring.activeKeyId}" not found in keyring keys.`);
    }
  }

  private async ensureReady(): Promise<void> {
    if (!this.initialized) {
      await sodium.ready;
      this.initialized = true;
    }
  }

  public getActiveKeyId(): string {
    return this.keyring.activeKeyId;
  }

  public getKeyIds(): string[] {
    return Object.keys(this.keyring.keys);
  }

  public needsReencryption(cipherText: string): boolean {
    if (typeof cipherText !== "string" || !cipherText.startsWith("v1:")) {
      return false;
    }
    const parts = cipherText.split(":");
    if (parts.length !== 4) {
      return false;
    }
    const keyId = parts[1];
    return keyId !== this.keyring.activeKeyId;
  }

  public async encrypt(plainText: string, aad: string): Promise<string> {
    await this.ensureReady();

    const activeKeyId = this.keyring.activeKeyId;
    const keyBytes = this.keyBuffers.get(activeKeyId);
    if (!keyBytes) {
      throw new Error(`Active key "${activeKeyId}" not available in keyring.`);
    }

    // Nonce 24 bytes (48 hex chars)
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

    const ciphertextWithMac = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plainText,
      aad,
      null,
      nonce,
      keyBytes,
    );

    const hexNonce = sodium.to_hex(nonce);
    const hexCt = sodium.to_hex(ciphertextWithMac);

    return `v1:${activeKeyId}:${hexNonce}:${hexCt}`;
  }

  public async decrypt(cipherText: string, aad: string): Promise<string> {
    await this.ensureReady();

    if (typeof cipherText !== "string" || !cipherText.startsWith("v1:")) {
      throw new Error(
        "Invalid ciphertext format: missing or unsupported version prefix (expected 'v1:').",
      );
    }

    const parts = cipherText.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid ciphertext structure: expected 'v1:<keyId>:<hexNonce>:<hexCt>'.");
    }

    const [, keyId, hexNonce, hexCt] = parts;
    if (!keyId || !hexNonce || !hexCt) {
      throw new Error("Invalid ciphertext structure: missing keyId, nonce or ciphertext.");
    }

    const keyBytes = this.keyBuffers.get(keyId);
    if (!keyBytes) {
      throw new Error(`Decryption failed: encryption key "${keyId}" not found in keyring.`);
    }

    if (hexNonce.length !== 48) {
      throw new Error(
        `Invalid nonce length: expected 48 hex chars (24 bytes), got ${hexNonce.length}.`,
      );
    }

    if (hexCt.length < 32) {
      throw new Error("Invalid ciphertext length: missing minimum Poly1305 MAC tag (16 bytes).");
    }

    try {
      const nonce = sodium.from_hex(hexNonce);
      const ciphertextWithMac = sodium.from_hex(hexCt);

      const decrypted = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ciphertextWithMac,
        aad,
        nonce,
        keyBytes,
        "text",
      );

      return decrypted;
    } catch {
      throw new Error("Decryption failed: MAC verification failed or invalid AAD/ciphertext.");
    }
  }
}
