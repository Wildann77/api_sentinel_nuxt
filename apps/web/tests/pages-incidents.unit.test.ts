import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("P15.6 — /dashboard/incidents Screen Tests (DES §5.6, US 21–25)", () => {
  const pagesDir = resolve(__dirname, "../app/pages");
  const incidentsPagePath = resolve(pagesDir, "dashboard/incidents/index.vue");
  const drawerComponentPath = resolve(__dirname, "../app/components/IncidentInspectionDrawer.vue");

  it("file dashboard/incidents/index.vue and IncidentInspectionDrawer.vue exist", () => {
    expect(existsSync(incidentsPagePath)).toBe(true);
    expect(existsSync(drawerComponentPath)).toBe(true);
  });

  const content = readFileSync(incidentsPagePath, "utf-8");
  const drawerContent = readFileSync(drawerComponentPath, "utf-8");

  it("uses default layout and initializes websocket live subscription", () => {
    expect(content).toContain('layout: "default"');
    expect(content).toContain("useSentinelSocket({ autoConnect: true })");
    expect(content).toContain("socket.subscribe()");
  });

  it("renders header with [03: INCIDENTS MANAGEMENT]", () => {
    expect(content).toContain("[03: INCIDENTS MANAGEMENT]");
  });

  it("renders active incident banner with 2px rose border, stopwatch, and failure streak counter", () => {
    // 2px rose border
    expect(content).toContain("border-2 border-status-down");
    // stopwatch
    expect(content).toContain("DOWNTIME:");
    expect(content).toContain("formatStopwatch");
    // failure streak counter
    expect(content).toContain("KEGAGALAN BERTURUT-TURUT");
  });

  it("defines table archive with 9 columns required by DES §5.6", () => {
    expect(content).toContain("<UTable");
    expect(content).toContain(':columns="columns"');
    expect(content).toContain('id: "id"');
    expect(content).toContain('id: "monitor"');
    expect(content).toContain('id: "status"');
    expect(content).toContain('id: "openedAt"');
    expect(content).toContain('id: "resolvedAt"');
    expect(content).toContain('id: "duration"');
    expect(content).toContain('id: "cause"');
    expect(content).toContain('id: "notifications"');
    expect(content).toContain('id: "actions"');
  });

  it("supports badges: OPEN, RECOVERING, and RESOLVED", () => {
    expect(content).toContain("OPEN");
    expect(content).toContain("RECOVERING");
    expect(content).toContain("RESOLVED");
  });

  it("provides filter controls for monitor selection and incident status", () => {
    expect(content).toContain("selectedMonitorId");
    expect(content).toContain("selectedStatus");
    expect(content).toContain("[SEMUA MONITOR]");
    expect(content).toContain("[STATUS: SEMUA]");
    expect(content).toContain("[STATUS: OPEN]");
    expect(content).toContain("[STATUS: RECOVERING]");
    expect(content).toContain("[STATUS: RESOLVED]");
  });

  it("integrates IncidentInspectionDrawer slideover for detailed drilldown", () => {
    expect(content).toContain("<IncidentInspectionDrawer");
    expect(content).toContain("isInspectionOpen");
    expect(content).toContain("selectedIncidentId");
    expect(drawerContent).toContain("<USlideover");
    expect(drawerContent).toContain("[INSPEKSI DETAIL INSIDEN GANGGUAN]");
    expect(drawerContent).toContain("DISPATCH NOTIFIKASI TELEGRAM");
    expect(drawerContent).toContain("ZERO-SPAM POLICY");
  });

  it("normalizes dropdown select values and binds value-key and label-key", () => {
    expect(content).toContain("extractSelectValue");
    expect(content).toContain('value-key="value"');
    expect(content).toContain('label-key="label"');
  });

  it("provides manual refresh handler with loading state", () => {
    expect(content).toContain("handleManualRefresh");
    expect(content).toContain("isRefreshing");
    expect(content).toContain(':loading="isRefreshing"');
    expect(content).toContain('@click="handleManualRefresh"');
  });

  it("ensures responsive 9-column table layout with overflow-x-auto and whitespace-nowrap", () => {
    expect(content).toContain("overflow-x-auto");
    expect(content).toContain("whitespace-nowrap");
  });
});
