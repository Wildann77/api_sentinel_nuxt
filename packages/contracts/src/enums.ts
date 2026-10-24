import { z } from "zod";

export const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const HealthStatusSchema = z.enum(["UNKNOWN", "UP", "DEGRADED", "DOWN", "PAUSED"]);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const FailureCategorySchema = z.enum([
  "DNS_RESOLUTION_FAILED",
  "SSRF_BLOCKED",
  "CONNECTION_REFUSED",
  "CONNECTION_TIMEOUT",
  "TLS_HANDSHAKE_FAILED",
  "HTTP_STATUS_MISMATCH",
  "RESPONSE_SIZE_EXCEEDED",
  "HEADER_ASSERTION_FAILED",
  "BODY_JSON_INVALID",
  "BODY_ASSERTION_FAILED",
  "REDIRECT_NOT_ALLOWED",
  "EXECUTION_ABORTED",
]);
export type FailureCategory = z.infer<typeof FailureCategorySchema>;

export const TriggerTypeSchema = z.enum(["SCHEDULED", "MANUAL"]);
export type TriggerType = z.infer<typeof TriggerTypeSchema>;

export const AuthTypeSchema = z.enum(["NONE", "BEARER", "BASIC", "API_KEY", "CUSTOM_HEADER"]);
export type AuthType = z.infer<typeof AuthTypeSchema>;

export const AssertionTypeSchema = z.enum(["status", "header", "body-json"]);
export type AssertionType = z.infer<typeof AssertionTypeSchema>;

export const AssertionOperatorSchema = z.enum(["exists", "equals", "not_equals", "contains"]);
export type AssertionOperator = z.infer<typeof AssertionOperatorSchema>;
