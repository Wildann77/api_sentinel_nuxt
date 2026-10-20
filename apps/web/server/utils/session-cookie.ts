import crypto from "node:crypto";
import { deleteCookie, getCookie, type H3Event, setCookie } from "h3";

export const SESSION_COOKIE_NAME = "sentinel_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days (Absolute TTL)

export function signCookieValue(value: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret).update(value).digest("base64url");
  return `${value}.${hmac}`;
}

export function verifySignedCookie(signedValue: string, secret: string): string | null {
  if (!signedValue || typeof signedValue !== "string") {
    return null;
  }
  const lastDotIndex = signedValue.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return null;
  }

  const rawValue = signedValue.slice(0, lastDotIndex);
  const signature = signedValue.slice(lastDotIndex + 1);
  if (!rawValue || !signature) {
    return null;
  }

  const expectedHmac = crypto.createHmac("sha256", secret).update(rawValue).digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedHmac);

  if (sigBuf.length !== expBuf.length) {
    return null;
  }

  const match = crypto.timingSafeEqual(sigBuf, expBuf);
  return match ? rawValue : null;
}

export function getSessionToken(event: H3Event, secret: string): string | null {
  const cookieVal = getCookie(event, SESSION_COOKIE_NAME);
  if (!cookieVal) {
    return null;
  }
  return verifySignedCookie(cookieVal, secret);
}

export function setSessionCookie(
  event: H3Event,
  token: string,
  secret: string,
  isSecure = false,
): void {
  const signed = signCookieValue(token, secret);
  setCookie(event, SESSION_COOKIE_NAME, signed, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecure,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE_NAME, {
    path: "/",
  });
}
