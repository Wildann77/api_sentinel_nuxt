import { SSRFBlockedException } from "../errors/domain-exception.js";

export const BLOCKED_IPV4_CIDRS = [
  "0.0.0.0/8", // Current network RFC 1122
  "10.0.0.0/8", // Private-use RFC 1918
  "100.64.0.0/10", // Carrier-grade NAT RFC 6598
  "127.0.0.0/8", // Loopback RFC 1122
  "169.254.0.0/16", // Link-local & Cloud Metadata RFC 3927
  "172.16.0.0/12", // Private-use RFC 1918
  "192.0.0.0/24", // IETF Protocol Assignments RFC 6890
  "192.0.2.0/24", // TEST-NET-1 documentation RFC 5737
  "192.168.0.0/16", // Private-use RFC 1918
  "198.18.0.0/15", // Network benchmark tests RFC 2544
  "198.51.100.0/24", // TEST-NET-2 documentation RFC 5737
  "203.0.113.0/24", // TEST-NET-3 documentation RFC 5737
  "224.0.0.0/4", // Multicast RFC 5771
  "240.0.0.0/4", // Reserved for future use RFC 1112
  "255.255.255.255/32", // Broadcast RFC 919
] as const;

export const BLOCKED_IPV6_CIDRS = [
  "::/128", // Unspecified RFC 4291
  "::1/128", // Loopback RFC 4291
  "::ffff:0:0/96", // IPv4-mapped IPv6 (dinormalisasi ke IPv4)
  "64:ff9b::/96", // IPv4/IPv6 translation NAT64 RFC 6052
  "2001:db8::/32", // Documentation RFC 3849
  "2002::/16", // 6to4 translation RFC 3056
  "fc00::/7", // Unique local address RFC 4193
  "fe80::/10", // Link-local unicast RFC 4291
  "ff00::/8", // Multicast RFC 4291
  "fd00:ec2::254/128", // AWS IMDSv6 Metadata
] as const;

export const BLOCKED_CIDR_RANGES: readonly string[] = [
  ...BLOCKED_IPV4_CIDRS,
  ...BLOCKED_IPV6_CIDRS,
] as const;

interface ParsedCidrV4 {
  readonly version: 4;
  readonly network: bigint;
  readonly mask: bigint;
  readonly raw: string;
}

interface ParsedCidrV6 {
  readonly version: 6;
  readonly network: bigint;
  readonly mask: bigint;
  readonly raw: string;
}

function parseIpv4Part(part: string): bigint | null {
  if (part === "0") {
    return 0n;
  }
  if (/^0x[0-9a-f]+$/i.test(part)) {
    return BigInt(part);
  }
  if (/^0[0-7]+$/.test(part)) {
    return BigInt(`0o${part.slice(1)}`);
  }
  if (/^[1-9][0-9]*$/.test(part)) {
    return BigInt(part);
  }
  return null;
}

export function parseIpv4(input: string): bigint | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(".");
  if (parts.length < 1 || parts.length > 4) {
    return null;
  }

  const parsedParts: bigint[] = [];
  for (const part of parts) {
    if (!part) {
      return null;
    }
    const val = parseIpv4Part(part);
    if (val === null) {
      return null;
    }
    parsedParts.push(val);
  }

  if (parsedParts.length === 1) {
    const p0 = parsedParts[0];
    if (p0 === undefined || p0 < 0n || p0 > 0xffffffffn) {
      return null;
    }
    return p0;
  }

  if (parsedParts.length === 2) {
    const p0 = parsedParts[0];
    const p1 = parsedParts[1];
    if (
      p0 === undefined ||
      p1 === undefined ||
      p0 < 0n ||
      p0 > 0xffn ||
      p1 < 0n ||
      p1 > 0xffffffn
    ) {
      return null;
    }
    return (p0 << 24n) | p1;
  }

  if (parsedParts.length === 3) {
    const p0 = parsedParts[0];
    const p1 = parsedParts[1];
    const p2 = parsedParts[2];
    if (
      p0 === undefined ||
      p1 === undefined ||
      p2 === undefined ||
      p0 < 0n ||
      p0 > 0xffn ||
      p1 < 0n ||
      p1 > 0xffn ||
      p2 < 0n ||
      p2 > 0xffffn
    ) {
      return null;
    }
    return (p0 << 24n) | (p1 << 16n) | p2;
  }

  const p0 = parsedParts[0];
  const p1 = parsedParts[1];
  const p2 = parsedParts[2];
  const p3 = parsedParts[3];
  if (
    p0 === undefined ||
    p1 === undefined ||
    p2 === undefined ||
    p3 === undefined ||
    p0 < 0n ||
    p0 > 0xffn ||
    p1 < 0n ||
    p1 > 0xffn ||
    p2 < 0n ||
    p2 > 0xffn ||
    p3 < 0n ||
    p3 > 0xffn
  ) {
    return null;
  }

  return (p0 << 24n) | (p1 << 16n) | (p2 << 8n) | p3;
}

