import { describe, expect, it } from "vitest";
import {
  ChangePasswordRequestSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MeResponseSchema,
  ProblemDetailsSchema,
} from "../src/index.js";

describe("Auth & Common Schemas", () => {
  describe("LoginRequestSchema", () => {
    it("validates correct login request", () => {
      const result = LoginRequestSchema.safeParse({
        username: "admin",
        password: "supersecretpassword",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.username).toBe("admin");
      }
    });

    it("rejects empty username or short password", () => {
      const result = LoginRequestSchema.safeParse({
        username: "",
        password: "123",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ChangePasswordRequestSchema", () => {
    it("validates valid password change", () => {
      const result = ChangePasswordRequestSchema.safeParse({
        currentPassword: "oldpassword123",
        newPassword: "newsecurepassword123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects short new password", () => {
      const result = ChangePasswordRequestSchema.safeParse({
        currentPassword: "oldpassword123",
        newPassword: "short",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("LoginResponseSchema & MeResponseSchema", () => {
    it("validates valid login response", () => {
      const result = LoginResponseSchema.safeParse({
        user: {
          id: "0192e21b-8a21-7000-8b1a-98df76123456",
          username: "admin",
        },
      });
      expect(result.success).toBe(true);
    });

    it("validates unauthenticated me response", () => {
      const result = MeResponseSchema.safeParse({
        authenticated: false,
        user: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("ProblemDetailsSchema (RFC 9457)", () => {
    it("validates RFC 9457 problem details with invalidParams", () => {
      const result = ProblemDetailsSchema.safeParse({
        type: "https://api-sentinel.local/errors/validation-failed",
        title: "Validasi Gagal",
        status: 400,
        detail: "Input tidak valid",
        instance: "/api/monitors",
        invalidParams: [{ name: "url", reason: "URL wajib diisi" }],
      });
      expect(result.success).toBe(true);
    });
  });
});
