import { describe, expect, it } from "vitest";
import {
  extractClientIp,
  isIpInCidr,
  isTrustedProxy,
  normalizeIp,
  parseTrustedProxies,
} from "../server/utils/client-ip.js";

describe("P7.5 — Client IP & Trusted Proxies Utility", () => {
  it("normalizes IPv4-mapped IPv6 address", () => {
    expect(normalizeIp("::ffff:192.168.1.1")).toBe("192.168.1.1");
    expect(normalizeIp("127.0.0.1")).toBe("127.0.0.1");
    expect(normalizeIp("::1")).toBe("::1");
  });

  it("checks CIDR matching correctly", () => {
    expect(isIpInCidr("10.5.2.1", "10.0.0.0/8")).toBe(true);
    expect(isIpInCidr("192.168.1.100", "192.168.0.0/16")).toBe(true);
    expect(isIpInCidr("172.16.50.1", "172.16.0.0/12")).toBe(true);
    expect(isIpInCidr("8.8.8.8", "10.0.0.0/8")).toBe(false);
    expect(isIpInCidr("127.0.0.1", "127.0.0.1")).toBe(true);
    expect(isIpInCidr("127.0.0.2", "127.0.0.1")).toBe(false);
    expect(isIpInCidr("::1", "::1")).toBe(true);
  });

  it("identifies trusted proxies from config list", () => {
    const trusted = parseTrustedProxies("127.0.0.1, ::1, 10.0.0.0/8");
    expect(isTrustedProxy("127.0.0.1", trusted)).toBe(true);
    expect(isTrustedProxy("::1", trusted)).toBe(true);
    expect(isTrustedProxy("10.100.1.5", trusted)).toBe(true);
    expect(isTrustedProxy("203.0.113.195", trusted)).toBe(false);
  });

  it("ignores X-Forwarded-For if socket remote IP is not trusted", () => {
    const mockEvent = {
      node: {
        req: {
          socket: { remoteAddress: "203.0.113.50" },
          headers: { "x-forwarded-for": "198.51.100.22" },
        },
      },
    } as unknown as H3Event;

    const ip = extractClientIp(mockEvent, "127.0.0.1,::1");
    expect(ip).toBe("203.0.113.50");
  });

  it("extracts client IP from X-Forwarded-For when socket is trusted proxy", () => {
    const mockEvent = {
      node: {
        req: {
          socket: { remoteAddress: "127.0.0.1" },
          headers: { "x-forwarded-for": "203.0.113.50, 10.0.0.1" },
        },
      },
    } as unknown as H3Event;

    const ip = extractClientIp(mockEvent, "127.0.0.1,::1,10.0.0.0/8");
    expect(ip).toBe("203.0.113.50");
  });
});
