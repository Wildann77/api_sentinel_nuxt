import type { z } from "zod";
import type {
  CursorPaginationSchema,
  InvalidParamSchema,
  ProblemDetailsSchema,
} from "../schemas/common.js";

export type InvalidParamDto = z.infer<typeof InvalidParamSchema>;
export type ProblemDetailsDto = z.infer<typeof ProblemDetailsSchema>;
export type CursorPaginationDto = z.infer<typeof CursorPaginationSchema>;

export interface CursorPageDto<T> {
  readonly data: readonly T[];
  readonly pagination: CursorPaginationDto;
}
