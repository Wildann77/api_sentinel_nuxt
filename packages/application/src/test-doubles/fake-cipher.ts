import type { CipherPort } from "../ports/out/cipher.port.js";

export class FakeCipher implements CipherPort {
  public async encrypt(plainText: string, aad: string): Promise<string> {
    const payload = JSON.stringify({ plainText, aad });
    const encoded = Buffer.from(payload, "utf-8").toString("base64");
    return `v1:mock:${encoded}`;
  }

  public async decrypt(cipherText: string, aad: string): Promise<string> {
    if (!cipherText.startsWith("v1:mock:")) {
      throw new Error("Invalid mock cipher format: expected 'v1:mock:' prefix");
    }

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
}
