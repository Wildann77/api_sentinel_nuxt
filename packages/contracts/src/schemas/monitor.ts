import { z } from "zod";
import {
  AssertionOperatorSchema,
  AssertionTypeSchema,
  AuthTypeSchema,
  HealthStatusSchema,
  HttpMethodSchema,
} from "../enums.js";
import { UuidSchema } from "./common.js";

export const AssertionRuleInputSchema = z.object({
  type: AssertionTypeSchema,
  property: z.string().max(100).optional(),
  operator: AssertionOperatorSchema,
  expectedValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const AuthConfigInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("NONE"),
  }),
  z.object({
    type: z.literal("BEARER"),
    token: z.string().min(1, "Bearer token wajib diisi"),
  }),
  z.object({
    type: z.literal("BASIC"),
    username: z.string().min(1, "Basic auth username wajib diisi"),
    password: z.string().min(1, "Basic auth password wajib diisi"),
  }),
  z.object({
    type: z.literal("API_KEY"),
    headerName: z.string().min(1, "Nama header API key wajib diisi"),
    apiKey: z.string().min(1, "Nilai API key wajib diisi"),
  }),
  z.object({
    type: z.literal("CUSTOM_HEADER"),
    headers: z.record(z.string(), z.string()),
  }),
]);

export const HttpUrlSchema = z
  .string()
  .url("Format URL tidak valid")
  .refine(
    (val) => {
      try {
        const parsed = new URL(val);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return false;
        }
        if (parsed.username || parsed.password) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    {
      message: "URL hanya boleh http/https dan dilarang menyertakan kredensial userinfo",
    },
  );

export const CreateMonitorRequestSchema = z.object({
  name: z.string().trim().min(1, "Nama monitor wajib diisi").max(100),
  url: HttpUrlSchema,
  method: HttpMethodSchema.default("GET"),
  intervalSeconds: z.number().int().min(60).max(86400).default(60),
  timeoutMs: z.number().int().min(1000).max(30000).default(10000),
  assertions: z
    .array(AssertionRuleInputSchema)
    .max(10, "Maksimal 10 assertion rule per monitor")
    .default([]),
  auth: AuthConfigInputSchema.optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
});

export const UpdateMonitorRequestSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  url: HttpUrlSchema.optional(),
  method: HttpMethodSchema.optional(),
  intervalSeconds: z.number().int().min(60).max(86400).optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional(),
  assertions: z.array(AssertionRuleInputSchema).max(10).optional(),
  auth: AuthConfigInputSchema.optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
  isActive: z.boolean().optional(),
});

export const TestMonitorConfigRequestSchema = z.object({
  url: HttpUrlSchema,
  method: HttpMethodSchema.default("GET"),
  timeoutMs: z.number().int().min(1000).max(30000).default(10000),
  assertions: z.array(AssertionRuleInputSchema).max(10).default([]),
  auth: AuthConfigInputSchema.optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
});

export const SparklinePointSchema = z.object({
  durationMs: z.number().nullable(),
  timestamp: z.string(),
});

export const MonitorResponseSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  url: z.string(),
  method: HttpMethodSchema,
  intervalSeconds: z.number().int(),
  timeoutMs: z.number().int(),
  isActive: z.boolean(),
  healthStatus: HealthStatusSchema,
  version: z.number().int(),
  headerKeys: z.array(z.string()),
  authType: AuthTypeSchema,
  consecutiveSuccesses: z.number().int(),
  failureCount: z.number().int(),
  currentIncidentId: UuidSchema.nullable(),
  lastCheckedAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  sparkline: z.array(SparklinePointSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
