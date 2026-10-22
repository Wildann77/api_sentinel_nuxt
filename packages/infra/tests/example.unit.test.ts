import { describe, expect, it } from "vitest";
import { INFRA_VERSION } from "../src/index.js";

describe("Infra Layer Harness", () => {
  it("runs unit tests for infrastructure adapters", () => {
    expect(INFRA_VERSION).toBe("0.1.0");
  });
});
