import type * as http from "node:http";
import { PassThrough, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as zlib from "node:zlib";
import { FailureCategory } from "@sentinel/domain";
import { redactSensitiveText } from "../logging/pino-logger.adapter.js";

export const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB (ARCH §5.1.B)
export const MAX_SNIPPET_BYTES = 5 * 1024; // 5 KB (DES §5.5)

export class ResponseSizeExceededException extends Error {
  readonly category = FailureCategory.RESPONSE_SIZE_EXCEEDED;

  constructor(message = "Ukuran body respons melebihi batas 2 MB setelah dekompresi.") {
    super(message);
    this.name = "ResponseSizeExceededException";
  }
}

export class ResponseSizeGuard extends Transform {
  private bytesCount = 0;

  constructor(private readonly maxBytes: number = MAX_BODY_BYTES) {
    super();
  }

  public get totalBytes(): number {
    return this.bytesCount;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytesCount += chunk.length;
    if (this.bytesCount > this.maxBytes) {
      const err = new ResponseSizeExceededException();
      this.destroy(err);
      callback(err);
      return;
    }
    this.push(chunk);
    callback();
  }
}

export function createDecompressor(contentEncoding?: string | null): Transform | null {
  if (!contentEncoding) {
    return null;
  }

  const enc = contentEncoding.toLowerCase().trim();
  if (enc === "gzip") {
    return zlib.createGunzip();
  }
  if (enc === "deflate") {
    return zlib.createUnzip();
  }
  if (enc === "br") {
    return zlib.createBrotliDecompress();
  }
  return null;
}

export function sanitizeResponseHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lowerKey = key.toLowerCase();
    const joined = Array.isArray(value) ? value.join(", ") : value;
    if (
      lowerKey === "set-cookie" ||
      lowerKey === "authorization" ||
      lowerKey === "proxy-authorization" ||
      lowerKey === "x-api-key"
    ) {
      result[lowerKey] = "[REDACTED]";
    } else {
      result[lowerKey] = redactSensitiveText(joined);
    }
  }
  return result;
}

export interface ConsumeResponseOptions {
  readonly needsResponseBody?: boolean;
  readonly maxBodyBytes?: number;
  readonly maxSnippetBytes?: number;
}

export interface ConsumeResponseResult {
  readonly bodySnippet: string | null;
  readonly bodyBytesRead: number;
}

export async function consumeResponseBody(
  res: http.IncomingMessage,
  options: ConsumeResponseOptions = {},
): Promise<ConsumeResponseResult> {
  const needsBody = options.needsResponseBody ?? true;
  if (!needsBody) {
    res.destroy();
    return {
      bodySnippet: null,
      bodyBytesRead: 0,
    };
  }

  const maxBody = options.maxBodyBytes ?? MAX_BODY_BYTES;
  const maxSnippet = options.maxSnippetBytes ?? MAX_SNIPPET_BYTES;

  const decompressor = createDecompressor(res.headers["content-encoding"]);
  const sizeGuard = new ResponseSizeGuard(maxBody);
  const snippetChunks: Buffer[] = [];
  let snippetBytes = 0;

  const collector = new PassThrough();
  collector.on("data", (chunk: Buffer) => {
    if (snippetBytes < maxSnippet) {
      const take = Math.min(chunk.length, maxSnippet - snippetBytes);
      snippetChunks.push(chunk.subarray(0, take));
      snippetBytes += take;
    }
  });

  try {
    if (decompressor) {
      await pipeline(res, decompressor, sizeGuard, collector);
    } else {
      await pipeline(res, sizeGuard, collector);
    }
  } catch (err) {
    res.destroy();
    if (decompressor) {
      decompressor.destroy();
    }
    sizeGuard.destroy();
    throw err;
  }

  const rawSnippet = Buffer.concat(snippetChunks).toString("utf-8");
  const sanitizedSnippet = redactSensitiveText(rawSnippet);

  return {
    bodySnippet: sanitizedSnippet,
    bodyBytesRead: sizeGuard.totalBytes,
  };
}
