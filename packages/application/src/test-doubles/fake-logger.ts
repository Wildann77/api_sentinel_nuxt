import type { LoggerPort } from "../ports/out/logger.port.js";

export interface LogEntry {
  readonly level: "info" | "warn" | "error" | "debug";
  readonly msg: string;
  readonly meta?: Record<string, unknown>;
  readonly timestamp: Date;
}

export class FakeLogger implements LoggerPort {
  public logs: LogEntry[] = [];
  private readonly bindings?: Record<string, unknown>;

  constructor(bindings?: Record<string, unknown>) {
    this.bindings = bindings;
  }

  public info(msg: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: "info", msg, meta: this.mergeMeta(meta), timestamp: new Date() });
  }

  public warn(msg: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: "warn", msg, meta: this.mergeMeta(meta), timestamp: new Date() });
  }

  public error(msg: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: "error", msg, meta: this.mergeMeta(meta), timestamp: new Date() });
  }

  public debug(msg: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: "debug", msg, meta: this.mergeMeta(meta), timestamp: new Date() });
  }

  public child(bindings?: Record<string, unknown>): FakeLogger {
    const merged = { ...this.bindings, ...bindings };
    const childLogger = new FakeLogger(merged);
    childLogger.logs = this.logs;
    return childLogger;
  }

  public clear(): void {
    this.logs = [];
  }

  private mergeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!this.bindings && !meta) return undefined;
    return { ...this.bindings, ...meta };
  }
}
