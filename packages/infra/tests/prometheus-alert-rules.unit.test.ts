import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("P13.4 — Prometheus Alert Rules Unit Tests", () => {
  const rootDir = path.resolve(__dirname, "../../..");
  const alertsFilePath = path.join(rootDir, "infra/prometheus/alerts.yml");
  const prometheusFilePath = path.join(rootDir, "infra/prometheus/prometheus.yml");

  it("defines SentinelWorkerDown and SentinelHighJobLag in alerts.yml", () => {
    expect(fs.existsSync(alertsFilePath)).toBe(true);

    const content = fs.readFileSync(alertsFilePath, "utf8");

    expect(content).toContain("name: sentinel_alerts");
    expect(content).toContain("alert: SentinelWorkerDown");
    expect(content).toContain("expr: (time() - sentinel_worker_heartbeat_timestamp) > 60");
    expect(content).toContain("for: 1m");
    expect(content).toContain("severity: critical");
    expect(content).toContain(
      'summary: "Worker API Sentinel berhenti berdetak (Dead-Man\'s Switch)"',
    );

    expect(content).toContain("alert: SentinelHighJobLag");
    expect(content).toContain("expr: sentinel_worker_job_lag_seconds > 30");
    expect(content).toContain("for: 2m");
    expect(content).toContain("severity: warning");
    expect(content).toContain(
      'summary: "Antrean pemantauan mengalami backlog lebih dari 30 detik"',
    );
  });

  it("registers alerts file in prometheus.yml rule_files", () => {
    expect(fs.existsSync(prometheusFilePath)).toBe(true);

    const content = fs.readFileSync(prometheusFilePath, "utf8");

    expect(content).toContain("rule_files:");
    expect(content).toMatch(/alerts\.yml/);
  });
});
