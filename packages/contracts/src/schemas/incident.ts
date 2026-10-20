import { z } from "zod";
import { FailureCategorySchema } from "../enums.js";
import { CheckResultSchema } from "./check.js";
import { createCursorPageSchema, UuidSchema } from "./common.js";

export const NotificationDeliveryStatusSchema = z.enum(["PENDING", "SENT", "FAILED"]);
export type NotificationDeliveryStatus = z.infer<typeof NotificationDeliveryStatusSchema>;

export const IncidentStatusSchema = z.enum(["OPEN", "RECOVERING", "RESOLVED"]);

export const NotificationDeliverySummarySchema = z.object({
  id: UuidSchema,
  channel: z.string().default("TELEGRAM"),
  status: NotificationDeliveryStatusSchema,
  attemptCount: z.number().int(),
  lastAttemptAt: z.string().nullable(),
  lastError: z.string().nullable(),
});

export const IncidentSchema = z.object({
  id: UuidSchema,
  monitorId: UuidSchema,
  monitorName: z.string().optional(),
  openedAt: z.string(),
  resolvedAt: z.string().nullable(),
  durationSeconds: z.number().int().nullable(),
  failureCount: z.number().int(),
  lastFailureCategory: FailureCategorySchema,
  lastFailureReason: z.string().nullable(),
  status: IncidentStatusSchema.optional(),
  notificationDeliveries: z.array(NotificationDeliverySummarySchema).default([]),
  checks: z.array(CheckResultSchema).optional().default([]),
  createdAt: z.string(),
});

export const ListIncidentsQuerySchema = z.object({
  monitorId: UuidSchema.optional(),
  isOpen: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((val) => (typeof val === "boolean" ? val : val === "true"))
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
  cursor: z.string().optional(),
});

export const PaginatedIncidentsResponseSchema = createCursorPageSchema(IncidentSchema);