export function formatIpv4(ip: bigint): string {
  const p0 = (ip >> 24n) & 0xffn;
  const p1 = (ip >> 16n) & 0xffn;
  const p2 = (ip >> 8n) & 0xffn;
  const p3 = ip & 0xffn;
  return `${p0}.${p1}.${p2}.${p3}`;
}

export function parseIpv6(input: string): bigint | null {
  let s = input.trim();
  if (s.startsWith("[") && s.endsWith("]")) {
    s = s.slice(1, -1);
  }
  const zoneIndex = s.indexOf("%");
  if (zoneIndex !== -1) {
    s = s.slice(0, zoneIndex);
  }
  if (!s) {
    return null;
  }

  const lastColon = s.lastIndexOf(":");
  if (lastColon !== -1) {
    const afterColon = s.slice(lastColon + 1);
    if (afterColon.includes(".")) {
      const v4Val = parseIpv4(afterColon);
      if (v4Val === null) {
        return null;
      }
      const hi = ((v4Val >> 16n) & 0xffffn).toString(16);
      const lo = (v4Val & 0xffffn).toString(16);
      s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`;
    }
  }

  const doubleColonCount = (s.match(/::/g) || []).length;
  if (doubleColonCount > 1) {
    return null;
  }

  let hexGroups: string[] = [];
  if (doubleColonCount === 1) {
    const [leftStr = "", rightStr = ""] = s.split("::");
    const left = leftStr ? leftStr.split(":") : [];
    const right = rightStr ? rightStr.split(":") : [];
    const totalGroups = left.length + right.length;
    if (totalGroups > 7) {
      return null;
    }
    const zerosNeeded = 8 - totalGroups;
    hexGroups = [...left, ...Array<string>(zerosNeeded).fill("0"), ...right];
  } else {
    hexGroups = s.split(":");
  }

  if (hexGroups.length !== 8) {
    return null;
  }

  let ip = 0n;
  for (let i = 0; i < 8; i++) {
    const group = hexGroups[i];
    if (group === undefined || !/^[0-9a-f]{1,4}$/i.test(group)) {
      return null;
    }
    const val = BigInt(`0x${group}`);
    ip = (ip << 16n) | val;
  }

  return ip;
}

function parseCidrV4(cidr: string): ParsedCidrV4 {
  const [ipStr = "", maskStr = "32"] = cidr.split("/");
  const ip = parseIpv4(ipStr);
  if (ip === null) {
    throw new Error(`Invalid IPv4 CIDR definition: ${cidr}`);
  }
  const prefixLen = Number.parseInt(maskStr, 10);
  if (Number.isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) {
    throw new Error(`Invalid IPv4 mask length in CIDR: ${cidr}`);
  }
  const mask = prefixLen === 0 ? 0n : (0xffffffffn << BigInt(32 - prefixLen)) & 0xffffffffn;
  return {
    version: 4,
    network: ip & mask,
    mask,
    raw: cidr,
  };
}

function parseCidrV6(cidr: string): ParsedCidrV6 {
  const [ipStr = "", maskStr = "128"] = cidr.split("/");
  const ip = parseIpv6(ipStr);
  if (ip === null) {
    throw new Error(`Invalid IPv6 CIDR definition: ${cidr}`);
  }
  const prefixLen = Number.parseInt(maskStr, 10);
  if (Number.isNaN(prefixLen) || prefixLen < 0 || prefixLen > 128) {
    throw new Error(`Invalid IPv6 mask length in CIDR: ${cidr}`);
  }
  const mask = prefixLen === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefixLen)) - 1n);
  return {
    version: 6,
    network: ip & mask,
    mask,
    raw: cidr,
  };
}

// Longest-prefix match (spesifik lebih dulu)
const PARSED_V4_CIDRS: readonly ParsedCidrV4[] = [...BLOCKED_IPV4_CIDRS]
  .map(parseCidrV4)
  .sort((a, b) => (b.mask > a.mask ? 1 : b.mask < a.mask ? -1 : 0));

const PARSED_V6_CIDRS: readonly ParsedCidrV6[] = [...BLOCKED_IPV6_CIDRS]
  .map(parseCidrV6)
  .sort((a, b) => (b.mask > a.mask ? 1 : b.mask < a.mask ? -1 : 0));

const IPV4_MAPPED_V6_MASK = ((1n << 128n) - 1n) ^ ((1n << 32n) - 1n);
const IPV4_MAPPED_V6_PREFIX = 0xffffn << 32n;
const NAT64_MASK = ((1n << 128n) - 1n) ^ ((1n << 32n) - 1n);
const NAT64_PREFIX = (0x64n << 112n) | (0xff9bn << 96n);
const SIX_TO_FOUR_MASK = 0xffffn << 112n;
const SIX_TO_FOUR_PREFIX = 0x2002n << 112n;

function matchIpv4AgainstCidrs(ip: bigint): string | null {
  for (const cidr of PARSED_V4_CIDRS) {
    if ((ip & cidr.mask) === cidr.network) {
      return cidr.raw;
    }
  }
  return null;
}

function matchIpv6AgainstCidrs(ip: bigint): string | null {
  for (const cidr of PARSED_V6_CIDRS) {
    if ((ip & cidr.mask) === cidr.network) {
      return cidr.raw;
    }
  }
  return null;
}

export function isLocalhost(host: string): boolean {
  const lower = host.trim().toLowerCase();
  return lower === "localhost" || lower.endsWith(".localhost");
}

export function findBlockedReason(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return "Host tidak boleh kosong.";
  }

  if (isLocalhost(trimmed)) {
    return `Hostname "${trimmed}" adalah alamat loopback/localhost yang dilarang oleh kebijakan SSRF.`;
  }

  const v4 = parseIpv4(trimmed);
  if (v4 !== null) {
    const matched = matchIpv4AgainstCidrs(v4);
    if (matched !== null) {
      return `Alamat IPv4 ${formatIpv4(v4)} diblokir oleh kebijakan SSRF (rentang CIDR ${matched}).`;
    }
    return null;
  }

  const v6 = parseIpv6(trimmed);
  if (v6 !== null) {
    if ((v6 & IPV4_MAPPED_V6_MASK) === IPV4_MAPPED_V6_PREFIX) {
      const embeddedV4 = v6 & 0xffffffffn;
      const matchedV4 = matchIpv4AgainstCidrs(embeddedV4);
      if (matchedV4 !== null) {
        return `Alamat IPv4-mapped IPv6 (${trimmed} -> ${formatIpv4(embeddedV4)}) diblokir oleh kebijakan SSRF (rentang IPv4 CIDR ${matchedV4}).`;
      }
      return null;
    }

    if ((v6 & NAT64_MASK) === NAT64_PREFIX) {
      const embeddedV4 = v6 & 0xffffffffn;
      const matchedV4 = matchIpv4AgainstCidrs(embeddedV4);
      if (matchedV4 !== null) {
        return `Alamat NAT64 (${trimmed} -> ${formatIpv4(embeddedV4)}) diblokir oleh kebijakan SSRF (rentang IPv4 CIDR ${matchedV4}).`;
      }
      return `Alamat NAT64 (${trimmed}) diblokir oleh kebijakan SSRF (translasi RFC 6052 rentang CIDR 64:ff9b::/96).`;
    }

    if ((v6 & SIX_TO_FOUR_MASK) === SIX_TO_FOUR_PREFIX) {
      const embeddedV4 = (v6 >> 80n) & 0xffffffffn;
      const matchedV4 = matchIpv4AgainstCidrs(embeddedV4);
      if (matchedV4 !== null) {
        return `Alamat 6to4 (${trimmed} -> ${formatIpv4(embeddedV4)}) diblokir oleh kebijakan SSRF (rentang IPv4 CIDR ${matchedV4}).`;
      }
      return `Alamat 6to4 (${trimmed}) diblokir oleh kebijakan SSRF (relai RFC 3056 rentang CIDR 2002::/16).`;
    }

    const matchedV6 = matchIpv6AgainstCidrs(v6);
    if (matchedV6 !== null) {
      return `Alamat IPv6 ${trimmed} diblokir oleh kebijakan SSRF (rentang CIDR ${matchedV6}).`;
    }
    return null;
  }

  return null;
}

export function isAllowed(ipOrHost: string): boolean {
  return findBlockedReason(ipOrHost) === null;
}

export function assertAllowed(ips: string | readonly string[]): void {
  const list = Array.isArray(ips) ? ips : [ips as string];
  for (const ip of list) {
    const reason = findBlockedReason(ip);
    if (reason !== null) {
      throw new SSRFBlockedException(`Kebijakan keamanan SSRF terlanggar: ${reason}`);
    }
  }
}

export const NetworkPolicy = {
  isLocalhost,
  findBlockedReason,
  isAllowed,
  assertAllowed,
} as const;
export type NetworkPolicy = typeof NetworkPolicy;
