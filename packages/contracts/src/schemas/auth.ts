import { z } from "zod";
import { UuidSchema } from "./common.js";

export const UserSummarySchema = z.object({
  id: UuidSchema,
  username: z.string().min(1).max(100),
});

export const LoginRequestSchema = z.object({
  username: z.string().trim().min(1, "Username wajib diisi").max(100),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .max(128, "Password maksimal 128 karakter"),
});

export const LoginResponseSchema = z.object({
  user: UserSummarySchema,
});

export const MeResponseSchema = z.object({
  authenticated: z.boolean(),
  user: UserSummarySchema.nullable(),
});

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z
    .string()
    .min(8, "Password baru minimal 8 karakter")
    .max(128, "Password baru maksimal 128 karakter"),
});
