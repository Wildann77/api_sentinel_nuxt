import { UUIDv7 } from "@sentinel/domain";
import { describe, expect, it } from "vitest";
import { UuidV7GeneratorAdapter } from "../src/services/uuid-v7-generator.adapter.js";

describe("P5.1 — UuidV7GeneratorAdapter Unit Test", () => {
  it("generates valid RFC 9562 UUIDv7 that parses into domain UUIDv7", () => {
    const generator = new UuidV7GeneratorAdapter();
    const id = generator.generate();

    expect(typeof id).toBe("string");
    expect(UUIDv7.isValid(id)).toBe(true);

    const vo = new UUIDv7(id);
    expect(vo.value).toBe(id.toLowerCase());

    const now = Date.now();
    const ts = vo.getTimestampMs();
    expect(Math.abs(now - ts)).toBeLessThan(5000);
  });

  it("maintains strict monotonic ordering across 1,000 rapid sequential generations", () => {
    const generator = new UuidV7GeneratorAdapter();
    const generated: string[] = [];

    for (let i = 0; i < 1000; i++) {
      generated.push(generator.generate());
    }

    expect(generated.length).toBe(1000);

    for (let i = 0; i < generated.length - 1; i++) {
      const current = generated[i];
      const next = generated[i + 1];

      // Lexicographical string comparison must be strictly strictly less than (<)
      expect(current < next).toBe(true);

      const voCurr = new UUIDv7(current);
      const voNext = new UUIDv7(next);
      expect(voCurr.compareTo(voNext)).toBeLessThan(0);
    }
  });
});
