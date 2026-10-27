import type { InvalidParamDto, ProblemDetailsDto } from "@sentinel/contracts";

export class ApiClientError extends Error {
  public readonly problem: ProblemDetailsDto;
  public readonly status: number;
  public readonly title: string;
  public readonly detail: string;
  public readonly type: string;
  public readonly instance?: string;
  public readonly invalidParams?: InvalidParamDto[];

  constructor(problem: ProblemDetailsDto) {
    super(problem.detail || problem.title || "API Request Failed");
    this.name = "ApiClientError";
    this.problem = problem;
    this.status = problem.status;
    this.title = problem.title;
    this.detail = problem.detail;
    this.type = problem.type;
    this.instance = problem.instance;
    this.invalidParams = problem.invalidParams;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function parseProblemDetails(err: unknown, fallbackUrl = ""): ProblemDetailsDto {
  if (err instanceof ApiClientError) {
    return err.problem;
  }

  const maybeObj = err as {
    data?: unknown;
    status?: number;
    statusCode?: number;
    response?: { _data?: unknown; status?: number };
    message?: string;
  };

  const rawData = maybeObj?.data ?? maybeObj?.response?._data;

  if (rawData && typeof rawData === "object") {
    const p = rawData as Partial<ProblemDetailsDto>;
    if (typeof p.title === "string" && typeof p.status === "number") {
      return {
        type: p.type || "urn:problem:general",
        title: p.title,
        status: p.status,
        detail: p.detail || "",
        instance: p.instance || fallbackUrl,
        invalidParams: Array.isArray(p.invalidParams) ? p.invalidParams : undefined,
      };
    }
  }

  if (typeof rawData === "string") {
    try {
      const parsed = JSON.parse(rawData);
      if (parsed && typeof parsed.title === "string" && typeof parsed.status === "number") {
        return {
          type: parsed.type || "urn:problem:general",
          title: parsed.title,
          status: parsed.status,
          detail: parsed.detail || "",
          instance: parsed.instance || fallbackUrl,
          invalidParams: Array.isArray(parsed.invalidParams) ? parsed.invalidParams : undefined,
        };
      }
    } catch {
      // Not JSON string
    }
  }

  const status = maybeObj?.statusCode ?? maybeObj?.status ?? 500;
  const message =
    maybeObj?.message ||
    (err instanceof Error ? err.message : "Kesalahan koneksi atau respons server tidak terduga.");

  return {
    type: "urn:problem:client-network-error",
    title: status >= 500 ? "Internal Server Error" : "Request Failed",
    status,
    detail: message,
    instance: fallbackUrl,
  };
}

export type ApiFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function apiFetch<T>(request: string, options?: ApiFetchOptions): Promise<T> {
  try {
    return await $fetch<T>(request, {
      ...options,
      headers: {
        Accept: "application/json, application/problem+json",
        ...options?.headers,
      },
    });
  } catch (err: unknown) {
    const problem = parseProblemDetails(err, request);
    throw new ApiClientError(problem);
  }
}
