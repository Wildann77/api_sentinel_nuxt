import * as net from "node:net";
import type { H3Event } from "h3";
import { getHeader, getRequestIP } from "h3";

export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return "127.0.0.1";
  const trimmed = ip.trim();
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice(7);
  }
  return trimmed;
}

function parseIpv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (let i = 0; i < 4; i++) {
    const part = Number(parts[i]);
    if (Number.isNaN(part) || part < 0 || part > 255) return null;
    num = (num << 8) | part;
  }
  return num >>> 0;
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const normIp = normalizeIp(ip);
  const normCidr = cidr.trim();

  if (!normCidr.includes("/")) {
    return normIp === normalizeIp(normCidr);
  }

  const [rangeIp, prefixStr] = normCidr.split("/");
  if (!rangeIp || !prefixStr) return false;

  const prefix = Number.parseInt(prefixStr, 10);
  const ipVersion = net.isIP(normIp);
  const rangeVersion = net.isIP(normalizeIp(rangeIp));

  if (ipVersion !== rangeVersion || ipVersion === 0) {
    return false;
  }

  if (ipVersion === 4) {
    const ipNum = parseIpv4ToNumber(normIp);
    const rangeNum = parseIpv4ToNumber(normalizeIp(rangeIp));
    if (ipNum === null || rangeNum === null) return false;
    if (prefix < 0 || prefix > 32) return false;
    if (prefix === 0) return true;
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (rangeNum & mask);
  }

  // IPv6 simple match (or exact if prefix 128)
  if (prefix === 128) {
    return normIp === normalizeIp(rangeIp);
  }
  return normIp === normalizeIp(rangeIp);
}

export function isTrustedProxy(ip: string, trustedProxies: readonly string[]): boolean {
  const normalized = normalizeIp(ip);
  for (const proxy of trustedProxies) {
    if (isIpInCidr(normalized, proxy)) {
      return true;
    }
  }
  return false;
}

export function parseTrustedProxies(trustedProxiesStr: string): string[] {
  return trustedProxiesStr
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function extractClientIp(event: H3Event, trustedProxiesConfig: string): string {
  const trustedProxies = parseTrustedProxies(trustedProxiesConfig);
  const rawRemoteAddress =
    event.node?.req?.socket?.remoteAddress ||
    getRequestIP(event, { xForwardedFor: false }) ||
    "127.0.0.1";
  const remoteIp = normalizeIp(rawRemoteAddress);

  if (!isTrustedProxy(remoteIp, trustedProxies)) {
    return remoteIp;
  }

  const xff = getHeader(event, "x-forwarded-for");
  if (!xff) {
    return remoteIp;
  }

  const hops = xff
    .split(",")
    .map((hop) => normalizeIp(hop))
    .filter((hop) => hop.length > 0);

  if (hops.length === 0) {
    return remoteIp;
  }

  // Walk backwards from right to left: skip trusted proxies, pick first untrusted hop
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i];
    if (hop && !isTrustedProxy(hop, trustedProxies)) {
      return hop;
    }
  }

  // All hops in chain are trusted, return the leftmost original client hop
  return hops[0] ?? remoteIp;
}
