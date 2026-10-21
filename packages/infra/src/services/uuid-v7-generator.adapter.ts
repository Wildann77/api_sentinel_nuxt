import { getRandomValues } from "node:crypto";
import type { IdGeneratorPort } from "@sentinel/application";

/**
 * UuidV7GeneratorAdapter implements IdGeneratorPort using pure TypeScript and node:crypto.
 * Generates RFC 9562 compliant monotonic UUIDv7 identifiers.
 */
export class UuidV7GeneratorAdapter implements IdGeneratorPort {
  private lastMs = 0;
  private sequence = 0;

  public generate(): string {
    let nowMs = Date.now();

    if (nowMs <= this.lastMs) {
      this.sequence += 1;
      if (this.sequence > 0x0fff) {
        this.lastMs += 1;
        this.sequence = 0;
      }
      nowMs = this.lastMs;
    } else {
      this.lastMs = nowMs;
      // Initialize sequence with 10 random bits to allow up to 3000+ collisions per ms before overflow
      const randSeed = new Uint16Array(1);
      getRandomValues(randSeed);
      const seedVal = randSeed[0] ?? 0;
      this.sequence = seedVal & 0x03ff;
    }

    // 48-bit timestamp hex (12 hex digits)
    const timeHex = nowMs.toString(16).padStart(12, "0");
    const timeHigh = timeHex.slice(0, 8);
    const timeMid = timeHex.slice(8, 12);

    // 4-bit version (0x7) + 12-bit sequence
    const verSeq = ((0x7 << 12) | (this.sequence & 0x0fff)).toString(16).padStart(4, "0");

    // 8 random bytes for variant (2 bits '10') + 62 random bits
    const randBytes = new Uint8Array(8);
    getRandomValues(randBytes);

    // RFC 9562 variant: 0b10xxxxxx
    const firstByte = randBytes[0] ?? 0;
    randBytes[0] = (firstByte & 0x3f) | 0x80;

    const varRandHex = Array.from(randBytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const varRandPart1 = varRandHex.slice(0, 4);
    const varRandPart2 = varRandHex.slice(4, 16);

    return `${timeHigh}-${timeMid}-${verSeq}-${varRandPart1}-${varRandPart2}`;
  }
}
