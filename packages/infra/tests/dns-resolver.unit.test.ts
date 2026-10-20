import { SSRFBlockedException } from "@sentinel/domain";
import { describe, expect, it } from "vitest";
import {
  cleanDnsHostname,
  type DnsLookupFunctions,
  DnsResolutionException,
  resolveDnsWithSsrfCheck,
} from "../src/network/dns-resolver.js";

describe("P6.2 — DnsResolver Unit Tests", () => {
  describe("cleanDnsHostname", () => {
    it("trims, removes brackets, removes trailing dot, and lowercases hostname", () => {
      expect(cleanDnsHostname("  EXAMPLE.COM.  ")).toBe("example.com");
      expect(cleanDnsHostname("[2001:db8::1]")).toBe("2001:db8::1");
      expect(cleanDnsHostname("api.service.internal.")).toBe("api.service.internal");
    });
  });

  describe("IP Literals validation", () => {
    it("allows valid public IPv4 literal without invoking DNS lookup", async () => {
      const result = await resolveDnsWithSsrfCheck("1.1.1.1");
      expect(result.isLiteralIp).toBe(true);
      expect(result.pinnedIp).toBe("1.1.1.1");
      expect(result.resolvedIps).toEqual(["1.1.1.1"]);
      expect(result.dnsDurationMs).toBe(0);
    });

    it("allows valid public IPv6 literal without invoking DNS lookup", async () => {
      const result = await resolveDnsWithSsrfCheck("[2606:4700:4700::1111]");
      expect(result.isLiteralIp).toBe(true);
      expect(result.pinnedIp).toBe("2606:4700:4700::1111");
      expect(result.resolvedIps).toEqual(["2606:4700:4700::1111"]);
      expect(result.dnsDurationMs).toBe(0);
    });

    it("throws SSRFBlockedException for private loopback literal", async () => {
      expect(resolveDnsWithSsrfCheck("127.0.0.1")).rejects.toThrow(SSRFBlockedException);
      expect(resolveDnsWithSsrfCheck("::1")).rejects.toThrow(SSRFBlockedException);
    });

    it("throws SSRFBlockedException for cloud metadata literal", async () => {
      expect(resolveDnsWithSsrfCheck("169.254.169.254")).rejects.toThrow(SSRFBlockedException);
    });

    it("throws SSRFBlockedException for RFC 1918 private literals", async () => {
      expect(resolveDnsWithSsrfCheck("10.0.0.5")).rejects.toThrow(SSRFBlockedException);
      expect(resolveDnsWithSsrfCheck("192.168.1.1")).rejects.toThrow(SSRFBlockedException);
      expect(resolveDnsWithSsrfCheck("172.16.0.1")).rejects.toThrow(SSRFBlockedException);
    });
  });

  describe("Localhost validation", () => {
    it("throws SSRFBlockedException for localhost and *.localhost domains", async () => {
      expect(resolveDnsWithSsrfCheck("localhost")).rejects.toThrow(SSRFBlockedException);
      expect(resolveDnsWithSsrfCheck("sub.localhost")).rejects.toThrow(SSRFBlockedException);
      expect(resolveDnsWithSsrfCheck("foo.bar.localhost.")).rejects.toThrow(SSRFBlockedException);
    });
  });

  describe("Multi-record DNS resolution & IP-pinning selection", () => {
    it("resolves dual-stack domain and selects IPv4 as pinnedIp", async () => {
      const mockLookup: DnsLookupFunctions = {
        resolve4: async () => ["93.184.216.34"],
        resolve6: async () => ["2606:2800:220:1:248:1893:25c8:1946"],
      };

      const result = await resolveDnsWithSsrfCheck("example.com", mockLookup);

      expect(result.isLiteralIp).toBe(false);
      expect(result.pinnedIp).toBe("93.184.216.34");
      expect(result.resolvedIps).toHaveLength(2);
      expect(result.resolvedIps).toContain("93.184.216.34");
      expect(result.resolvedIps).toContain("2606:2800:220:1:248:1893:25c8:1946");
      expect(result.dnsDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("resolves IPv6-only domain and selects IPv6 as pinnedIp", async () => {
      const mockLookup: DnsLookupFunctions = {
        resolve4: async () => {
          throw new Error("ENODATA");
        },
        resolve6: async () => ["2606:2800:220:1:248:1893:25c8:1946"],
      };

      const result = await resolveDnsWithSsrfCheck("ipv6.example.com", mockLookup);

      expect(result.pinnedIp).toBe("2606:2800:220:1:248:1893:25c8:1946");
      expect(result.resolvedIps).toEqual(["2606:2800:220:1:248:1893:25c8:1946"]);
    });

    it("deduplicates identical resolved IP addresses", async () => {
      const mockLookup: DnsLookupFunctions = {
        resolve4: async () => ["93.184.216.34", "93.184.216.34"],
        resolve6: async () => [],
      };

      const result = await resolveDnsWithSsrfCheck("dedup.example.com", mockLookup);

      expect(result.resolvedIps).toEqual(["93.184.216.34"]);
      expect(result.pinnedIp).toBe("93.184.216.34");
    });
  });

  describe("Multi-record SSRF validation (Any blocked IP fails request)", () => {
    it("rejects multi-record when one IP is public and one IP is RFC 1918 private", async () => {
      const mockLookup: DnsLookupFunctions = {
        resolve4: async () => ["93.184.216.34", "10.0.0.1"],
        resolve6: async () => [],
      };

      expect(resolveDnsWithSsrfCheck("rebinding.example.com", mockLookup)).rejects.toThrow(
        SSRFBlockedException,
      );
    });

    it("rejects multi-record when IPv6 record is link-local or loopback", async () => {
      const mockLookup: DnsLookupFunctions = {
        resolve4: async () => ["93.184.216.34"],
        resolve6: async () => ["::1"],
      };

      expect(resolveDnsWithSsrfCheck("loopback-v6.example.com", mockLookup)).rejects.toThrow(
        SSRFBlockedException,
      );
    });

    it("normalizes and rejects IPv4-mapped IPv6 records", async () => {
      const mockLookup: DnsLookupFunctions = {
        resolve4: async () => [],
        resolve6: async () => ["::ffff:10.0.0.1"],
      };

      expect(resolveDnsWithSsrfCheck("v4mapped.example.com", mockLookup)).rejects.toThrow(
        SSRFBlockedException,
      );
    });

    it("normalizes and rejects NAT64 RFC 6052 records with private IPv4", async () => {
      const mockLookup: DnsLookupFunctions = {
        resolve4: async () => [],
        resolve6: async () => ["64:ff9b::a00:1"], // 10.0.0.1 embedded
      };

      expect(resolveDnsWithSsrfCheck("nat64.example.com", mockLookup)).rejects.toThrow(
        SSRFBlockedException,
      );
    });

    it("normalizes and rejects 6to4 RFC 3056 records with private IPv4", async () => {
      const mockLookup: DnsLookupFunctions = {
        resolve4: async () => [],
        resolve6: async () => ["2002:0a00:0001::"], // 10.0.0.1 embedded
      };

      expect(resolveDnsWithSsrfCheck("6to4.example.com", mockLookup)).rejects.toThrow(
        SSRFBlockedException,
      );
    });
  });

  describe("DNS Errors and Edge Cases", () => {
    it("throws DnsResolutionException when both IPv4 and IPv6 lookups fail", async () => {
      const mockLookup: DnsLookupFunctions = {
        resolve4: async () => {
          throw new Error("ENOTFOUND nonexistent.domain");
        },
        resolve6: async () => {
          throw new Error("ENOTFOUND nonexistent.domain");
        },
      };

      expect(resolveDnsWithSsrfCheck("nonexistent.domain", mockLookup)).rejects.toThrow(
        DnsResolutionException,
      );
    });

    it("throws DnsResolutionException when no A/AAAA records are returned", async () => {
      const mockLookup: DnsLookupFunctions = {
        resolve4: async () => [],
        resolve6: async () => [],
      };

      expect(resolveDnsWithSsrfCheck("empty.domain", mockLookup)).rejects.toThrow(
        DnsResolutionException,
      );
    });

    it("throws DnsResolutionException when hostname is empty", async () => {
      expect(resolveDnsWithSsrfCheck("   ")).rejects.toThrow(DnsResolutionException);
    });
  });
});
