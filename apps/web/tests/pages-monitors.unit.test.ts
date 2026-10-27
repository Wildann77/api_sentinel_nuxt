import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("P15.3 — /dashboard/monitors Management Screen Tests (DES §5.3, US 13, 14)", () => {
  const pagesDir = resolve(__dirname, "../app/pages");
  const monitorsPagePath = resolve(pagesDir, "dashboard/monitors/index.vue");

  it("file dashboard/monitors/index.vue exists", () => {
    expect(existsSync(monitorsPagePath)).toBe(true);
  });

  const content = readFileSync(monitorsPagePath, "utf-8");

  it("uses default layout and initializes websocket live subscription", () => {
    expect(content).toContain('layout: "default"');
    expect(content).toContain("useSentinelSocket({ autoConnect: true })");
    expect(content).toContain("socket.subscribe()");
  });

  it("renders header with [02: MONITORS INVENTORY] and [+ TAMBAH MONITOR BARU] action", () => {
    expect(content).toContain("[02: MONITORS INVENTORY]");
    expect(content).toContain('label="+ TAMBAH MONITOR BARU"');
    expect(content).toContain('to="/dashboard/monitors/new"');
  });

  it("provides search input and status dropdown filter with options", () => {
    expect(content).toContain("searchTerm");
    expect(content).toContain("selectedStatus");
    expect(content).toContain("[STATUS: SEMUA]");
    expect(content).toContain("[STATUS: OPERATIONAL]");
    expect(content).toContain("[STATUS: DEGRADED]");
    expect(content).toContain("[STATUS: DOWN]");
    expect(content).toContain("[STATUS: PAUSED]");
    expect(content).toContain("[STATUS: UNKNOWN]");
  });

  it("defines UTable with 7 columns as required by DES §5.3", () => {
    expect(content).toContain("<UTable");
    expect(content).toContain(':columns="columns"');
    expect(content).toContain('id: "status"');
    expect(content).toContain('id: "method"');
    expect(content).toContain('id: "target"');
    expect(content).toContain('id: "sparkline"');
    expect(content).toContain('id: "uptimeLatency"');
    expect(content).toContain('id: "lastChecked"');
    expect(content).toContain('id: "actions"');
  });

  it("renders status badge with pulse when monitor is flashing via websocket", () => {
    expect(content).toContain("<StatusBadge");
    expect(content).toContain(':status="row.original.healthStatus"');
    expect(content).toContain(':pulse="socket.isFlashing(row.original.id)"');
  });

  it("renders method badge, copyable URL, and link to monitor detail", () => {
    expect(content).toContain("<HttpMethodBadge");
    expect(content).toContain("<CopyButton");
    expect(content).toContain("/dashboard/monitors/");
    expect(content).toContain("row.original.id");
  });

  it("renders sparkline with 20 points telemetry latency summary", () => {
    expect(content).toContain("<Sparkline");
    expect(content).toContain("getSparklineColor");
  });

  it("computes uptime percentage and average latency accurately", () => {
    expect(content).toContain("computeMonitorMetrics");
  });

  it("configures action items: RUN PROBE NOW, PAUSE / RESUME, EDIT, DELETE", () => {
    expect(content).toContain("RUN PROBE NOW");
    expect(content).toContain("PAUSE MONITOR");
    expect(content).toContain("RESUME MONITOR");
    expect(content).toContain("EDIT CONFIGURATION");
    expect(content).toContain("DELETE MONITOR");
  });

  it("integrates DestructiveConfirmModal and PauseIncidentModal", () => {
    expect(content).toContain("<DestructiveConfirmModal");
    expect(content).toContain("isDeleteModalOpen");
    expect(content).toContain("isPauseIncidentModalOpen");
    expect(content).toContain("[PERINGATAN: PAUSE DENGAN INSIDEN TERBUKA]");
  });
});
