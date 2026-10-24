export const MAX_DIAGNOSTIC_LENGTH = 2000;
const TRUNCATED_SUFFIX = "... [TRUNCATED]";

const TELEGRAM_TOKEN_REGEX = /bot\d+:[A-Za-z0-9_-]+/gi;
const BEARER_AUTH_REGEX = /(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi;
const BASIC_AUTH_REGEX = /(Basic\s+)[A-Za-z0-9+/=]+/gi;
const SENSITIVE_KV_REGEX = /(api[-_]?key|apikey|token|secret|password)=([^&\s]+)/gi;
const SENSITIVE_JSON_REGEX =
  /"(password|secret|token|apiKey|api_key|telegramToken|botToken)"\s*:\s*"[^"]+"/gi;

export function sanitizeDiagnostic(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let sanitized = trimmed
    .replace(TELEGRAM_TOKEN_REGEX, "bot[REDACTED_TELEGRAM_TOKEN]")
    .replace(BEARER_AUTH_REGEX, "$1[REDACTED_TOKEN]")
    .replace(BASIC_AUTH_REGEX, "$1[REDACTED_CREDENTIALS]")
    .replace(SENSITIVE_KV_REGEX, "$1=[REDACTED]")
    .replace(SENSITIVE_JSON_REGEX, '"$1":"[REDACTED]"');

  if (sanitized.length > MAX_DIAGNOSTIC_LENGTH) {
    const sliceLen = MAX_DIAGNOSTIC_LENGTH - TRUNCATED_SUFFIX.length;
    sanitized = `${sanitized.slice(0, Math.max(0, sliceLen))}${TRUNCATED_SUFFIX}`;
  }

  return sanitized;
}

export const DiagnosticSanitizer = {
  sanitize: sanitizeDiagnostic,
  MAX_LENGTH: MAX_DIAGNOSTIC_LENGTH,
} as const;
export type DiagnosticSanitizer = typeof DiagnosticSanitizer;
