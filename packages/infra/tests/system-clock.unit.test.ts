import { describe, expect, it } from "vitest";
import { SystemClockAdapter } from "../src/services/system-clock.adapter.js";

describe("P5.1 — SystemClockAdapter Unit Test", () => {
  it("returns current Date", () => {
    const clock = new SystemClockAdapter();
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();

    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });
});
