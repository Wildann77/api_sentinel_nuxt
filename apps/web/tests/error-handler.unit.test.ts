import {
  ConflictException,
  EntityNotFoundException,
  ForbiddenException,
  InvalidCredentialsException,
  RateLimitExceededException,
  SSRFBlockedException,
  ValidationException,
} from "@sentinel/domain";
import { describe, expect, it } from "vitest";
import { createProblemDetails } from "../server/utils/problem-details.js";

describe("P7.1 — Global Error Handler RFC 9457", () => {
  it("maps EntityNotFoundException to 404 problem details", () => {
    const error = new EntityNotFoundException("Monitor dengan ID tersebut tidak ditemukan.");
    const result = createProblemDetails(error, "/api/monitors/123", true);

    expect(result.statusCode).toBe(404);
    expect(result.payload).toEqual({
      type: "https://api-sentinel.local/errors/entity-not-found",
      title: "Entitas Tidak Ditemukan",
      status: 404,
      detail: "Monitor dengan ID tersebut tidak ditemukan.",
      instance: "/api/monitors/123",
    });
  });

  it("maps ValidationException to 400 with invalidParams array", () => {
    const invalidParams = [
      { name: "url", reason: "Alamat IP privat (192.168.1.1) diblokir oleh kebijakan SSRF." },
    ];
    const error = new ValidationException(
      "URL target berada pada rentang subnet privat yang dilarang.",
      invalidParams,
    );
    const result = createProblemDetails(error, "/api/monitors", true);

    expect(result.statusCode).toBe(400);
    expect(result.payload).toEqual({
      type: "https://api-sentinel.local/errors/validation-failed",
      title: "Validasi Input Gagal",
      status: 400,
      detail: "URL target berada pada rentang subnet privat yang dilarang.",
      instance: "/api/monitors",
      invalidParams: [
        {
          name: "url",
          reason: "Alamat IP privat (192.168.1.1) diblokir oleh kebijakan SSRF.",
        },
      ],
    });
  });

  it("maps SSRFBlockedException to 422 problem details", () => {
    const error = new SSRFBlockedException("Target IP dilarang oleh kebijakan SSRF.");
    const result = createProblemDetails(error, "/api/monitors/test", true);

    expect(result.statusCode).toBe(422);
    expect(result.payload.type).toBe("https://api-sentinel.local/errors/ssrf-blocked");
    expect(result.payload.title).toBe("Kebijakan Keamanan SSRF Terlanggar");
    expect(result.payload.status).toBe(422);
  });

  it("maps InvalidCredentialsException to 401 problem details", () => {
    const error = new InvalidCredentialsException("Kredensial tidak valid");
    const result = createProblemDetails(error, "/api/auth/login", true);

    expect(result.statusCode).toBe(401);
    expect(result.payload.type).toBe("https://api-sentinel.local/errors/invalid-credentials");
    expect(result.payload.title).toBe("Autentikasi Gagal");
    expect(result.payload.status).toBe(401);
  });

  it("maps ConflictException to 409 problem details", () => {
    const error = new ConflictException("Versi monitor telah diperbarui oleh pengguna lain.");
    const result = createProblemDetails(error, "/api/monitors/123", true);

    expect(result.statusCode).toBe(409);
    expect(result.payload.type).toBe("https://api-sentinel.local/errors/conflict-version-mismatch");
    expect(result.payload.title).toBe("Konflik Konkurensi Versi");
    expect(result.payload.status).toBe(409);
  });

  it("maps RateLimitExceededException to 429 and provides retryAfterSeconds", () => {
    const error = new RateLimitExceededException("Batas percobaan login terlampaui.", 60);
    const result = createProblemDetails(error, "/api/auth/login", true);

    expect(result.statusCode).toBe(429);
    expect(result.retryAfterSeconds).toBe(60);
    expect(result.payload.type).toBe("https://api-sentinel.local/errors/rate-limit-exceeded");
    expect(result.payload.title).toBe("Batas Laju Permintaan Terlampaui");
    expect(result.payload.status).toBe(429);
  });

  it("maps ForbiddenException to 403 problem details", () => {
    const error = new ForbiddenException("Akses dilarang untuk peran ini.");
    const result = createProblemDetails(error, "/api/settings", true);

    expect(result.statusCode).toBe(403);
    expect(result.payload.type).toBe("https://api-sentinel.local/errors/forbidden-access");
    expect(result.payload.title).toBe("Akses Dilarang");
    expect(result.payload.status).toBe(403);
  });

  it("maps unexpected error to generic 500 without stack trace in production", () => {
    const error = new Error("Database connection dropped unexpectedly");
    const result = createProblemDetails(error, "/api/dashboard", true);

    expect(result.statusCode).toBe(500);
    expect(result.payload).toEqual({
      type: "https://api-sentinel.local/errors/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: "Terjadi kesalahan sistem internal yang tidak terduga.",
      instance: "/api/dashboard",
    });
    expect(result.payload.debug).toBeUndefined();
  });

  it("includes stack trace in debug payload when non-production mode", () => {
    const error = new Error("Debug crash test");
    const result = createProblemDetails(error, "/api/test", false);

    expect(result.statusCode).toBe(500);
    expect(result.payload.debug).toBeDefined();
    expect(result.payload.debug?.stack).toContain("Debug crash test");
  });
});
