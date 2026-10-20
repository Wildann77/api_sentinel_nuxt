import type { z } from "zod";
import type {
  AssertionRuleInputSchema,
  AuthConfigInputSchema,
  CreateMonitorRequestSchema,
  ListMonitorsQuerySchema,
  MonitorResponseSchema,
  PaginatedMonitorsResponseSchema,
  SparklinePointSchema,
  TestMonitorConfigRequestSchema,
  UpdateMonitorRequestSchema,
} from "../schemas/monitor.js";

export type AssertionRuleInputDto = z.infer<typeof AssertionRuleInputSchema>;
export type AuthConfigInputDto = z.infer<typeof AuthConfigInputSchema>;
export type CreateMonitorRequestDto = z.infer<typeof CreateMonitorRequestSchema>;
export type UpdateMonitorRequestDto = z.infer<typeof UpdateMonitorRequestSchema>;
export type TestMonitorConfigRequestDto = z.infer<typeof TestMonitorConfigRequestSchema>;
export type SparklinePointDto = z.infer<typeof SparklinePointSchema>;
export type MonitorResponseDto = z.infer<typeof MonitorResponseSchema>;
export type ListMonitorsQueryDto = z.infer<typeof ListMonitorsQuerySchema>;
export type PaginatedMonitorsResponseDto = z.infer<typeof PaginatedMonitorsResponseSchema>;
