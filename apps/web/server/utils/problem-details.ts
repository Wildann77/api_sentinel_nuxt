import { DomainException } from "@sentinel/domain";

export interface ProblemDetailsPayload {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly invalidParams?: readonly { name: string; reason: string }[];
  readonly debug?: { readonly stack?: string };
  readonly [key: string]: unknown;
}

export interface ProblemDetailsResult {
  readonly statusCode: number;
  readonly payload: ProblemDetailsPayload;
  readonly retryAfterSeconds?: number;
}

const ERROR_TYPE_PREFIX = "https://api-sentinel.local/errors";

export function createProblemDetails(
  error: unknown,
  instancePath = "/",
  isProduction = process.env.NODE_ENV === "production",
): ProblemDetailsResult {
  let statusCode = 500;
  let errorType = "internal-error";
  let title = "Internal Server Error";
  let detail = "Terjadi kesalahan sistem internal yang tidak terduga.";
  let invalidParams: readonly { name: string; reason: string }[] | undefined;
  let retryAfterSeconds: number | undefined;

  // Unwrap nested cause (e.g. from H3Error / Nitro error hook wrapper)
  let actualError: unknown = error;
  while (
    actualError &&
    typeof actualError === "object" &&
    "cause" in actualError &&
    (actualError as { cause?: unknown }).cause
  ) {
    actualError = (actualError as { cause?: unknown }).cause;
  }

  const isDomain =
    actualError instanceof DomainException ||
    (typeof actualError === "object" &&
      actualError !== null &&
      "statusCode" in actualError &&
      typeof (actualError as { statusCode?: unknown }).statusCode === "number" &&
      "errorType" in actualError &&
      typeof (actualError as { errorType?: unknown }).errorType === "string");

  if (isDomain) {
    const domainErr = actualError as DomainException;
    statusCode = domainErr.statusCode;
    errorType = domainErr.errorType;
    title = domainErr.title || title;
    detail = domainErr.message || detail;

    if (
      "invalidParams" in domainErr &&
      Array.isArray((domainErr as unknown as { invalidParams: unknown }).invalidParams)
    ) {
      invalidParams = (
        domainErr as unknown as {
          invalidParams: readonly { name: string; reason: string }[];
        }
      ).invalidParams;
    }

    if (
      "retryAfterSeconds" in domainErr &&
      typeof (domainErr as unknown as { retryAfterSeconds: unknown }).retryAfterSeconds === "number"
    ) {
      retryAfterSeconds = (domainErr as unknown as { retryAfterSeconds: number }).retryAfterSeconds;
    }
  }

  const payload: ProblemDetailsPayload = {
    type: `${ERROR_TYPE_PREFIX}/${errorType}`,
    title,
    status: statusCode,
    detail,
    instance: instancePath,
    ...(invalidParams ? { invalidParams } : {}),
    ...(!isProduction && error instanceof Error && error.stack
      ? { debug: { stack: error.stack } }
      : {}),
  };

  return {
    statusCode,
    payload,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };
}
