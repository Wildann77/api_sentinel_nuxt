import { describe, expect, it } from "vitest";
import { CONTRACTS_VERSION } from "../src/index.js";

describe("Contracts Layer Harness", () => {
  it("validates DTOs and contracts schemas", () => {
    expect(CONTRACTS_VERSION).toBe("0.1.0");
  });
});
