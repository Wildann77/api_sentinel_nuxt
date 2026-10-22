import { describe, expect, it } from "vitest";
import { APPLICATION_VERSION } from "../src/index.js";

describe("Application Layer Harness", () => {
  it("runs unit tests for use cases and orchestrators", () => {
    expect(APPLICATION_VERSION).toBe("0.1.0");
  });
});
