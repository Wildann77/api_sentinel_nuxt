import { DomainException, RateLimitExceededException, ValidationException } from "@sentinel/domain";

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

  if (error instanceof DomainException) {
    statusCode = error.statusCode;
    errorType = error.errorType;
    title = error.title;
    detail = error.message;

    if (error instanceof ValidationException && error.invalidParams.length > 0) {
      invalidParams = error.invalidParams;
    }

    if (error instanceof RateLimitExceededException) {
      retryAfterSeconds = error.retryAfterSeconds;
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
