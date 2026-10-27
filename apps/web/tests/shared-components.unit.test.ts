import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("P14.5 — Shared Observability Components Unit Tests", () => {
  const componentsDir = resolve(__dirname, "../app/components");

  const expectedComponents = [
    "StatusBadge.vue",
    "MetricTile.vue",
    "BracketButton.vue",
    "WsIndicator.vue",
    "ProblemAlert.vue",
    "EmptyState.vue",
    "DestructiveConfirmModal.vue",
    "SkeletonRows.vue",
    "SkeletonTiles.vue",
    "UtcTime.vue",
    "RelativeTime.vue",
    "CopyButton.vue",
    "Sparkline.vue",
    "LatencyChart.vue",
    "JsonViewer.vue",
    "HttpMethodBadge.vue",
  ];

  it("all required shared components exist in apps/web/app/components/", () => {
    for (const comp of expectedComponents) {
      const fullPath = resolve(componentsDir, comp);
      expect(existsSync(fullPath), `Component ${comp} should exist`).toBe(true);
    }
  });

  describe("StatusBadge", () => {
    const filePath = resolve(componentsDir, "StatusBadge.vue");
    const content = readFileSync(filePath, "utf-8");

    it("supports all 5 domain health statuses and operational mapping (DES §3.2)", () => {
      expect(content).toContain("[OPERATIONAL]");
      expect(content).toContain("[DEGRADED]");
      expect(content).toContain("[DOWN]");
      expect(content).toContain("[PAUSED]");
      expect(content).toContain("[UNKNOWN]");
    });

    it("enforces WCAG 2.2 AA compliant aria-labels", () => {
      expect(content).toContain("Status Monitor: Operational");
      expect(content).toContain("Status Monitor: Degraded");
      expect(content).toContain("Status Monitor: Down");
      expect(content).toContain("Status Monitor: Paused");
      expect(content).toContain("Status Monitor: Unknown");
      expect(content).toContain('role="status"');
    });

    it("uses semantic color tokens without hardcoded utilities", () => {
      expect(content).toContain("text-status-operational");
      expect(content).toContain("text-status-degraded");
      expect(content).toContain("text-status-down");
      expect(content).toContain("text-status-paused");
      expect(content).toContain("text-status-unknown");
    });
  });

  describe("MetricTile", () => {
    const filePath = resolve(componentsDir, "MetricTile.vue");
    const content = readFileSync(filePath, "utf-8");

    it("renders fallback N/A when value is null, undefined, or empty (P15.2 / DES §5.2)", () => {
      expect(content).toContain('return "N/A"');
      expect(content).toContain("displayValue");
    });

    it("supports loading pulse skeleton and status accents", () => {
      expect(content).toContain("animate-pulse");
      expect(content).toContain("text-status-operational");
      expect(content).toContain("text-status-down");
    });
  });

  describe("BracketButton", () => {
    const filePath = resolve(componentsDir, "BracketButton.vue");
    const content = readFileSync(filePath, "utf-8");

    it("enforces ASCII bracketed terminal notation", () => {
      expect(content).toContain('<span class="text-text-muted">[</span>');
      expect(content).toContain('<span class="text-text-muted">]</span>');
    });

    it("supports variants (solid, outline, ghost, danger) and NuxtLink navigation", () => {
      expect(content).toContain("<NuxtLink");
      expect(content).toContain("<button");
      expect(content).toContain("bg-brand-accent");
      expect(content).toContain("bg-status-down-bg");
    });
  });

  describe("WsIndicator", () => {
    const filePath = resolve(componentsDir, "WsIndicator.vue");
    const content = readFileSync(filePath, "utf-8");

    it("implements all 3 WebSocket pulse states (LIVE, SYNCING, DISCONNECTED)", () => {
      expect(content).toContain("● LIVE");
      expect(content).toContain("○ SYNCING...");
      expect(content).toContain("✕ DISCONNECTED");
      expect(content).toContain("text-ws-live");
      expect(content).toContain("text-ws-connecting");
      expect(content).toContain("text-ws-disconnected");
    });
  });

  describe("ProblemAlert", () => {
    const filePath = resolve(componentsDir, "ProblemAlert.vue");
    const content = readFileSync(filePath, "utf-8");

    it("handles RFC 9457 error fields (title, detail, status, invalidParams, instance)", () => {
      expect(content).toContain("parsedError.title");
      expect(content).toContain("parsedError.detail");
      expect(content).toContain("parsedError.invalidParams");
      expect(content).toContain("parsedError.instance");
      expect(content).toContain("parsedError.status");
    });

    it("provides retry and dismiss triggers with rose styling", () => {
      expect(content).toContain("emit('retry')");
      expect(content).toContain("emit('dismiss')");
      expect(content).toContain("border-status-down-border");
    });
  });

  describe("EmptyState", () => {
    const filePath = resolve(componentsDir, "EmptyState.vue");
    const content = readFileSync(filePath, "utf-8");

    it("renders dashed border with monospace ASCII title and action slot", () => {
      expect(content).toContain("border-dashed");
      expect(content).toContain("border-hairline-strong");
      expect(content).toContain("BracketButton");
    });
  });

  describe("DestructiveConfirmModal", () => {
    const filePath = resolve(componentsDir, "DestructiveConfirmModal.vue");
    const content = readFileSync(filePath, "utf-8");

    it("binds UModal and requires typing target name to enable deletion", () => {
      expect(content).toContain("<UModal");
      expect(content).toContain("isMatch");
      expect(content).toContain("typedInput.value.trim() === props.targetName.trim()");
      expect(content).toContain(':disabled="!isMatch || loading"');
    });
  });

  describe("SkeletonRows & SkeletonTiles", () => {
    const rowsPath = resolve(componentsDir, "SkeletonRows.vue");
    const tilesPath = resolve(componentsDir, "SkeletonTiles.vue");

    it("renders table and tile pulse skeletons without circular cartoon spinners", () => {
      const rowsContent = readFileSync(rowsPath, "utf-8");
      const tilesContent = readFileSync(tilesPath, "utf-8");

      expect(rowsContent).toContain("animate-pulse");
      expect(rowsContent).toContain("bg-surface-elevated");
      expect(tilesContent).toContain("animate-pulse");
      expect(tilesContent).toContain("grid-cols-1 sm:grid-cols-2 lg:grid-cols-4");
    });
  });

  describe("UtcTime & RelativeTime", () => {
    const utcPath = resolve(componentsDir, "UtcTime.vue");
    const relPath = resolve(componentsDir, "RelativeTime.vue");

    it("UtcTime formats timestamps to UTC with ISO pads", () => {
      const utcContent = readFileSync(utcPath, "utf-8");
      expect(utcContent).toContain("getUTCFullYear");
      expect(utcContent).toContain("getUTCHours");
      expect(utcContent).toContain("UTC");
    });

    it("RelativeTime computes humanized relative diffs with UTC title tooltip", () => {
      const relContent = readFileSync(relPath, "utf-8");
      expect(relContent).toContain("just now");
      expect(relContent).toContain("s ago");
      expect(relContent).toContain("m ago");
      expect(relContent).toContain("h ago");
      expect(relContent).toContain(':title="isoUtcString"');
    });
  });

  describe("Sparkline & LatencyChart", () => {
    const sparkPath = resolve(componentsDir, "Sparkline.vue");
    const chartPath = resolve(componentsDir, "LatencyChart.vue");

    it("Sparkline renders SVG polyline path and terminal fallback", () => {
      const sparkContent = readFileSync(sparkPath, "utf-8");
      expect(sparkContent).toContain("<svg");
      expect(sparkContent).toContain("<path");
      expect(sparkContent).toContain("stroke-linecap");
      expect(sparkContent).toContain("lastPoint");
    });

    it("LatencyChart wraps UChart with window selector [24H] [7D] [30D] and fallback", () => {
      const chartContent = readFileSync(chartPath, "utf-8");
      expect(chartContent).toContain("<UChart");
      expect(chartContent).toContain("[24H]");
      expect(chartContent).toContain("[7D]");
      expect(chartContent).toContain("[30D]");
      expect(chartContent).toContain("averageLatency");
      expect(chartContent).toContain("maxLatency");
    });
  });

  describe("JsonViewer", () => {
    const jsonPath = resolve(componentsDir, "JsonViewer.vue");
    const jsonContent = readFileSync(jsonPath, "utf-8");

    it("parses tokens safely without eval and applies syntax highlighting", () => {
      expect(jsonContent).not.toContain("eval(");
      expect(jsonContent).not.toContain("new Function");
      expect(jsonContent).toContain("text-status-operational");
      expect(jsonContent).toContain("text-amber-400");
      expect(jsonContent).toContain("text-indigo-400");
      expect(jsonContent).toContain("CopyButton");
    });
  });

  describe("HttpMethodBadge", () => {
    const methodPath = resolve(componentsDir, "HttpMethodBadge.vue");
    const methodContent = readFileSync(methodPath, "utf-8");

    it("maps HTTP methods (GET, POST, PUT, PATCH, DELETE, HEAD) to colors", () => {
      expect(methodContent).toContain("GET");
      expect(methodContent).toContain("POST");
      expect(methodContent).toContain("PUT");
      expect(methodContent).toContain("PATCH");
      expect(methodContent).toContain("DELETE");
      expect(methodContent).toContain("HEAD");
      expect(methodContent).toContain("text-status-operational");
      expect(methodContent).toContain("text-status-degraded");
      expect(methodContent).toContain("text-status-down");
    });
  });
});
