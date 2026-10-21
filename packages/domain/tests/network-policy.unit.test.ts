import { describe, expect, it } from "vitest";
import {
  BLOCKED_CIDR_RANGES,
  BLOCKED_IPV4_CIDRS,
  BLOCKED_IPV6_CIDRS,
  formatIpv4,
  NetworkPolicy,
  parseIpv4,
  parseIpv6,
  SSRFBlockedException,
} from "../src/index.js";

describe("P2.2 — NetworkPolicy (CIDR matcher murni)", () => {
  describe("CIDR list completeness", () => {
    it("contains exactly 15 IPv4 CIDR entries and 10 IPv6 CIDR entries", () => {
      expect(BLOCKED_IPV4_CIDRS).toHaveLength(15);
      expect(BLOCKED_IPV6_CIDRS).toHaveLength(10);
      expect(BLOCKED_CIDR_RANGES).toHaveLength(25);
    });
  });

  describe("Custom IPv4 Parser", () => {
    it("parses standard dotted decimal", () => {
      expect(parseIpv4("127.0.0.1")).toBe(0x7f000001n);
      expect(formatIpv4(0x7f000001n)).toBe("127.0.0.1");
    });

    it("parses non-standard octal representation", () => {
      expect(parseIpv4("0177.0.0.1")).toBe(0x7f000001n);
      expect(parseIpv4("0177.0.0.01")).toBe(0x7f000001n);
    });

    it("parses non-standard hex representation", () => {
      expect(parseIpv4("0x7f000001")).toBe(0x7f000001n);
      expect(parseIpv4("0x7f.0.0.1")).toBe(0x7f000001n);
    });

    it("parses non-standard decimal dword representation", () => {
      expect(parseIpv4("2130706433")).toBe(0x7f000001n);
    });

    it("parses shorthand representations (1, 2, 3 parts)", () => {
      expect(parseIpv4("127.1")).toBe(0x7f000001n); // 2 parts: 127.0.0.1
      expect(parseIpv4("127.0.1")).toBe(0x7f000001n); // 3 parts: 127.0.0.1
      expect(parseIpv4("0")).toBe(0n); // 1 part: 0.0.0.0
    });

    it("returns null for malformed IPv4 inputs", () => {
      expect(parseIpv4("")).toBe(null);
      expect(parseIpv4("256.0.0.1")).toBe(null);
      expect(parseIpv4("1.2.3.4.5")).toBe(null);
      expect(parseIpv4("1.2.3.foo")).toBe(null);
      expect(parseIpv4("08.0.0.1")).toBe(null); // Invalid octal digit
      expect(parseIpv4("4294967296")).toBe(null); // Overflow 32-bit
    });
  });

  describe("Custom IPv6 Parser", () => {
    it("parses standard and compressed addresses", () => {
      expect(parseIpv6("::1")).toBe(1n);
      expect(parseIpv6("::")).toBe(0n);
      expect(parseIpv6("[::1]")).toBe(1n);
      expect(parseIpv6("fe80::1%eth0")).toBe(0xfe800000000000000000000000000001n);
    });

    it("parses IPv4-embedded IPv6", () => {
      expect(parseIpv6("::ffff:127.0.0.1")).toBe(0xffff7f000001n);
      expect(parseIpv6("64:ff9b::127.0.0.1")).toBe(
        (0x64n << 112n) | (0xff9bn << 96n) | 0x7f000001n,
      );
    });

    it("returns null for malformed IPv6 inputs", () => {
      expect(parseIpv6("")).toBe(null);
      expect(parseIpv6(":::1")).toBe(null);
      expect(parseIpv6("::1::1")).toBe(null);
      expect(parseIpv6("1200::ABXX")).toBe(null);
      expect(parseIpv6("1:2:3:4:5:6:7:8:9")).toBe(null);
    });
  });

  describe("IPv4 CIDR Ranges Boundary Validation (15 Ranges)", () => {
    const testCases: Array<{ cidr: string; inside: string; outside: string }> = [
      { cidr: "0.0.0.0/8", inside: "0.0.0.1", outside: "1.0.0.1" },
      { cidr: "10.0.0.0/8", inside: "10.254.1.1", outside: "11.0.0.1" },
      { cidr: "100.64.0.0/10", inside: "100.64.0.1", outside: "100.128.0.1" },
      { cidr: "127.0.0.0/8", inside: "127.0.0.1", outside: "128.0.0.1" },
      { cidr: "169.254.0.0/16", inside: "169.254.169.254", outside: "169.255.0.1" },
      { cidr: "172.16.0.0/12", inside: "172.31.255.254", outside: "172.32.0.1" },
      { cidr: "192.0.0.0/24", inside: "192.0.0.1", outside: "192.0.1.1" },
      { cidr: "192.0.2.0/24", inside: "192.0.2.1", outside: "192.0.3.1" },
      { cidr: "192.168.0.0/16", inside: "192.168.1.1", outside: "192.169.1.1" },
      { cidr: "198.18.0.0/15", inside: "198.19.255.254", outside: "198.20.0.1" },
      { cidr: "198.51.100.0/24", inside: "198.51.100.1", outside: "198.51.101.1" },
      { cidr: "203.0.113.0/24", inside: "203.0.113.1", outside: "203.0.114.1" },
      { cidr: "224.0.0.0/4", inside: "224.0.0.1", outside: "223.255.255.254" },
      { cidr: "240.0.0.0/4", inside: "240.0.0.1", outside: "223.0.0.1" },
      { cidr: "255.255.255.255/32", inside: "255.255.255.255", outside: "223.255.255.254" },
    ];

    for (const { cidr, inside, outside } of testCases) {
      it(`evaluates boundary for IPv4 CIDR ${cidr}`, () => {
        expect(NetworkPolicy.isAllowed(inside)).toBe(false);
        expect(NetworkPolicy.findBlockedReason(inside)).toContain(cidr);
        expect(NetworkPolicy.isAllowed(outside)).toBe(true);
      });
    }
  });

  describe("IPv6 CIDR Ranges Boundary Validation (10 Ranges)", () => {
    it("evaluates ::/128 (Unspecified)", () => {
      expect(NetworkPolicy.isAllowed("::")).toBe(false);
      expect(NetworkPolicy.findBlockedReason("::")).toContain("::/128");
    });

    it("evaluates ::1/128 (Loopback)", () => {
      expect(NetworkPolicy.isAllowed("::1")).toBe(false);
      expect(NetworkPolicy.findBlockedReason("::1")).toContain("::1/128");
    });

    it("evaluates ::ffff:0:0/96 (IPv4-mapped IPv6 normalized to IPv4)", () => {
      // Embedded 127.0.0.1 is blocked via 127.0.0.0/8
      expect(NetworkPolicy.isAllowed("::ffff:127.0.0.1")).toBe(false);
      expect(NetworkPolicy.findBlockedReason("::ffff:127.0.0.1")).toContain("127.0.0.0/8");

      // Embedded 8.8.8.8 (public IPv4) is allowed
      expect(NetworkPolicy.isAllowed("::ffff:8.8.8.8")).toBe(true);
    });

    it("evaluates 64:ff9b::/96 (NAT64 RFC 6052)", () => {
      expect(NetworkPolicy.isAllowed("64:ff9b::127.0.0.1")).toBe(false);
      expect(NetworkPolicy.isAllowed("64:ff9b::8.8.8.8")).toBe(false);
      expect(NetworkPolicy.findBlockedReason("64:ff9b::8.8.8.8")).toContain("64:ff9b::/96");
    });

    it("evaluates 2001:db8::/32 (Documentation RFC 3849)", () => {
      expect(NetworkPolicy.isAllowed("2001:db8::1")).toBe(false);
      expect(NetworkPolicy.findBlockedReason("2001:db8::1")).toContain("2001:db8::/32");
    });

    it("evaluates 2002::/16 (6to4 RFC 3056)", () => {
      // 2002:7f00:0001:: has embedded 127.0.0.1
      expect(NetworkPolicy.isAllowed("2002:7f00:0001::")).toBe(false);
      expect(NetworkPolicy.findBlockedReason("2002:7f00:0001::")).toContain("127.0.0.0/8");
      // Other 6to4 is blocked by 2002::/16
      expect(NetworkPolicy.isAllowed("2002:0808:0808::")).toBe(false);
      expect(NetworkPolicy.findBlockedReason("2002:0808:0808::")).toContain("2002::/16");
    });

    it("evaluates fc00::/7 (Unique Local Address RFC 4193)", () => {
      expect(NetworkPolicy.isAllowed("fc00::1")).toBe(false);
      expect(NetworkPolicy.isAllowed("fd12:3456:789a::1")).toBe(false);
      expect(NetworkPolicy.findBlockedReason("fc00::1")).toContain("fc00::/7");
    });

    it("evaluates fe80::/10 (Link-Local Unicast RFC 4291)", () => {
      expect(NetworkPolicy.isAllowed("fe80::1")).toBe(false);
      expect(NetworkPolicy.findBlockedReason("fe80::1")).toContain("fe80::/10");
    });

    it("evaluates ff00::/8 (Multicast RFC 4291)", () => {
      expect(NetworkPolicy.isAllowed("ff02::1")).toBe(false);
      expect(NetworkPolicy.findBlockedReason("ff02::1")).toContain("ff00::/8");
    });

    it("evaluates fd00:ec2::254/128 (AWS IMDSv6)", () => {
      expect(NetworkPolicy.isAllowed("fd00:ec2::254")).toBe(false);
      expect(NetworkPolicy.findBlockedReason("fd00:ec2::254")).toContain("fd00:ec2::254/128");
    });
  });

  describe("Non-standard numeric IP representations", () => {
    it("blocks decimal, hex, and octal representations of loopback/private IPs", () => {
      expect(NetworkPolicy.isAllowed("0177.0.0.1")).toBe(false);
      expect(NetworkPolicy.isAllowed("2130706433")).toBe(false);
      expect(NetworkPolicy.isAllowed("0x7f000001")).toBe(false);
      expect(NetworkPolicy.isAllowed("127.1")).toBe(false);
      expect(NetworkPolicy.isAllowed("127.0.1")).toBe(false);
    });

    it("allows non-standard representations of public IPs", () => {
      // 0x08080808 = 8.8.8.8
      expect(NetworkPolicy.isAllowed("0x08080808")).toBe(true);
      expect(NetworkPolicy.isAllowed("8.8.8.8")).toBe(true);
    });
  });

  describe("Localhost validation", () => {
    it("blocks localhost and subdomains of localhost", () => {
      expect(NetworkPolicy.findBlockedReason("")).toContain("tidak boleh kosong");
      expect(NetworkPolicy.isLocalhost("localhost")).toBe(true);
      expect(NetworkPolicy.isLocalhost("foo.localhost")).toBe(true);
      expect(NetworkPolicy.isLocalhost("api.sentinel.localhost")).toBe(true);
      expect(NetworkPolicy.isLocalhost("localhost.example.com")).toBe(false);
      expect(NetworkPolicy.isAllowed("localhost")).toBe(false);
      expect(NetworkPolicy.isAllowed("foo.localhost")).toBe(false);
    });
  });

  describe("assertAllowed method", () => {
    it("allows valid public IPs", () => {
      expect(() => NetworkPolicy.assertAllowed("8.8.8.8")).not.toThrow();
      expect(() => NetworkPolicy.assertAllowed(["1.1.1.1", "93.184.216.34"])).not.toThrow();
    });

    it("throws SSRFBlockedException if any IP in list is blocked", () => {
      expect(() => NetworkPolicy.assertAllowed("127.0.0.1")).toThrow(SSRFBlockedException);
      expect(() => NetworkPolicy.assertAllowed(["8.8.8.8", "192.168.1.1", "1.1.1.1"])).toThrow(
        SSRFBlockedException,
      );
    });
  });
});
