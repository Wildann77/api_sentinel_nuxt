import type { AuthConfig, FailureCategory } from "@sentinel/domain";

export interface ProbeRequest {
  readonly url: string;
  readonly method: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly authConfig?: AuthConfig | null;
  readonly timeoutMs: number;
  readonly needsResponseBody?: boolean;
}

export interface ProbeResult {
  readonly statusCode: number | null;
  readonly headers: Record<string, string>;
  readonly bodySnippet: string | null;
  readonly durationMs: number | null;
  readonly dnsDurationMs: number | null;
  readonly connectDurationMs: number | null;
  readonly tlsDurationMs: number | null;
  readonly firstByteDurationMs: number | null;
  readonly pinnedIp: string | null;
  readonly errorCategory: FailureCategory | null;
  readonly errorMessage: string | null;
}

export interface NetworkProbePort {
  probe(request: ProbeRequest): Promise<ProbeResult>;
}
