import { describe, expect, it } from "vitest";
import {
  ConflictException,
  DomainError,
  DomainException,
  EntityNotFoundException,
  FAILURE_CATEGORIES,
  ForbiddenException,
  HEALTH_STATUSES,
  HTTP_METHODS,
  InvalidCredentialsException,
  isFailureCategory,
  isHealthStatus,
  isHttpMethod,
  isTriggerType,
  RateLimitExceededException,
  SSRFBlockedException,
  TRIGGER_TYPES,
  UUIDv7,
  ValidationException,
} from "../src/index.js";

describe("P2.1 — Kernel Bersama", () => {
  describe("Domain Exceptions", () => {
    it("verifies inheritance and properties for EntityNotFoundException", () => {
      const error = new EntityNotFoundException("Monitor tidak ditemukan");
      expect(error).toBeInstanceOf(DomainException);
      expect(error).toBeInstanceOf(DomainError);
      expect(error.statusCode).toBe(404);
      expect(error.errorType).toBe("entity-not-found");
      expect(error.title).toBe("Entitas Tidak Ditemukan");
      expect(error.message).toBe("Monitor tidak ditemukan");
    });

    it("verifies ValidationException with invalidParams", () => {
      const error = new ValidationException("Input invalid", [
        { name: "interval", reason: "Interval minimal 60 detik" },
      ]);
      expect(error.statusCode).toBe(400);
      expect(error.errorType).toBe("validation-failed");
      expect(error.title).toBe("Validasi Input Gagal");
      expect(error.invalidParams).toHaveLength(1);
      expect(error.invalidParams[0]?.name).toBe("interval");
    });

    it("verifies SSRFBlockedException", () => {
      const error = new SSRFBlockedException("Akses ke IP loopback dilarang");
      expect(error.statusCode).toBe(422);
      expect(error.errorType).toBe("ssrf-blocked");
      expect(error.title).toBe("Kebijakan Keamanan SSRF Terlanggar");
    });

    it("verifies InvalidCredentialsException", () => {
      const error = new InvalidCredentialsException("Username atau password salah");
      expect(error.statusCode).toBe(401);
      expect(error.errorType).toBe("invalid-credentials");
      expect(error.title).toBe("Autentikasi Gagal");
    });

    it("verifies ConflictException", () => {
      const error = new ConflictException("Versi entitas tidak cocok");
      expect(error.statusCode).toBe(409);
      expect(error.errorType).toBe("conflict-version-mismatch");
      expect(error.title).toBe("Konflik Konkurensi Versi");
    });

    it("verifies RateLimitExceededException with retryAfterSeconds", () => {
      const error = new RateLimitExceededException("Terlalu banyak permintaan", 60);
      expect(error.statusCode).toBe(429);
      expect(error.errorType).toBe("rate-limit-exceeded");
      expect(error.title).toBe("Batas Laju Permintaan Terlampaui");
      expect(error.retryAfterSeconds).toBe(60);
    });

    it("verifies ForbiddenException", () => {
      const error = new ForbiddenException("Akses dilarang");
      expect(error.statusCode).toBe(403);
      expect(error.errorType).toBe("forbidden-access");
      expect(error.title).toBe("Akses Dilarang");
    });
  });

  describe("Enums & Type Guards", () => {
    it("verifies HttpMethod enum and guard", () => {
      expect(HTTP_METHODS).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);
      expect(isHttpMethod("GET")).toBe(true);
      expect(isHttpMethod("CONNECT")).toBe(false);
      expect(isHttpMethod(123)).toBe(false);
    });

    it("verifies HealthStatus enum and guard", () => {
      expect(HEALTH_STATUSES).toEqual(["UNKNOWN", "UP", "DEGRADED", "DOWN", "PAUSED"]);
      expect(isHealthStatus("UP")).toBe(true);
      expect(isHealthStatus("FAILING")).toBe(false);
    });

    it("verifies FailureCategory has all 12 categories including REDIRECT_NOT_ALLOWED (D-14)", () => {
      expect(FAILURE_CATEGORIES).toHaveLength(12);
      expect(FAILURE_CATEGORIES).toContain("REDIRECT_NOT_ALLOWED");
      expect(FAILURE_CATEGORIES).toContain("EXECUTION_ABORTED");
      expect(isFailureCategory("REDIRECT_NOT_ALLOWED")).toBe(true);
      expect(isFailureCategory("UNKNOWN_ERROR")).toBe(false);
    });

    it("verifies TriggerType enum (D-13)", () => {
      expect(TRIGGER_TYPES).toEqual(["SCHEDULED", "MANUAL"]);
      expect(isTriggerType("SCHEDULED")).toBe(true);
      expect(isTriggerType("AUTOMATIC")).toBe(false);
    });
  });

  describe("Value Object UUIDv7", () => {
    const validUuid = "018d3b5b-2000-7000-8000-000000000000";

    it("parses valid UUIDv7 and normalizes casing", () => {
      const vo = new UUIDv7(validUuid.toUpperCase());
      const voFromStr = UUIDv7.fromString(validUuid);
      expect(vo.value).toBe(validUuid);
      expect(voFromStr.value).toBe(validUuid);
      expect(vo.toString()).toBe(validUuid);
      expect(vo.toJSON()).toBe(validUuid);
      expect(UUIDv7.isValid(validUuid)).toBe(true);
    });

    it("extracts timestamp in milliseconds and Date correctly", () => {
      // Hex: 018d3b5b2000 = 1706097844224 ms
      const vo = new UUIDv7("018d3b5b-2000-7000-8000-000000000000");
      expect(vo.getTimestampMs()).toBe(1706097844224);
      expect(vo.getTimestamp().toISOString()).toBe("2024-01-24T12:04:04.224Z");
    });

    it("throws ValidationException for invalid format", () => {
      expect(() => new UUIDv7("not-a-uuid")).toThrow(ValidationException);
      expect(() => new UUIDv7("00000000-0000-4000-8000-000000000000")).toThrow(ValidationException); // v4, not v7
      expect(UUIDv7.isValid("invalid")).toBe(false);
    });

    it("implements equality and ordering", () => {
      const vo1 = new UUIDv7("018d3b5b-2000-7000-8000-000000000000");
      const vo2 = new UUIDv7("018d3b5b-2000-7000-8000-000000000000");
      const vo3 = new UUIDv7("018d3b5b-3000-7000-8000-000000000000");

      expect(vo1.equals(vo2)).toBe(true);
      expect(vo1.equals(vo3)).toBe(false);
      expect(vo1.equals(null)).toBe(false);
      expect(vo1.compareTo(vo3)).toBeLessThan(0);
      expect(vo3.compareTo(vo1)).toBeGreaterThan(0);
    });
  });
});
