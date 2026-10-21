import type {
  NetworkProbePort,
  ProbeRequest,
  ProbeResult,
} from "../ports/out/network-probe.port.js";

export class FakeProbe implements NetworkProbePort {
  public history: ProbeRequest[] = [];
  private queuedResponses: ProbeResult[] = [];
  private customHandler?: (request: ProbeRequest) => Promise<ProbeResult> | ProbeResult;

  public async probe(request: ProbeRequest): Promise<ProbeResult> {
    this.history.push({ ...request });

    if (this.customHandler) {
      return this.customHandler(request);
    }

    const next = this.queuedResponses.shift();
    if (next) {
      return next;
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      bodySnippet: '{"status":"ok"}',
      durationMs: 25,
      dnsDurationMs: 5,
      connectDurationMs: 5,
      tlsDurationMs: 10,
      firstByteDurationMs: 5,
      pinnedIp: "93.184.216.34",
      errorCategory: null,
      errorMessage: null,
    };
  }

  public enqueueResponse(result: Partial<ProbeResult>): void {
    this.queuedResponses.push({
      statusCode: result.statusCode ?? 200,
      headers: result.headers ?? { "content-type": "application/json" },
      bodySnippet: result.bodySnippet ?? '{"status":"ok"}',
      durationMs: result.durationMs ?? 20,
      dnsDurationMs: result.dnsDurationMs ?? 2,
      connectDurationMs: result.connectDurationMs ?? 3,
      tlsDurationMs: result.tlsDurationMs ?? 5,
      firstByteDurationMs: result.firstByteDurationMs ?? 10,
      pinnedIp: result.pinnedIp ?? "93.184.216.34",
      errorCategory: result.errorCategory ?? null,
      errorMessage: result.errorMessage ?? null,
    });
  }

  public setHandler(handler: (request: ProbeRequest) => Promise<ProbeResult> | ProbeResult): void {
    this.customHandler = handler;
  }

  public reset(): void {
    this.history = [];
    this.queuedResponses = [];
    this.customHandler = undefined;
  }
}
