import { describe, expect, it } from "vitest";
import { DOMAIN_VERSION, DomainError } from "../src/index.js";

class TestDomainError extends DomainError {
  public readonly code = "TEST_ERROR";
}

describe("Domain Layer Harness", () => {
  it("runs unit tests in isolated domain environment without IO", () => {
    expect(DOMAIN_VERSION).toBe("0.1.0");
    const err = new TestDomainError("sample message");
    expect(err.message).toBe("sample message");
    expect(err.code).toBe("TEST_ERROR");
    expect(err.name).toBe("TestDomainError");
    expect(err instanceof DomainError).toBe(true);
  });
});
