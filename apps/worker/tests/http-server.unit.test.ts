import type { LoggerPort } from "@sentinel/application";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkerHttpServer } from "../src/http-server.js";

const mockLogger: LoggerPort = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: () => mockLogger,
};

describe("WorkerHttpServer (P9.1)", () => {
  let server: WorkerHttpServer | null = null;
  const testPort = 3199;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it("serves 200 OK on /healthz when healthy", async () => {
    server = new WorkerHttpServer({
      port: testPort,
      workerId: "worker-http-test",
      getHeartbeatEpoch: () => 1740000000,
      getRunningJobs: () => 0,
      checkHealth: async () => true,
      logger: mockLogger,
    });

    await server.start();

    const res = await fetch(`http://127.0.0.1:${testPort}/healthz`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.workerId).toBe("worker-http-test");
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("serves 503 on /healthz when health check fails", async () => {
    server = new WorkerHttpServer({
      port: testPort,
      workerId: "worker-http-test",
      getHeartbeatEpoch: () => 1740000000,
      getRunningJobs: () => 0,
      checkHealth: async () => false,
      logger: mockLogger,
    });

    await server.start();

    const res = await fetch(`http://127.0.0.1:${testPort}/healthz`);
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("unhealthy");
  });

  it("serves Prometheus formatted metrics on /metrics", async () => {
    server = new WorkerHttpServer({
      port: testPort,
      workerId: "worker-http-test",
      getHeartbeatEpoch: () => 1740000000,
      getRunningJobs: () => 2,
      getJobLagSeconds: () => 1.5,
      logger: mockLogger,
    });

    await server.start();

    const res = await fetch(`http://127.0.0.1:${testPort}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");

    const text = await res.text();
    expect(text).toContain(
      'sentinel_worker_heartbeat_timestamp{worker_id="worker-http-test"} 1740000000',
    );
    expect(text).toContain('sentinel_worker_active_jobs{worker_id="worker-http-test"} 2');
    expect(text).toContain('sentinel_worker_job_lag_seconds{queue="probe:check"} 1.5');
    expect(text).toContain('sentinel_worker_uptime_seconds{worker_id="worker-http-test"}');
  });

  it("returns 404 for unknown endpoints", async () => {
    server = new WorkerHttpServer({
      port: testPort,
      workerId: "worker-http-test",
      getHeartbeatEpoch: () => 1740000000,
      getRunningJobs: () => 0,
      logger: mockLogger,
    });

    await server.start();

    const res = await fetch(`http://127.0.0.1:${testPort}/not-found`);
    expect(res.status).toBe(404);
  });
});
