import { z } from "zod";

export const UuidSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Format UUID tidak valid",
  );

export const InvalidParamSchema = z.object({
  name: z.string().min(1),
  reason: z.string().min(1),
});

export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string().optional(),
  invalidParams: z.array(InvalidParamSchema).optional(),
  debug: z
    .object({
      stack: z.string().optional(),
    })
    .optional(),
});

export const CursorPaginationSchema = z.object({
  limit: z.number().int().min(1).max(100),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
});

export function createCursorPageSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    pagination: CursorPaginationSchema,
  });
}
