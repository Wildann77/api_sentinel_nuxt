import { beforeEach, describe, expect, it } from "vitest";
import { SentinelMetrics } from "../src/telemetry/metrics.js";

describe("P13.2 — SentinelMetrics Prometheus Registry Unit Tests", () => {
  let metrics: SentinelMetrics;

  beforeEach(() => {
    metrics = new SentinelMetrics();
  });

  it("records probe duration and total count metrics accurately", async () => {
    metrics.recordProbe({
      monitorId: "mon-123",
      isSuccess: true,
      durationMs: 145,
    });

    metrics.recordProbe({
      monitorId: "mon-123",
      isSuccess: false,
      durationMs: 450,
      failureCategory: "HTTP_5XX",
    });

    const output = await metrics.getMetrics();

    expect(output).toContain("sentinel_probe_duration_ms_bucket");
    expect(output).toContain(
      'sentinel_probe_duration_ms_count{monitor_id="mon-123",status="UP"} 1',
    );
    expect(output).toContain(
      'sentinel_probe_duration_ms_count{monitor_id="mon-123",status="DOWN"} 1',
    );
    expect(output).toContain(
      'sentinel_probe_total{monitor_id="mon-123",status="UP",cause_category="NONE"} 1',
    );
    expect(output).toContain(
      'sentinel_probe_total{monitor_id="mon-123",status="DOWN",cause_category="HTTP_5XX"} 1',
    );
  });

  it("updates incident active gauge (1 for DOWN, 0 for UP)", async () => {
    metrics.setIncidentActive({ monitorId: "mon-456", isActive: true });
    let output = await metrics.getMetrics();
    expect(output).toContain('sentinel_incidents_active{monitor_id="mon-456"} 1');

    metrics.setIncidentActive({ monitorId: "mon-456", isActive: false });
    output = await metrics.getMetrics();
    expect(output).toContain('sentinel_incidents_active{monitor_id="mon-456"} 0');
  });

  it("updates worker job lag and heartbeat timestamp gauges", async () => {
    metrics.setJobLag({ queue: "probe:check", lagSeconds: 2.5 });
    metrics.setWorkerHeartbeat({ workerId: "worker-prod-1", timestampEpochSeconds: 1730000000 });

    const output = await metrics.getMetrics();
    expect(output).toContain('sentinel_worker_job_lag_seconds{queue="probe:check"} 2.5');
    expect(output).toContain(
      'sentinel_worker_heartbeat_timestamp{worker_id="worker-prod-1"} 1730000000',
    );
  });

  it("guards cardinality by pruning deleted or inactive monitor labels", async () => {
    metrics.recordProbe({ monitorId: "mon-active", isSuccess: true, durationMs: 50 });
    metrics.recordProbe({ monitorId: "mon-deleted", isSuccess: false, durationMs: 100 });

    let output = await metrics.getMetrics();
    expect(output).toContain('monitor_id="mon-deleted"');

    // Remove single monitor
    metrics.removeMonitor("mon-deleted");
    output = await metrics.getMetrics();
    expect(output).not.toContain('monitor_id="mon-deleted"');
    expect(output).toContain('monitor_id="mon-active"');

    // Prune set of monitors
    metrics.recordProbe({ monitorId: "mon-stale", isSuccess: true, durationMs: 70 });
    metrics.pruneMonitors(new Set(["mon-active"]));
    output = await metrics.getMetrics();
    expect(output).not.toContain('monitor_id="mon-stale"');
    expect(output).toContain('monitor_id="mon-active"');
  });

  it("returns correct Prometheus exposition Content-Type", () => {
    expect(metrics.getContentType()).toContain("text/plain");
  });
});
