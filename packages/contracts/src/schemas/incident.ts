import { z } from "zod";
import { FailureCategorySchema } from "../enums.js";
import { UuidSchema } from "./common.js";

export const NotificationDeliveryStatusSchema = z.enum(["PENDING", "SENT", "FAILED"]);
export type NotificationDeliveryStatus = z.infer<typeof NotificationDeliveryStatusSchema>;

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
  notificationDeliveries: z.array(NotificationDeliverySummarySchema).default([]),
  createdAt: z.string(),
});
