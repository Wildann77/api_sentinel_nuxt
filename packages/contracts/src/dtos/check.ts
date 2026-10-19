import type { z } from "zod";
import type {
  AssertionResultSchema,
  CheckDetailSchema,
  CheckDiagnosticsSchema,
  CheckResultSchema,
  ListChecksQuerySchema,
  PaginatedChecksResponseSchema,
  RecentChecksQuerySchema,
  RecentChecksResponseSchema,
} from "../schemas/check.js";

export type AssertionResultDto = z.infer<typeof AssertionResultSchema>;
export type CheckDiagnosticsDto = z.infer<typeof CheckDiagnosticsSchema>;
export type CheckResultDto = z.infer<typeof CheckResultSchema>;
export type CheckDetailDto = z.infer<typeof CheckDetailSchema>;
export type ListChecksQueryDto = z.infer<typeof ListChecksQuerySchema>;
export type PaginatedChecksResponseDto = z.infer<typeof PaginatedChecksResponseSchema>;
export type RecentChecksQueryDto = z.infer<typeof RecentChecksQuerySchema>;
export type RecentChecksResponseDto = z.infer<typeof RecentChecksResponseSchema>;
