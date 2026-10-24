import { pgEnum } from "drizzle-orm/pg-core";

export const httpMethodEnum = pgEnum("http_method", [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
]);

export const healthStatusEnum = pgEnum("health_status", [
  "UNKNOWN",
  "UP",
  "DEGRADED",
  "DOWN",
  "PAUSED",
]);

export const failureCategoryEnum = pgEnum("failure_category", [
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

export const triggerTypeEnum = pgEnum("trigger_type", ["SCHEDULED", "MANUAL"]);

export const deliveryStatusEnum = pgEnum("delivery_status", ["PENDING", "SENT", "FAILED"]);
