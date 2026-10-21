import { describe, expect, it } from "vitest";
import { NodeArgon2HasherAdapter } from "../src/crypto/node-argon2-hasher.adapter.js";

describe("P5.3 — NodeArgon2HasherAdapter Unit & Timing Test", () => {
  it("hashes password with Argon2id and verifies valid and invalid passwords", async () => {
    // Use smaller memory and time cost for fast unit test
    const hasher = new NodeArgon2HasherAdapter({
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const plain = "SuperSecretPassword123!";
    const hash = await hasher.hash(plain);

    expect(hash.startsWith("$argon2id$")).toBe(true);

    const valid = await hasher.verify(plain, hash);
    expect(valid).toBe(true);

    const invalid = await hasher.verify("WrongPassword123!", hash);
    expect(invalid).toBe(false);

    expect(await hasher.verify("", hash)).toBe(false);
    expect(await hasher.verify(plain, "corrupted_hash")).toBe(false);
  });

  it("verifyDummy returns false", async () => {
    const hasher = new NodeArgon2HasherAdapter();
    const result = await hasher.verifyDummy();
    expect(result).toBe(false);
  });

  it("timing comparison: dummy verification duration is in same magnitude as real hash verification (anti user enumeration)", async () => {
    const hasher = new NodeArgon2HasherAdapter();
    const sampleHash = await hasher.hash("test_password_for_timing");

    // Warm-up JIT and NAPI
    await hasher.verify("wrong", sampleHash);
    await hasher.verifyDummy();

    const t0 = performance.now();
    await hasher.verify("wrong_password_attempt", sampleHash);
    const realVerifyTime = performance.now() - t0;

    const t1 = performance.now();
    await hasher.verifyDummy();
    const dummyVerifyTime = performance.now() - t1;

    expect(realVerifyTime).toBeGreaterThan(0);
    expect(dummyVerifyTime).toBeGreaterThan(0);

    // Timing ratio should not differ by orders of magnitude (ratio < 4x)
    const ratio =
      Math.max(realVerifyTime, dummyVerifyTime) / Math.min(realVerifyTime, dummyVerifyTime);
    expect(ratio).toBeLessThan(4.0);
  });
});
