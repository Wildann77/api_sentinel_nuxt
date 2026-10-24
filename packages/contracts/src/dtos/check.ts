import type { z } from "zod";
import type {
  AssertionResultSchema,
  CheckDetailSchema,
  CheckDiagnosticsSchema,
  CheckResultSchema,
} from "../schemas/check.js";

export type AssertionResultDto = z.infer<typeof AssertionResultSchema>;
export type CheckDiagnosticsDto = z.infer<typeof CheckDiagnosticsSchema>;
export type CheckResultDto = z.infer<typeof CheckResultSchema>;
export type CheckDetailDto = z.infer<typeof CheckDetailSchema>;
