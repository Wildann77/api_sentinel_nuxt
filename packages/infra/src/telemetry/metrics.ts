import { Counter, Gauge, Histogram, Registry } from "prom-client";

export const PROBE_DURATION_BUCKETS = [50, 100, 250, 500, 1000, 2500, 5000, 10000];

export interface RecordProbeMetricsParams {
  readonly monitorId: string;
  readonly isSuccess: boolean;
  readonly durationMs: number | null;
  readonly failureCategory?: string | null;
}

export interface SetIncidentActiveParams {
  readonly monitorId: string;
  readonly isActive: boolean;
}

export interface SetJobLagSecondsParams {
  readonly workerId?: string;
  readonly queue?: string;
  readonly lagSeconds: number;
}

export interface SetWorkerHeartbeatParams {
  readonly workerId: string;
  readonly timestampEpochSeconds: number;
}

export class SentinelMetrics {
  public readonly registry: Registry;
  public readonly probeDurationMs: Histogram<"monitor_id" | "status">;
  public readonly probeTotal: Counter<"monitor_id" | "status" | "cause_category">;
  public readonly incidentsActive: Gauge<"monitor_id">;
  public readonly workerJobLagSeconds: Gauge<"queue">;
  public readonly workerHeartbeatTimestamp: Gauge<"worker_id">;
  public readonly workerActiveJobs: Gauge<"worker_id">;
  public readonly workerUptimeSeconds: Gauge<"worker_id">;

  private readonly knownMonitors = new Set<string>();

  constructor(registry?: Registry) {
    this.registry = registry ?? new Registry();

    this.probeDurationMs = new Histogram({
      name: "sentinel_probe_duration_ms",
      help: "Distribusi durasi probe HTTP dalam milidetik",
      labelNames: ["monitor_id", "status"],
      buckets: PROBE_DURATION_BUCKETS,
      registers: [this.registry],
    });

    this.probeTotal = new Counter({
      name: "sentinel_probe_total",
      help: "Total pemeriksaan yang dieksekusi per monitor dan kategori kegagalan",
      labelNames: ["monitor_id", "status", "cause_category"],
      registers: [this.registry],
    });

    this.incidentsActive = new Gauge({
      name: "sentinel_incidents_active",
      help: "Jumlah insiden yang saat ini berstatus terbuka (1 jika DOWN, 0 jika UP)",
      labelNames: ["monitor_id"],
      registers: [this.registry],
    });

    this.workerJobLagSeconds = new Gauge({
      name: "sentinel_worker_job_lag_seconds",
      help: "Selisih detik antara next_run_at yang dijadwalkan dengan waktu aktual eksekusi worker",
      labelNames: ["queue"],
      registers: [this.registry],
    });

    this.workerHeartbeatTimestamp = new Gauge({
      name: "sentinel_worker_heartbeat_timestamp",
      help: "Worker last heartbeat epoch timestamp.",
      labelNames: ["worker_id"],
      registers: [this.registry],
    });

    this.workerActiveJobs = new Gauge({
      name: "sentinel_worker_active_jobs",
      help: "Number of currently running jobs.",
      labelNames: ["worker_id"],
      registers: [this.registry],
    });

    this.workerUptimeSeconds = new Gauge({
      name: "sentinel_worker_uptime_seconds",
      help: "Worker uptime in seconds.",
      labelNames: ["worker_id"],
      registers: [this.registry],
    });
  }

  public recordProbe(params: RecordProbeMetricsParams): void {
    const monitorId = this.sanitizeMonitorId(params.monitorId);
    this.knownMonitors.add(monitorId);

    const status = params.isSuccess ? "UP" : "DOWN";
    const causeCategory = params.failureCategory ?? "NONE";

    this.probeTotal.inc({ monitor_id: monitorId, status, cause_category: causeCategory });

    if (typeof params.durationMs === "number" && !Number.isNaN(params.durationMs)) {
      this.probeDurationMs.observe({ monitor_id: monitorId, status }, params.durationMs);
    }
  }

  public setIncidentActive(params: SetIncidentActiveParams): void {
    const monitorId = this.sanitizeMonitorId(params.monitorId);
    this.knownMonitors.add(monitorId);
    this.incidentsActive.set({ monitor_id: monitorId }, params.isActive ? 1 : 0);
  }

  public setJobLag(params: SetJobLagSecondsParams): void {
    const queue = (params.queue ?? "probe:check").trim();
    const lag = Math.max(0, params.lagSeconds);
    this.workerJobLagSeconds.set({ queue }, lag);
  }

  public setWorkerHeartbeat(params: SetWorkerHeartbeatParams): void {
    const workerId = params.workerId.trim() || "default";
    this.workerHeartbeatTimestamp.set({ worker_id: workerId }, params.timestampEpochSeconds);
  }

  public setWorkerActiveJobs(workerId: string, count: number): void {
    const id = workerId.trim() || "default";
    this.workerActiveJobs.set({ worker_id: id }, Math.max(0, count));
  }

  public setWorkerUptime(workerId: string, uptimeSeconds: number): void {
    const id = workerId.trim() || "default";
    this.workerUptimeSeconds.set({ worker_id: id }, Math.max(0, uptimeSeconds));
  }

  public removeMonitor(monitorId: string): void {
    const sanitized = this.sanitizeMonitorId(monitorId);
    this.knownMonitors.delete(sanitized);

    this.probeDurationMs.remove({ monitor_id: sanitized, status: "UP" });
    this.probeDurationMs.remove({ monitor_id: sanitized, status: "DOWN" });

    this.probeTotal.remove({ monitor_id: sanitized, status: "UP", cause_category: "NONE" });
    this.probeTotal.remove({ monitor_id: sanitized, status: "DOWN", cause_category: "NONE" });

    this.incidentsActive.remove({ monitor_id: sanitized });
  }

  public pruneMonitors(activeMonitorIds: Set<string>): void {
    for (const monitorId of this.knownMonitors) {
      if (!activeMonitorIds.has(monitorId)) {
        this.removeMonitor(monitorId);
      }
    }
  }

  public async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  public getContentType(): string {
    return this.registry.contentType;
  }

  public clear(): void {
    this.knownMonitors.clear();
    this.registry.clear();
  }

  private sanitizeMonitorId(raw: string): string {
    const cleaned = String(raw).trim();
    if (!cleaned) {
      return "unknown";
    }
    return cleaned.slice(0, 64);
  }
}

let defaultMetricsInstance: SentinelMetrics | null = null;

export function getSentinelMetrics(): SentinelMetrics {
  if (!defaultMetricsInstance) {
    defaultMetricsInstance = new SentinelMetrics();
  }
  return defaultMetricsInstance;
}

export function resetSentinelMetrics(): void {
  if (defaultMetricsInstance) {
    defaultMetricsInstance.clear();
    defaultMetricsInstance = null;
  }
}
