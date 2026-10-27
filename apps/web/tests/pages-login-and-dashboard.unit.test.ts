import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("P15.1 & P15.2 — Login and Dashboard Overview Screen Tests", () => {
  const pagesDir = resolve(__dirname, "../app/pages");
  const loginPagePath = resolve(pagesDir, "login.vue");
  const dashboardPagePath = resolve(pagesDir, "dashboard/index.vue");

  describe("P15.1 — /login Auth Gate Screen (DES §5.1, US 1)", () => {
    it("file login.vue exists", () => {
      expect(existsSync(loginPagePath)).toBe(true);
    });

    const content = readFileSync(loginPagePath, "utf-8");

    it("uses isolated login layout", () => {
      expect(content).toContain('layout: "login"');
    });

    it("renders centered 380px terminal card with [SENTINEL::AUTH_GATE]", () => {
      expect(content).toContain("max-w-[380px]");
      expect(content).toContain("[SENTINEL::AUTH_GATE]");
    });

    it("contains username and password fields with visibility toggle", () => {
      expect(content).toContain("USER_IDENTIFIER:");
      expect(content).toContain("login-username");
      expect(content).toContain("ACCESS_TOKEN / SECRET:");
      expect(content).toContain("login-password");
      expect(content).toContain("showPassword");
      expect(content).toContain('[{{ showPassword ? "HIDE" : "SHOW" }}]');
    });

    it("includes [ENTER SYSTEM] submit button disabled during submission", () => {
      expect(content).toContain('label="ENTER SYSTEM"');
      expect(content).toContain('type="submit"');
      expect(content).toContain('variant="solid"');
      expect(content).toContain(':loading="isSubmitting"');
      expect(content).toContain(':disabled="isSubmitting || !username.trim() || !password"');
    });

    it("integrates ProblemAlert for RFC 9457 error details display", () => {
      expect(content).toContain("<ProblemAlert");
      expect(content).toContain(':error="errorDetails"');
      expect(content).toContain("parseProblemDetails");
      expect(content).toContain('@dismiss="errorDetails = null"');
    });
  });

  describe("P15.2 — /dashboard Executive Overview Screen (DES §5.2, PRD §4.16)", () => {
    it("file dashboard/index.vue exists", () => {
      expect(existsSync(dashboardPagePath)).toBe(true);
    });

    const content = readFileSync(dashboardPagePath, "utf-8");

    it("uses default layout with [01: OVERVIEW DASHBOARD] title", () => {
      expect(content).toContain('layout: "default"');
      expect(content).toContain("[01: OVERVIEW DASHBOARD]");
    });

    it("renders 4 MetricTiles in 4-column responsive grid", () => {
      expect(content).toContain("grid-cols-1 sm:grid-cols-2 lg:grid-cols-4");
      expect(content).toContain('label="UPTIME 24H"');
      expect(content).toContain('label="RATA-RATA LATENCY"');
      expect(content).toContain('label="INSIDEN AKTIF"');
      expect(content).toContain('label="TOTAL MONITOR"');
    });

    it("passes null/N/A values properly rather than forcing 0/100%", () => {
      expect(content).toContain("averageUptimePercentage == null");
      expect(content).toContain("averageLatencyMs == null");
      expect(content).toContain(':value="uptimeValue"');
      expect(content).toContain(':value="avgLatencyValue"');
      expect(content).toContain(':value="activeIncidentsValue"');
      expect(content).toContain(':value="totalMonitorsValue"');
    });

    it("integrates LatencyChart with window selector [24H] [7D] [30D]", () => {
      expect(content).toContain("<LatencyChart");
      expect(content).toContain(':data="latencyChartData"');
      expect(content).toContain(':time-range="selectedTimeRange"');
      expect(content).toContain("@update:time-range=");
      expect(content).toContain("useCompositeLatencyQuery(queryRange)");
    });

    it("renders real-time feed for 10 recent checks via WebSocket", () => {
      expect(content).toContain("[LIVE PROBE FEED // 10 PEMERIKSAAN TERAKHIR]");
      expect(content).toContain("useRecentChecksQuery(10)");
      expect(content).toContain("useSentinelSocket");
      expect(content).toContain("socket.isFlashing(check.monitorId)");
    });

    it("maps monitor details from useMonitorsQuery cache", () => {
      expect(content).toContain("useMonitorsQuery({ limit: 100 })");
      expect(content).toContain("monitorsMap");
      expect(content).toContain("monitorsMap.get(check.monitorId)");
      expect(content).toContain("<HttpMethodBadge");
      expect(content).toContain("<StatusBadge");
      expect(content).toContain("<RelativeTime");
      expect(content).toContain("<UtcTime");
    });

    it("supports empty and loading states", () => {
      expect(content).toContain("<EmptyState");
      expect(content).toContain("<SkeletonRows");
      expect(content).toContain("<SkeletonTiles");
    });
  });
});
