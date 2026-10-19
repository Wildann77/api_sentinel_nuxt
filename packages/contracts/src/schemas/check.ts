import { z } from "zod";
import {
  AssertionOperatorSchema,
  AssertionTypeSchema,
  FailureCategorySchema,
  HealthStatusSchema,
  TriggerTypeSchema,
} from "../enums.js";
import { createCursorPageSchema, UuidSchema } from "./common.js";

export const AssertionResultSchema = z.object({
  type: AssertionTypeSchema,
  property: z.string().optional(),
  operator: AssertionOperatorSchema,
  expectedValue: z.unknown().optional(),
  actualValue: z.unknown().optional(),
  passed: z.boolean(),
  message: z.string().optional(),
});

export const CheckDiagnosticsSchema = z.object({
  pinnedIp: z.string().nullable(),
  dnsDurationMs: z.number().nullable(),
  connectDurationMs: z.number().nullable(),
  tlsDurationMs: z.number().nullable(),
  firstByteDurationMs: z.number().nullable(),
  requestHeaders: z.record(z.string(), z.string()).default({}),
  responseHeaders: z.record(z.string(), z.string()).default({}),
  responseBodySnippet: z.string().nullable(),
  assertionResults: z.array(AssertionResultSchema).default([]),
});

export const CheckResultSchema = z.object({
  id: UuidSchema,
  monitorId: UuidSchema,
  status: HealthStatusSchema,
  statusCode: z.number().int().nullable(),
  latencyMs: z.number().nullable(),
  failureCategory: FailureCategorySchema.nullable(),
  failureReason: z.string().nullable(),
  triggerType: TriggerTypeSchema,
  scheduledFor: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string(),
  correlationId: z.string(),
  executedAt: z.string(),
});

export const CheckDetailSchema = CheckResultSchema.extend({
  diagnostics: CheckDiagnosticsSchema,
});

export const ListChecksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  from: z
    .string()
    .datetime({ message: "Parameter from harus berupa ISO-8601 UTC datetime" })
    .optional(),
  to: z
    .string()
    .datetime({ message: "Parameter to harus berupa ISO-8601 UTC datetime" })
    .optional(),
});

export const PaginatedChecksResponseSchema = createCursorPageSchema(CheckResultSchema);

export const RecentChecksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const RecentChecksResponseSchema = z.object({
  data: z.array(CheckResultSchema),
});
