import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_NAME,
  signCookieValue,
  verifySignedCookie,
} from "../server/utils/session-cookie.js";

describe("P7.5 — Session Cookie Utility", () => {
  const secret = "super-secret-key-that-is-at-least-32-chars-long";
  const token = "a".repeat(64); // 256-bit hex token

  it("signs and verifies cookie value accurately", () => {
    const signed = signCookieValue(token, secret);
    expect(signed).toContain(".");
    expect(signed.startsWith(token)).toBe(true);

    const verified = verifySignedCookie(signed, secret);
    expect(verified).toBe(token);
  });

  it("rejects tampered cookie value", () => {
    const signed = signCookieValue(token, secret);
    const tampered = signed.replace("a", "b");

    const verified = verifySignedCookie(tampered, secret);
    expect(verified).toBeNull();
  });

  it("rejects signature signed with different secret", () => {
    const signed = signCookieValue(token, secret);
    const wrongSecret = "another-secret-key-at-least-32-characters-long";

    const verified = verifySignedCookie(signed, wrongSecret);
    expect(verified).toBeNull();
  });

  it("rejects plain unsigned cookie value", () => {
    expect(verifySignedCookie(token, secret)).toBeNull();
    expect(verifySignedCookie("", secret)).toBeNull();
  });

  it("exports correct cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("sentinel_session");
  });
});
