import { ValidationException } from "../errors/domain-exception.js";

const ENCRYPTED_SECRET_REGEX = /^v1:([a-zA-Z0-9_-]+):([0-9a-fA-F]{48}):([0-9a-fA-F]{32,})$/;

export class EncryptedSecret {
  public readonly value: string;
  public readonly version = "v1" as const;
  public readonly keyId: string;
  public readonly nonceHex: string;
  public readonly ciphertextWithMacHex: string;

  constructor(value: string) {
    if (typeof value !== "string") {
      throw new ValidationException(
        "Format EncryptedSecret tidak valid: nilai harus berupa string",
        [
          {
            name: "encryptedSecret",
            reason:
              "Format ciphertext rahasia harus berupa string dengan format v1:<keyId>:<hexNonce>:<hexCtMac>.",
          },
        ],
      );
    }

    const trimmed = value.trim();
    const match = ENCRYPTED_SECRET_REGEX.exec(trimmed);
    const keyId = match?.[1];
    const nonceHex = match?.[2];
    const ctMacHex = match?.[3];

    if (!match || !keyId || !nonceHex || !ctMacHex || ctMacHex.length % 2 !== 0) {
      throw new ValidationException(`Format EncryptedSecret tidak valid: "${value}"`, [
        {
          name: "encryptedSecret",
          reason:
            "Format ciphertext rahasia harus v1:<keyId>:<hexNonce 48>:<hexCtMac> dengan nonce 24 byte hex dan tag MAC 16 byte hex.",
        },
      ]);
    }

    this.value = trimmed;
    this.keyId = keyId;
    this.nonceHex = nonceHex.toLowerCase();
    this.ciphertextWithMacHex = ctMacHex.toLowerCase();
  }

  public static parse(raw: unknown): EncryptedSecret {
    if (typeof raw !== "string") {
      throw new ValidationException(
        "Format EncryptedSecret tidak valid: nilai harus berupa string",
        [
          {
            name: "encryptedSecret",
            reason:
              "Format ciphertext rahasia harus berupa string dengan format v1:<keyId>:<hexNonce>:<hexCtMac>.",
          },
        ],
      );
    }
    return new EncryptedSecret(raw);
  }

  public static isValid(raw: unknown): raw is string {
    if (typeof raw !== "string") {
      return false;
    }
    const trimmed = raw.trim();
    const match = ENCRYPTED_SECRET_REGEX.exec(trimmed);
    const ctMacHex = match?.[3];
    return Boolean(match && ctMacHex && ctMacHex.length % 2 === 0);
  }

  public equals(other: EncryptedSecret | null | undefined): boolean {
    if (!other) {
      return false;
    }
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }

  public toJSON(): string {
    return this.value;
  }
}
