import * as dns from "node:dns/promises";
import * as net from "node:net";
import { NetworkPolicy, SSRFBlockedException } from "@sentinel/domain";

export interface DnsLookupFunctions {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
}

export interface DnsResolutionResult {
  readonly resolvedIps: readonly string[];
  readonly pinnedIp: string;
  readonly dnsDurationMs: number;
  readonly isLiteralIp: boolean;
}

export class DnsResolutionException extends Error {
  readonly category = "DNS_RESOLUTION_FAILED" as const;

  constructor(
    message: string,
    public readonly hostname: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DnsResolutionException";
  }
}

const defaultLookup: DnsLookupFunctions = {
  resolve4: (hostname: string) => dns.resolve4(hostname),
  resolve6: (hostname: string) => dns.resolve6(hostname),
};

export function cleanDnsHostname(rawHostname: string): string {
  let cleaned = rawHostname.trim().toLowerCase();
  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    cleaned = cleaned.slice(1, -1);
  }
  return cleaned.replace(/\.$/, "");
}

export async function resolveDnsWithSsrfCheck(
  hostname: string,
  lookup: DnsLookupFunctions = defaultLookup,
): Promise<DnsResolutionResult> {
  const cleanHost = cleanDnsHostname(hostname);
  if (!cleanHost) {
    throw new DnsResolutionException("Hostname tidak boleh kosong", hostname);
  }

  if (net.isIP(cleanHost)) {
    const blockedReason = NetworkPolicy.findBlockedReason(cleanHost);
    if (blockedReason !== null) {
      throw new SSRFBlockedException(`Kebijakan keamanan SSRF terlanggar: ${blockedReason}`);
    }
    return {
      resolvedIps: [cleanHost],
      pinnedIp: cleanHost,
      dnsDurationMs: 0,
      isLiteralIp: true,
    };
  }

  if (NetworkPolicy.isLocalhost(cleanHost)) {
    throw new SSRFBlockedException(
      `Hostname "${cleanHost}" adalah alamat loopback/localhost yang dilarang oleh kebijakan SSRF.`,
    );
  }

  const startTime = performance.now();
  const [v4Result, v6Result] = await Promise.allSettled([
    lookup.resolve4(cleanHost),
    lookup.resolve6(cleanHost),
  ]);
  const dnsDurationMs = Math.round((performance.now() - startTime) * 100) / 100;

  if (v4Result.status === "rejected" && v6Result.status === "rejected") {
    const primaryError = v4Result.reason ?? v6Result.reason;
    const errorMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
    throw new DnsResolutionException(
      `Gagal menyelesaikan resolusi DNS untuk domain "${cleanHost}": ${errorMsg}`,
      cleanHost,
      primaryError,
    );
  }

  const v4Ips = v4Result.status === "fulfilled" ? v4Result.value : [];
  const v6Ips = v6Result.status === "fulfilled" ? v6Result.value : [];
  const allIps = Array.from(new Set([...v4Ips, ...v6Ips]));

  const pinnedIpCandidate = v4Ips[0] ?? v6Ips[0];
  if (!pinnedIpCandidate) {
    throw new DnsResolutionException(
      `Tidak ada record DNS A atau AAAA untuk domain "${cleanHost}"`,
      cleanHost,
    );
  }

  for (const ip of allIps) {
    const blockedReason = NetworkPolicy.findBlockedReason(ip);
    if (blockedReason !== null) {
      throw new SSRFBlockedException(
        `Kebijakan keamanan SSRF terlanggar: Salah satu record DNS untuk domain "${cleanHost}" (${ip}) diblokir. ${blockedReason}`,
      );
    }
  }

  return {
    resolvedIps: allIps,
    pinnedIp: pinnedIpCandidate,
    dnsDurationMs,
    isLiteralIp: false,
  };
}
