import type { CipherPort } from "../ports/out/cipher.port.js";

export interface FakeCipherRecord {
  readonly plainText: string;
  readonly aad: string;
}

export class FakeCipher implements CipherPort {
  public encryptions: FakeCipherRecord[] = [];

  public async encrypt(plainText: string, aad: string): Promise<string> {
    this.encryptions.push({ plainText, aad });
    const payload = JSON.stringify({ plainText, aad });
    let hexCt = Buffer.from(payload, "utf-8").toString("hex");
    if (hexCt.length < 32) {
      hexCt = hexCt.padEnd(32, "0");
    }
    const mockNonce = "0".repeat(48);
    return `v1:mock:${mockNonce}:${hexCt}`;
  }

  public async decrypt(cipherText: string, aad: string): Promise<string> {
    if (cipherText.startsWith("v1:mock:") && cipherText.split(":").length === 3) {
      const base64Content = cipherText.slice("v1:mock:".length);
      const decodedJson = Buffer.from(base64Content, "base64").toString("utf-8");
      const payload = JSON.parse(decodedJson) as { plainText: string; aad: string };
      if (payload.aad !== aad) {
        throw new Error(
          `FakeCipher AEAD verification failed: expected AAD "${payload.aad}", got "${aad}"`,
        );
      }
      return payload.plainText;
    }

    const parts = cipherText.split(":");
    if (parts.length !== 4 || parts[0] !== "v1") {
      throw new Error("Invalid mock cipher format: expected 'v1:mock:<hexNonce 48>:<hexCt>'");
    }

    const hexCt = parts[3] ?? "";
    const decodedJson = Buffer.from(hexCt, "hex").toString("utf-8");
    const payload = JSON.parse(decodedJson) as { plainText: string; aad: string };

    if (payload.aad !== aad) {
      throw new Error(
        `FakeCipher AEAD verification failed: expected AAD "${payload.aad}", got "${aad}"`,
      );
    }

    return payload.plainText;
  }
}
