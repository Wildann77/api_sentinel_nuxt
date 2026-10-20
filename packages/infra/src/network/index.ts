export * from "./dns-resolver.js";
export * from "./node-http-ssrf-probe.adapter.js";
export * from "./probe-executor.js";
export * from "./request-builder.js";
export * from "./response-stream.js";
export * from "./ssrf-agent.js";

export interface NetworkProbeClient {
  readonly isSsrfSafe: boolean;
}
