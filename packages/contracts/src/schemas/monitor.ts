import { z } from "zod";
import {
  AssertionOperatorSchema,
  AssertionTypeSchema,
  AuthTypeSchema,
  HealthStatusSchema,
  HttpMethodSchema,
} from "../enums.js";
import { createCursorPageSchema, UuidSchema } from "./common.js";

export const FORBIDDEN_REQUEST_HEADERS = [
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "proxy-authorization",
] as const;

export const CustomHeadersSchema = z.record(z.string(), z.string()).superRefine((headers, ctx) => {
  for (const key of Object.keys(headers)) {
    if (
      FORBIDDEN_REQUEST_HEADERS.includes(
        key.toLowerCase() as (typeof FORBIDDEN_REQUEST_HEADERS)[number],
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Header "${key}" dilarang dikonfigurasi pengguna (hop-by-hop / kontrol koneksi).`,
        path: [key],
      });
    }
  }
});

export const AssertionRuleInputSchema = z.object({
  type: AssertionTypeSchema,
  property: z.string().max(100).optional(),
  target: z.string().max(100).optional(),
  operator: AssertionOperatorSchema,
  expectedValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  expected: z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]).optional(),
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
    headers: CustomHeadersSchema,
  }),
]);

function isBlockedIpLiteralOrLocalhost(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();
  if (lower === "localhost" || lower.endsWith(".localhost")) {
    return true;
  }

  const v4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (v4Match) {
    const o1 = Number.parseInt(v4Match[1] ?? "", 10);
    const o2 = Number.parseInt(v4Match[2] ?? "", 10);
    const o3 = Number.parseInt(v4Match[3] ?? "", 10);
    const o4 = Number.parseInt(v4Match[4] ?? "", 10);
    if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) {
      return true;
    }
    if (o1 === 0) return true; // 0.0.0.0/8
    if (o1 === 127) return true; // 127.0.0.0/8 loopback
    if (o1 === 10) return true; // 10.0.0.0/8 private
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12 private
    if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16 private
    if (o1 === 169 && o2 === 254) return true; // 169.254.0.0/16 link-local
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true; // 100.64.0.0/10 CGNAT
    if (o1 >= 224) return true; // Multicast / reserved
  }

  let v6Candidate = lower;
  if (v6Candidate.startsWith("[") && v6Candidate.endsWith("]")) {
    v6Candidate = v6Candidate.slice(1, -1);
  }
  if (v6Candidate === "::1" || v6Candidate === "::") return true;
  if (v6Candidate.startsWith("fe80:") || v6Candidate.startsWith("fe80::")) return true;
  if (v6Candidate.startsWith("fc") || v6Candidate.startsWith("fd")) return true;
  if (v6Candidate.includes("::ffff:")) {
    const mappedV4 = v6Candidate.split("::ffff:")[1];
    if (mappedV4 && isBlockedIpLiteralOrLocalhost(mappedV4)) return true;
  }
  return false;
}

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
        if (isBlockedIpLiteralOrLocalhost(parsed.hostname)) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    {
      message:
        "URL hanya boleh http/https tanpa kredensial, dan dilarang mengarah ke localhost/rentang IP privat (kebijakan SSRF)",
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
  customHeaders: CustomHeadersSchema.optional(),
  body: z.string().max(65536, "Panjang request body maksimal 64 KB").optional().nullable(),
});

export const UpdateMonitorRequestSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  url: HttpUrlSchema.optional(),
  method: HttpMethodSchema.optional(),
  intervalSeconds: z.number().int().min(60).max(86400).optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional(),
  assertions: z.array(AssertionRuleInputSchema).max(10).optional(),
  auth: AuthConfigInputSchema.optional(),
  customHeaders: CustomHeadersSchema.optional(),
  body: z.string().max(65536, "Panjang request body maksimal 64 KB").optional().nullable(),
  isActive: z.boolean().optional(),
  version: z.number().int().positive().optional(),
});

export const TestMonitorConfigRequestSchema = z.object({
  url: HttpUrlSchema,
  method: HttpMethodSchema.default("GET"),
  timeoutMs: z.number().int().min(1000).max(30000).default(10000),
  assertions: z.array(AssertionRuleInputSchema).max(10).default([]),
  auth: AuthConfigInputSchema.optional(),
  customHeaders: CustomHeadersSchema.optional(),
  body: z.string().max(65536).optional().nullable(),
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

export const ListMonitorsQuerySchema = z.object({
  status: z.union([HealthStatusSchema, z.literal("ALL")]).optional(),
  search: z.string().optional(),
  isActive: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((v) =>
      typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : undefined,
    ),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const PaginatedMonitorsResponseSchema = createCursorPageSchema(MonitorResponseSchema);

export type CreateMonitorRequest = z.infer<typeof CreateMonitorRequestSchema>;
export type UpdateMonitorRequest = z.infer<typeof UpdateMonitorRequestSchema>;
export type AssertionRuleInput = z.infer<typeof AssertionRuleInputSchema>;
export type AuthConfigInput = z.infer<typeof AuthConfigInputSchema>;
export type CustomHeadersInput = z.infer<typeof CustomHeadersSchema>;
export type ListMonitorsQuery = z.infer<typeof ListMonitorsQuerySchema>;
export type PaginatedMonitorsResponse = z.infer<typeof PaginatedMonitorsResponseSchema>;
