import { ValidationException } from "../errors/domain-exception.js";

export const DENIED_HEADERS: readonly string[] = [
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "proxy-authorization",
] as const;

const HTTP_HEADER_TOKEN_REGEX = /^[!#$%&'*+\-.^_`|~0-9a-zA-Z]+$/;

export function isDeniedHeader(headerName: string): boolean {
  if (typeof headerName !== "string") {
    return false;
  }
  const normalized = headerName.trim().toLowerCase();
  return (DENIED_HEADERS as readonly string[]).includes(normalized);
}

export function assertAllowedHeader(headerName: string): void {
  if (typeof headerName !== "string" || headerName.length === 0) {
    throw new ValidationException("Nama header tidak boleh kosong", [
      {
        name: "headers",
        reason: "Nama header HTTP wajib berupa string tidak kosong.",
      },
    ]);
  }

  if (!HTTP_HEADER_TOKEN_REGEX.test(headerName)) {
    throw new ValidationException(`Karakter nama header tidak valid: "${headerName}"`, [
      {
        name: "headers",
        reason: `Nama header "${headerName}" mengandung karakter tidak valid menurut spesifikasi HTTP token (RFC 7230/9110).`,
      },
    ]);
  }

  if (isDeniedHeader(headerName)) {
    throw new ValidationException(`Header "${headerName}" dilarang dikonfigurasi`, [
      {
        name: "headers",
        reason: `Header "${headerName}" termasuk dalam daftar deny-list koneksi/hop-by-hop dan tidak boleh diatur manual.`,
      },
    ]);
  }
}

export function validateHeaders(headers: Record<string, string>): void {
  if (typeof headers !== "object" || headers === null || Array.isArray(headers)) {
    throw new ValidationException("Format headers harus berupa object key-value", [
      {
        name: "headers",
        reason: "Payload headers harus berupa dictionary string: string.",
      },
    ]);
  }

  for (const [key, value] of Object.entries(headers)) {
    assertAllowedHeader(key);

    if (typeof value !== "string") {
      throw new ValidationException(`Nilai header "${key}" harus berupa string`, [
        {
          name: "headers",
          reason: `Nilai untuk header "${key}" harus berupa string, diterima tipe "${typeof value}".`,
        },
      ]);
    }

    if (/[\r\n]/.test(value)) {
      throw new ValidationException(`Nilai header "${key}" mengandung karakter newline (CRLF)`, [
        {
          name: "headers",
          reason:
            "Karakter newline (CRLF) dilarang untuk mencegah serangan HTTP response splitting atau header injection.",
        },
      ]);
    }
  }
}

export function extractHeaderKeys(headers: Record<string, string> | readonly string[]): string[] {
  if (!headers) {
    return [];
  }

  const rawKeys = Array.isArray(headers) ? headers : Object.keys(headers);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const key of rawKeys) {
    if (typeof key !== "string") {
      continue;
    }
    const trimmed = key.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(trimmed);
    }
  }

  return result.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export const HeaderPolicy = {
  isDeniedHeader,
  assertAllowedHeader,
  validateHeaders,
  extractHeaderKeys,
} as const;
export type HeaderPolicy = typeof HeaderPolicy;
