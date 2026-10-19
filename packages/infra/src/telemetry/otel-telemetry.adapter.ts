import type { RecordSpanParams, TelemetryPort, TelemetrySpanOptions } from "@sentinel/application";
import { recordChildSpan, withSpan } from "./otel-tracer.js";

export class OtelTelemetryAdapter implements TelemetryPort {
  public async withSpan<T>(
    name: string,
    options: TelemetrySpanOptions | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    return await withSpan(
      name,
      {
        parentTraceparent: options?.parentTraceparent,
        attributes: options?.attributes,
      },
      async () => {
        return await fn();
      },
    );
  }

  public recordSpan(params: RecordSpanParams): void {
    const startTime = params.startTime ?? Date.now() - (params.durationMs ?? 0);
    const endTime = params.endTime ?? Date.now();

    recordChildSpan({
      name: params.name,
      startTime,
      endTime,
      attributes: params.attributes,
      error: params.error,
    });
  }
}
