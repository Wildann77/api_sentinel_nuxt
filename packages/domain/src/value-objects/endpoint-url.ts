import { ValidationException } from "../errors/domain-exception.js";
import { NetworkPolicy, parseIpv4, parseIpv6 } from "../services/network-policy.js";

const MAX_URL_LENGTH = 2048;

export class EndpointUrl {
  public readonly value: string;
  public readonly protocol: "http:" | "https:";
  public readonly scheme: "http" | "https";
  public readonly hostname: string;
  public readonly port: number | null;
  public readonly host: string;
  public readonly pathname: string;
  public readonly search: string;
  public readonly origin: string;
  public readonly isIpLiteral: boolean;

  constructor(rawUrl: string) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      throw new ValidationException("URL tidak boleh kosong.", [
        { name: "url", reason: "URL wajib diisi dan tidak boleh kosong." },
      ]);
    }

    const trimmed = rawUrl.trim();

    if (trimmed.length > MAX_URL_LENGTH) {
      throw new ValidationException(
        `Panjang URL melebihi batas maksimum ${MAX_URL_LENGTH} karakter.`,
        [
          {
            name: "url",
            reason: `Panjang URL (${trimmed.length}) melebihi batas maksimum ${MAX_URL_LENGTH} karakter.`,
          },
        ],
      );
    }

    // Tolak userinfo (user:pass@)
    const hasUserInfo = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]*@[^/?#]*/.test(trimmed);
    if (hasUserInfo) {
      throw new ValidationException("Kredensial pengguna dalam URL dilarang.", [
        {
          name: "url",
          reason: "URL target tidak boleh mengandung kredensial pengguna (userinfo).",
        },
      ]);
    }

    // Tolak authority kosong (misal: http:///path)
    if (/^https?:\/\/\//i.test(trimmed)) {
      throw new ValidationException("Hostname URL tidak boleh kosong.", [
        { name: "url", reason: "Hostname URL tidak boleh kosong." },
      ]);
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new ValidationException(`Format URL tidak valid: "${rawUrl}"`, [
        { name: "url", reason: "Format URL tidak dapat diparsing." },
      ]);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new ValidationException(
        `Skema protokol "${parsed.protocol}" tidak didukung. Hanya HTTP dan HTTPS yang diizinkan.`,
        [
          {
            name: "url",
            reason: `Skema protokol tidak didukung: ${parsed.protocol}. Hanya HTTP dan HTTPS yang diizinkan.`,
          },
        ],
      );
    }

    if (!parsed.hostname) {
      throw new ValidationException("Hostname URL tidak boleh kosong.", [
        { name: "url", reason: "Hostname URL tidak boleh kosong." },
      ]);
    }

    // Ekstrak apakah URL menggunakan literal IPv6 berkurung
    const rawIpv6Match = trimmed.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\[([^\]]+)\]/);
    const isBracketedIpv6 = rawIpv6Match !== null;

    let cleanHostname = parsed.hostname;
    if (cleanHostname.startsWith("[") && cleanHostname.endsWith("]")) {
      cleanHostname = cleanHostname.slice(1, -1);
    }

    const rawHostCandidate = isBracketedIpv6
      ? (rawIpv6Match[1] ?? cleanHostname)
      : (trimmed.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#:]+)/)?.[1] ?? cleanHostname);

    // Evaluasi kebijakan localhost / loopback
    if (NetworkPolicy.isLocalhost(cleanHostname) || NetworkPolicy.isLocalhost(rawHostCandidate)) {
      throw new ValidationException("URL target berada pada rentang subnet privat yang dilarang.", [
        {
          name: "url",
          reason: "Hostname localhost atau *.localhost diblokir oleh kebijakan SSRF.",
        },
      ]);
    }

    // Cek apakah hostname adalah IP literal (IPv4 atau IPv6)
    let isV4 = false;
    let isV6 = false;

    if (isBracketedIpv6) {
      isV6 = parseIpv6(cleanHostname) !== null || parseIpv6(rawHostCandidate) !== null;
    } else {
      isV4 = parseIpv4(cleanHostname) !== null || parseIpv4(rawHostCandidate) !== null;
      isV6 = parseIpv6(cleanHostname) !== null || parseIpv6(rawHostCandidate) !== null;
    }

    this.isIpLiteral = isV4 || isV6;

    if (this.isIpLiteral) {
      const blockedReason =
        NetworkPolicy.findBlockedReason(cleanHostname) ??
        NetworkPolicy.findBlockedReason(rawHostCandidate);

      if (blockedReason !== null) {
        throw new ValidationException(
          "URL target berada pada rentang subnet privat yang dilarang.",
          [{ name: "url", reason: blockedReason }],
        );
      }
    }

    this.protocol = parsed.protocol as "http:" | "https:";
    this.scheme = this.protocol === "http:" ? "http" : "https";
    this.hostname = cleanHostname.toLowerCase();
    this.port = parsed.port ? Number.parseInt(parsed.port, 10) : null;
    this.pathname = parsed.pathname || "/";
    this.search = parsed.search || "";

    const formattedHost = isV6 ? `[${this.hostname}]` : this.hostname;
    this.host = this.port ? `${formattedHost}:${this.port}` : formattedHost;
    this.origin = `${this.protocol}//${this.host}`;
    this.value = `${this.origin}${this.pathname}${this.search}`;
  }

  public static create(url: string): EndpointUrl {
    return new EndpointUrl(url);
  }

  public static fromString(url: string): EndpointUrl {
    return new EndpointUrl(url);
  }

  public static parse(url: string): EndpointUrl {
    return new EndpointUrl(url);
  }

  public static tryParse(url: string): EndpointUrl | null {
    try {
      return new EndpointUrl(url);
    } catch {
      return null;
    }
  }

  public equals(other: EndpointUrl | null | undefined): boolean {
    if (!other) {
      return false;
    }
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }

  public toJSON(): string {
    return this.value;
  }
}
