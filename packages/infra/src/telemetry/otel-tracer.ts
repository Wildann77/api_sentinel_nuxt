import {
  context,
  type Span,
  SpanKind,
  SpanStatusCode,
  type Tracer,
  trace,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { traceparentToSpanContext } from "./w3c-trace.js";

export interface TelemetryConfig {
  readonly serviceName?: string;
  readonly endpoint?: string;
  readonly enabled?: boolean;
}

let sdkInstance: NodeSDK | null = null;
let isStarted = false;

export async function initTelemetry(config: TelemetryConfig = {}): Promise<NodeSDK | null> {
  const enabled = config.enabled ?? process.env.OTEL_ENABLED !== "false";
  if (!enabled || isStarted) {
    return sdkInstance;
  }

  const serviceName = config.serviceName ?? process.env.OTEL_SERVICE_NAME ?? "api-sentinel";
  const endpoint =
    config.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318/v1/traces";

  const exporter = new OTLPTraceExporter({
    url: endpoint,
  });

  const resource = resourceFromAttributes({
    "service.name": serviceName,
  });

  const sdk = new NodeSDK({
    serviceName,
    resource,
    traceExporter: exporter,
  });

  try {
    sdk.start();
    sdkInstance = sdk;
    isStarted = true;
  } catch (error) {
    console.warn("Failed to initialize OpenTelemetry SDK:", error);
    sdkInstance = null;
    isStarted = false;
  }

  return sdkInstance;
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdkInstance && isStarted) {
    try {
      await sdkInstance.shutdown();
    } catch (error) {
      console.warn("Error during OpenTelemetry SDK shutdown:", error);
    } finally {
      sdkInstance = null;
      isStarted = false;
    }
  }
}

export function getTracer(name = "api-sentinel"): Tracer {
  return trace.getTracer(name);
}

export async function withSpan<T>(
  name: string,
  options: {
    readonly parentTraceparent?: string | null;
    readonly attributes?: Record<string, string | number | boolean>;
    readonly kind?: SpanKind;
  },
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = getTracer();
  let ctx = context.active();

  if (options.parentTraceparent) {
    const parentSpanContext = traceparentToSpanContext(options.parentTraceparent);
    if (parentSpanContext) {
      ctx = trace.setSpanContext(ctx, parentSpanContext);
    }
  }

  const span = tracer.startSpan(
    name,
    {
      kind: options.kind ?? SpanKind.INTERNAL,
      attributes: options.attributes,
    },
    ctx,
  );

  return context.with(trace.setSpan(ctx, span), async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

export interface RecordChildSpanParams {
  readonly name: string;
  readonly parentTraceparent?: string | null;
  readonly startTime: number | Date;
  readonly endTime: number | Date;
  readonly attributes?: Record<string, string | number | boolean>;
  readonly error?: unknown;
}

export function recordChildSpan(params: RecordChildSpanParams): void {
  const tracer = getTracer();
  let ctx = context.active();

  if (params.parentTraceparent) {
    const parentSpanContext = traceparentToSpanContext(params.parentTraceparent);
    if (parentSpanContext) {
      ctx = trace.setSpanContext(ctx, parentSpanContext);
    }
  }

  const startTimeMs =
    params.startTime instanceof Date ? params.startTime.getTime() : params.startTime;
  const endTimeMs = params.endTime instanceof Date ? params.endTime.getTime() : params.endTime;

  const span = tracer.startSpan(
    params.name,
    {
      kind: SpanKind.INTERNAL,
      attributes: params.attributes,
      startTime: startTimeMs,
    },
    ctx,
  );

  if (params.error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: params.error instanceof Error ? params.error.message : String(params.error),
    });
    span.recordException(
      params.error instanceof Error ? params.error : new Error(String(params.error)),
    );
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }

  span.end(endTimeMs);
}
