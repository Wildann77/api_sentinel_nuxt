import type {
  RecordSpanParams,
  TelemetryPort,
  TelemetrySpanOptions,
} from "../ports/out/telemetry.port.js";

export class NoopTelemetryPort implements TelemetryPort {
  public recordedSpans: RecordSpanParams[] = [];
  public spanCalls: string[] = [];

  public async withSpan<T>(
    name: string,
    _options: TelemetrySpanOptions | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    this.spanCalls.push(name);
    return await fn();
  }

  public recordSpan(params: RecordSpanParams): void {
    this.recordedSpans.push(params);
  }

  public clear(): void {
    this.recordedSpans = [];
    this.spanCalls = [];
  }
}
