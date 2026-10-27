import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("P15.5 — Detail Monitor & Telemetri (/dashboard/monitors/[id]) (DES §5.5, US 16–20)", () => {
  const detailPagePath = resolve(__dirname, "../app/pages/dashboard/monitors/[id]/index.vue");
  const slideoverDrawerPath = resolve(__dirname, "../app/components/CheckInspectionDrawer.vue");

  it("all required files exist for P15.5", () => {
    expect(existsSync(detailPagePath)).toBe(true);
    expect(existsSync(slideoverDrawerPath)).toBe(true);
  });

  describe("Monitor Detail Page (/dashboard/monitors/[id]/index.vue)", () => {
    const content = readFileSync(detailPagePath, "utf-8");

    it("1. Header Banner: renders name, url, status badge, and control buttons", () => {
      expect(content).toContain("StatusBadge");
      expect(content).toContain("HttpMethodBadge");
      expect(content).toContain("monitor.url");
      expect(content).toContain("handleTriggerCheck");
      expect(content).toContain("handleTogglePause");
      expect(content).toContain("/edit");
      expect(content).toContain("isDeleteModalOpen");
    });

    it("2. Three Aggregation Cards: provides 24h, 7d, and 30d uptime & latency stats", () => {
      expect(content).toContain("24 JAM TERAKHIR");
      expect(content).toContain("7 HARI TERAKHIR");
      expect(content).toContain("30 HARI TERAKHIR");
      expect(content).toContain("uptime24h");
      expect(content).toContain("avgLatency24h");
      expect(content).toContain("uptime7d");
      expect(content).toContain("p95Latency7d");
      expect(content).toContain("uptime30d");
      expect(content).toContain("p99Latency30d");
    });

    it("3. Latency Chart: mounts LatencyChart with dynamic data", () => {
      expect(content).toContain("<LatencyChart");
      expect(content).toContain(':data="latencyChartData"');
      expect(content).toContain("selectedChartRange");
    });

    it("4. Checks History Table: renders UTable with 20 recent checks and [INSPECT] action", () => {
      expect(content).toContain("<UTable");
      expect(content).toContain("checksList");
      expect(content).toContain("openInspection");
      expect(content).toContain("[INSPECT]");
      expect(content).toContain("UtcTime");
    });

    it("5. Inspection Drawer Integration: mounts CheckInspectionDrawer with slideover binding", () => {
      expect(content).toContain("<CheckInspectionDrawer");
      expect(content).toContain(':open="isInspectionOpen"');
      expect(content).toContain(':check-id="selectedCheckId"');
    });
  });

  describe("CheckInspectionDrawer.vue (DES §5.5, US 20)", () => {
    const content = readFileSync(slideoverDrawerPath, "utf-8");

    it("defines 480px width USlideover drawer on the right", () => {
      expect(content).toContain("<USlideover");
      expect(content).toContain('side="right"');
      expect(content).toContain("max-w-[480px]");
    });

    it("renders network diagnostics: failure category, socket IP pinning, and timing breakdown", () => {
      expect(content).toContain("detail.failureCategory");
      expect(content).toContain("SOCKET PINNED IP");
      expect(content).toContain("DNS DURATION");
      expect(content).toContain("CONNECT DURATION");
      expect(content).toContain("TLS HANDSHAKE");
      expect(content).toContain("TIME TO FIRST BYTE");
    });

    it("renders assertion evaluation checklist with [PASS] and [FAIL]", () => {
      expect(content).toContain("EVALUASI ASSERTIONS");
      expect(content).toContain("[PASS]");
      expect(content).toContain("[FAIL]");
      expect(content).toContain("rule.operator");
      expect(content).toContain("rule.expectedValue");
      expect(content).toContain("rule.actualValue");
    });

    it("renders HTTP request headers (sanitized) and response headers", () => {
      expect(content).toContain("HTTP REQUEST HEADERS");
      expect(content).toContain("HTTP RESPONSE HEADERS");
      expect(content).toContain("detail.diagnostics?.requestHeaders");
      expect(content).toContain("detail.diagnostics?.responseHeaders");
    });

    it("renders response body snippet up to 5 KB formatted JSON", () => {
      expect(content).toContain("CUPLIKAN RESPONSE BODY");
      expect(content).toContain("formattedBodySnippet");
    });
  });
});
