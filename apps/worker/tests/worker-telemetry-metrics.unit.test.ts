import type { ExecuteScheduledCheckUseCase, LoggerPort } from "@sentinel/application";
import { getSentinelMetrics, resetSentinelMetrics } from "@sentinel/infra";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerHttpServer } from "../src/http-server.js";
import { ProbeCheckJobHandler } from "../src/jobs/probe-check.job.js";

describe("P13.1 & P13.2 — Worker Telemetry & Prometheus Metrics Integration", () => {
  let logger: LoggerPort;

  beforeEach(() => {
    resetSentinelMetrics();
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: () => logger,
    };
  });

  afterEach(() => {
    resetSentinelMetrics();
  });

  it("serves Prometheus formatted metrics via WorkerHttpServer /metrics", async () => {
    const server = new WorkerHttpServer({
      port: 0,
      workerId: "test-worker-1",
      getHeartbeatEpoch: () => 1730000100,
      getRunningJobs: () => 2,
      getJobLagSeconds: () => 1.25,
      logger,
    });

    await server.start();
    const port = server.port;

    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");

    const text = await res.text();
    expect(text).toContain(
      'sentinel_worker_heartbeat_timestamp{worker_id="test-worker-1"} 1730000100',
    );
    expect(text).toContain('sentinel_worker_job_lag_seconds{queue="probe:check"} 1.25');

    await server.stop();
  });

  it("records probe execution metrics and queue lag when probe check job runs", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      status: "EXECUTED",
      checkResultId: "chk-001",
      isSuccess: true,
      healthStatus: "UP",
      durationMs: 85,
      failureCategory: null,
    });

    const mockUseCase: ExecuteScheduledCheckUseCase = {
      execute: mockExecute,
    };

    let workHandler:
      | ((jobs: { id: string; data: ProbeCheckJobPayload }[]) => Promise<void>)
      | null = null;
    const mockBoss = {
      work: vi.fn().mockImplementation((_queue, _options, handler) => {
        workHandler = handler;
        return Promise.resolve("sub-1");
      }),
    };

    const handler = new ProbeCheckJobHandler(mockBoss as unknown as PgBoss, mockUseCase, logger, {
      concurrency: 5,
    });

    await handler.register();
    expect(workHandler).not.toBeNull();
    if (!workHandler) {
      throw new Error("workHandler not initialized");
    }

    const scheduledTime = new Date(Date.now() - 2000);
    await workHandler([
      {
        id: "job-1",
        data: {
          monitorId: "mon-probe-test",
          __traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
          scheduledFor: scheduledTime.toISOString(),
          triggerType: "SCHEDULED",
        },
      },
    ]);

    expect(mockExecute).toHaveBeenCalledTimes(1);

    const metrics = getSentinelMetrics();
    const text = await metrics.getMetrics();

    expect(text).toContain(
      'sentinel_probe_duration_ms_count{monitor_id="mon-probe-test",status="UP"} 1',
    );
    expect(text).toContain(
      'sentinel_probe_total{monitor_id="mon-probe-test",status="UP",cause_category="NONE"} 1',
    );
    expect(text).toContain('sentinel_incidents_active{monitor_id="mon-probe-test"} 0');
    expect(text).toContain('sentinel_worker_job_lag_seconds{queue="probe:check"}');
  });
});
