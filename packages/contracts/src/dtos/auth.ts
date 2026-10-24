import type { z } from "zod";
import type {
  ChangePasswordRequestSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MeResponseSchema,
  UserSummarySchema,
} from "../schemas/auth.js";

export type UserSummaryDto = z.infer<typeof UserSummarySchema>;
export type LoginRequestDto = z.infer<typeof LoginRequestSchema>;
export type LoginResponseDto = z.infer<typeof LoginResponseSchema>;
export type MeResponseDto = z.infer<typeof MeResponseSchema>;
export type ChangePasswordRequestDto = z.infer<typeof ChangePasswordRequestSchema>;
