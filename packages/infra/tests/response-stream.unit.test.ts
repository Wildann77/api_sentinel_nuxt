import { PassThrough, Readable } from "node:stream";
import * as zlib from "node:zlib";
import { FailureCategory } from "@sentinel/domain";
import { describe, expect, it } from "vitest";
import {
  consumeResponseBody,
  createDecompressor,
  MAX_BODY_BYTES,
  MAX_SNIPPET_BYTES,
  ResponseSizeExceededException,
  ResponseSizeGuard,
  sanitizeResponseHeaders,
} from "../src/network/response-stream.js";

describe("P6.4 — Response Stream & Bomb Guard Unit Tests", () => {
  it("ResponseSizeGuard allows streams within 2 MB limit", async () => {
    const guard = new ResponseSizeGuard(1024); // 1 KB max for test
    const input = Buffer.from("Hello world, this is a safe payload.");

    const chunks: Buffer[] = [];
    guard.on("data", (chunk: Buffer) => chunks.push(chunk));

    await new Promise<void>((resolve, reject) => {
      guard.on("end", () => resolve());
      guard.on("error", reject);
      guard.write(input);
      guard.end();
    });

    const output = Buffer.concat(chunks).toString("utf-8");
    expect(output).toBe("Hello world, this is a safe payload.");
    expect(guard.totalBytes).toBe(input.length);
  });

  it("ResponseSizeGuard throws ResponseSizeExceededException when stream exceeds maxBytes", async () => {
    const maxBytes = 100;
    const guard = new ResponseSizeGuard(maxBytes);
    const oversizedChunk = Buffer.alloc(150, "a");

    let thrownError: unknown = null;
    try {
      await new Promise<void>((resolve, reject) => {
        guard.on("end", () => resolve());
        guard.on("error", reject);
        guard.write(oversizedChunk);
        guard.end();
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(ResponseSizeExceededException);
    expect((thrownError as ResponseSizeExceededException).category).toBe(
      FailureCategory.RESPONSE_SIZE_EXCEEDED,
    );
  });

  it("createDecompressor correctly identifies gzip, deflate, and br encodings", () => {
    const gzipDecompressor = createDecompressor("gzip");
    expect(gzipDecompressor).not.toBeNull();

    const deflateDecompressor = createDecompressor("deflate");
    expect(deflateDecompressor).not.toBeNull();

    const brDecompressor = createDecompressor("br");
    expect(brDecompressor).not.toBeNull();

    const identityDecompressor = createDecompressor("identity");
    expect(identityDecompressor).toBeNull();

    const nullDecompressor = createDecompressor(null);
    expect(nullDecompressor).toBeNull();
  });

  it("consumeResponseBody handles plain uncompressed body and truncates snippet to 5 KB", async () => {
    const largeBody = "x".repeat(10_000); // 10 KB
    const stream = Readable.from([
      Buffer.from(largeBody),
    ]) as unknown as import("node:http").IncomingMessage;
    (stream as unknown as { headers: Record<string, string> }).headers = {};

    const result = await consumeResponseBody(stream, {
      needsResponseBody: true,
      maxSnippetBytes: MAX_SNIPPET_BYTES,
    });

    expect(result.bodyBytesRead).toBe(10_000);
    expect(result.bodySnippet).not.toBeNull();
    expect(result.bodySnippet?.length).toBe(MAX_SNIPPET_BYTES);
  });

  it("consumeResponseBody immediately destroys stream when needsResponseBody is false", async () => {
    let destroyed = false;
    const pass = new PassThrough();
    pass.destroy = function () {
      destroyed = true;
      return PassThrough.prototype.destroy.apply(this);
    };

    const mockRes = pass as unknown as import("node:http").IncomingMessage;
    (mockRes as unknown as { headers: Record<string, string> }).headers = {};

    const result = await consumeResponseBody(mockRes, {
      needsResponseBody: false,
    });

    expect(destroyed).toBe(true);
    expect(result.bodySnippet).toBeNull();
    expect(result.bodyBytesRead).toBe(0);
  });

  it("consumeResponseBody decompresses gzip payload successfully", async () => {
    const originalText = JSON.stringify({ message: "Gzip compressed response", status: "ok" });
    const gzipped = zlib.gzipSync(Buffer.from(originalText));

    const stream = Readable.from([gzipped]) as unknown as import("node:http").IncomingMessage;
    (stream as unknown as { headers: Record<string, string> }).headers = {
      "content-encoding": "gzip",
    };

    const result = await consumeResponseBody(stream, {
      needsResponseBody: true,
    });

    expect(result.bodySnippet).toBe(originalText);
    expect(result.bodyBytesRead).toBe(Buffer.byteLength(originalText));
  });

  it("consumeResponseBody halts on gzip bomb and throws ResponseSizeExceededException", async () => {
    // Generate a payload that expands to 2.5 MB (> 2 MB MAX_BODY_BYTES)
    const expandedPayload = Buffer.alloc(2.5 * 1024 * 1024, "A");
    const gzippedBomb = zlib.gzipSync(expandedPayload); // tiny compressed size

    const stream = Readable.from([gzippedBomb]) as unknown as import("node:http").IncomingMessage;
    (stream as unknown as { headers: Record<string, string> }).headers = {
      "content-encoding": "gzip",
    };

    let thrownError: unknown = null;
    try {
      await consumeResponseBody(stream, {
        needsResponseBody: true,
        maxBodyBytes: MAX_BODY_BYTES,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(ResponseSizeExceededException);
    expect((thrownError as ResponseSizeExceededException).category).toBe(
      FailureCategory.RESPONSE_SIZE_EXCEEDED,
    );
  });

  it("sanitizeResponseHeaders redacts sensitive headers and sensitive text", () => {
    const headers = {
      "content-type": "application/json",
      "set-cookie": "session_id=secret123; HttpOnly; Secure",
      authorization: "Bearer secret-token-xyz",
      "x-api-key": "sensitive-api-key-12345",
      "x-custom-meta": "bot123456789:ABCdefGHIjklMNOpqrsTUVwxyz-123456",
    };

    const sanitized = sanitizeResponseHeaders(headers);

    expect(sanitized["content-type"]).toBe("application/json");
    expect(sanitized["set-cookie"]).toBe("[REDACTED]");
    expect(sanitized.authorization).toBe("[REDACTED]");
    expect(sanitized["x-api-key"]).toBe("[REDACTED]");
    expect(sanitized["x-custom-meta"]).toContain("bot[REDACTED]");
  });
});
