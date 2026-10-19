export interface TelemetrySpanOptions {
  readonly parentTraceparent?: string | null;
  readonly attributes?: Record<string, string | number | boolean>;
}

export interface RecordSpanParams {
  readonly name: string;
  readonly durationMs?: number;
  readonly startTime?: number | Date;
  readonly endTime?: number | Date;
  readonly attributes?: Record<string, string | number | boolean>;
  readonly error?: unknown;
}

export interface TelemetryPort {
  withSpan<T>(
    name: string,
    options: TelemetrySpanOptions | undefined,
    fn: () => Promise<T>,
  ): Promise<T>;

  recordSpan(params: RecordSpanParams): void;
}
