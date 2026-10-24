export const HttpMethod = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
} as const;
export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

export const HealthStatus = {
  UNKNOWN: "UNKNOWN",
  UP: "UP",
  DEGRADED: "DEGRADED",
  DOWN: "DOWN",
  PAUSED: "PAUSED",
} as const;
export type HealthStatus = (typeof HealthStatus)[keyof typeof HealthStatus];

export const FailureCategory = {
  DNS_RESOLUTION_FAILED: "DNS_RESOLUTION_FAILED",
  SSRF_BLOCKED: "SSRF_BLOCKED",
  CONNECTION_REFUSED: "CONNECTION_REFUSED",
  CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
  TLS_HANDSHAKE_FAILED: "TLS_HANDSHAKE_FAILED",
  HTTP_STATUS_MISMATCH: "HTTP_STATUS_MISMATCH",
  RESPONSE_SIZE_EXCEEDED: "RESPONSE_SIZE_EXCEEDED",
  HEADER_ASSERTION_FAILED: "HEADER_ASSERTION_FAILED",
  BODY_JSON_INVALID: "BODY_JSON_INVALID",
  BODY_ASSERTION_FAILED: "BODY_ASSERTION_FAILED",
  REDIRECT_NOT_ALLOWED: "REDIRECT_NOT_ALLOWED",
  EXECUTION_ABORTED: "EXECUTION_ABORTED",
} as const;
export type FailureCategory = (typeof FailureCategory)[keyof typeof FailureCategory];

export const TriggerType = {
  SCHEDULED: "SCHEDULED",
  MANUAL: "MANUAL",
} as const;
export type TriggerType = (typeof TriggerType)[keyof typeof TriggerType];

export const HTTP_METHODS: readonly HttpMethod[] = Object.values(HttpMethod);
export const HEALTH_STATUSES: readonly HealthStatus[] = Object.values(HealthStatus);
export const FAILURE_CATEGORIES: readonly FailureCategory[] = Object.values(FailureCategory);
export const TRIGGER_TYPES: readonly TriggerType[] = Object.values(TriggerType);

export function isHttpMethod(value: unknown): value is HttpMethod {
  return typeof value === "string" && (HTTP_METHODS as readonly string[]).includes(value);
}

export function isHealthStatus(value: unknown): value is HealthStatus {
  return typeof value === "string" && (HEALTH_STATUSES as readonly string[]).includes(value);
}

export function isFailureCategory(value: unknown): value is FailureCategory {
  return typeof value === "string" && (FAILURE_CATEGORIES as readonly string[]).includes(value);
}

export function isTriggerType(value: unknown): value is TriggerType {
  return typeof value === "string" && (TRIGGER_TYPES as readonly string[]).includes(value);
}
