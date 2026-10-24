import { ValidationException } from "../errors/domain-exception.js";

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class UUIDv7 {
  public readonly value: string;

  constructor(value: string) {
    const trimmed = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!UUID_V7_REGEX.test(trimmed)) {
      throw new ValidationException(`Format UUIDv7 tidak valid: "${value}"`, [
        { name: "uuid", reason: "Nilai harus berupa format UUID v7 yang valid (RFC 9562)." },
      ]);
    }
    this.value = trimmed;
  }

  public static fromString(value: string): UUIDv7 {
    return new UUIDv7(value);
  }

  public static isValid(value: unknown): value is string {
    return typeof value === "string" && UUID_V7_REGEX.test(value.trim());
  }

  public getTimestampMs(): number {
    const hex = this.value.slice(0, 8) + this.value.slice(9, 13);
    return Number.parseInt(hex, 16);
  }

  public getTimestamp(): Date {
    return new Date(this.getTimestampMs());
  }

  public equals(other: UUIDv7 | null | undefined): boolean {
    if (!other) {
      return false;
    }
    return this.value === other.value;
  }

  public compareTo(other: UUIDv7): number {
    return this.value.localeCompare(other.value);
  }

  public toString(): string {
    return this.value;
  }

  public toJSON(): string {
    return this.value;
  }
}
