import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiClientError, parseProblemDetails } from "../app/utils/api-client.js";

describe("P14.4 — TanStack Query & API Client Unit Tests", () => {
  const pluginsDir = resolve(__dirname, "../app/plugins");
  const composablesDir = resolve(__dirname, "../app/composables");
  const utilsDir = resolve(__dirname, "../app/utils");

  describe("Vue Query Plugin (ARCH §8.2)", () => {
    it("plugin exists and configures staleTime 10s, window focus refetch, and retry 1", () => {
      const pluginPath = resolve(pluginsDir, "vue-query.ts");
      expect(existsSync(pluginPath)).toBe(true);

      const content = readFileSync(pluginPath, "utf-8");
      expect(content).toContain("staleTime: 1000 * 10");
      expect(content).toContain("refetchOnWindowFocus: true");
      expect(content).toContain("retry: 1");
      expect(content).toContain("VueQueryPlugin");
      expect(content).toContain("provide: { queryClient }");
    });
  });

  describe("API Client & RFC 9457 Problem Details Parser", () => {
    it("api-client.ts utility exists", () => {
      expect(existsSync(resolve(utilsDir, "api-client.ts"))).toBe(true);
    });

    it("parses valid RFC 9457 problem JSON object into ProblemDetailsDto", () => {
      const rawProblem = {
        type: "https://api-sentinel.local/errors/validation-failed",
        title: "Validasi Input Gagal",
        status: 400,
        detail: "Input URL bukan URL HTTP/HTTPS yang valid",
        instance: "/api/monitors",
        invalidParams: [{ name: "targetUrl", reason: "Invalid protocol" }],
      };

      const parsed = parseProblemDetails({ data: rawProblem }, "/api/monitors");
      expect(parsed.type).toBe("https://api-sentinel.local/errors/validation-failed");
      expect(parsed.title).toBe("Validasi Input Gagal");
      expect(parsed.status).toBe(400);
      expect(parsed.detail).toBe("Input URL bukan URL HTTP/HTTPS yang valid");
      expect(parsed.instance).toBe("/api/monitors");
      expect(parsed.invalidParams).toHaveLength(1);
      expect(parsed.invalidParams?.[0]?.name).toBe("targetUrl");
    });

    it("parses valid RFC 9457 JSON string into ProblemDetailsDto", () => {
      const rawString = JSON.stringify({
        type: "https://api-sentinel.local/errors/entity-not-found",
        title: "Monitor Tidak Ditemukan",
        status: 404,
        detail: "Monitor dengan ID 0192e2b0-84a5-7164-9eb5-8e77dfd2e3b2 tidak ada.",
        instance: "/api/monitors/0192e2b0-84a5-7164-9eb5-8e77dfd2e3b2",
      });

      const parsed = parseProblemDetails({ data: rawString });
      expect(parsed.status).toBe(404);
      expect(parsed.title).toBe("Monitor Tidak Ditemukan");
      expect(parsed.type).toBe("https://api-sentinel.local/errors/entity-not-found");
    });

    it("creates standard fallback ProblemDetailsDto on generic network error", () => {
      const err = new Error("Failed to fetch from host");
      const parsed = parseProblemDetails(err, "/api/metrics/summary");

      expect(parsed.status).toBe(500);
      expect(parsed.title).toBe("Internal Server Error");
      expect(parsed.detail).toBe("Failed to fetch from host");
      expect(parsed.instance).toBe("/api/metrics/summary");
    });

    it("ApiClientError wraps ProblemDetailsDto accurately", () => {
      const problem = {
        type: "urn:problem:rate-limit-exceeded",
        title: "Batas Laju Permintaan Terlampaui",
        status: 429,
        detail: "Terlalu banyak permintaan.",
        instance: "/api/monitors/test",
      };

      const error = new ApiClientError(problem);
      expect(error.name).toBe("ApiClientError");
      expect(error.status).toBe(429);
      expect(error.title).toBe("Batas Laju Permintaan Terlampaui");
      expect(error.problem).toEqual(problem);
      expect(error.message).toBe("Terlalu banyak permintaan.");
    });
  });

  describe("Resource Query & Mutation Composables", () => {
    it("all resource composable files exist in apps/web/app/composables/", () => {
      const files = [
        "use-monitors.ts",
        "use-checks.ts",
        "use-incidents.ts",
        "use-metrics.ts",
        "use-settings.ts",
        "use-auth.ts",
      ];

      for (const file of files) {
        expect(existsSync(resolve(composablesDir, file)), `${file} should exist`).toBe(true);
      }
    });

    it("use-monitors.ts exports expected queries and mutations", () => {
      const content = readFileSync(resolve(composablesDir, "use-monitors.ts"), "utf-8");
      expect(content).toContain("useMonitorsQuery");
      expect(content).toContain("useMonitorQuery");
      expect(content).toContain("useCreateMonitorMutation");
      expect(content).toContain("useUpdateMonitorMutation");
      expect(content).toContain("useDeleteMonitorMutation");
      expect(content).toContain("usePauseMonitorMutation");
      expect(content).toContain("useResumeMonitorMutation");
      expect(content).toContain("useTriggerCheckMutation");
      expect(content).toContain("invalidateQueries");
    });

    it("use-checks.ts exports expected queries and test probe mutation", () => {
      const content = readFileSync(resolve(composablesDir, "use-checks.ts"), "utf-8");
      expect(content).toContain("useMonitorChecksQuery");
      expect(content).toContain("useCheckDetailQuery");
      expect(content).toContain("useRecentChecksQuery");
      expect(content).toContain("useTestProbeMutation");
    });

    it("use-incidents.ts exports expected queries", () => {
      const content = readFileSync(resolve(composablesDir, "use-incidents.ts"), "utf-8");
      expect(content).toContain("useIncidentsQuery");
      expect(content).toContain("useIncidentQuery");
    });

    it("use-metrics.ts exports summary, composite latency, and monitor metrics", () => {
      const content = readFileSync(resolve(composablesDir, "use-metrics.ts"), "utf-8");
      expect(content).toContain("useGlobalMetricsQuery");
      expect(content).toContain("useCompositeLatencyQuery");
      expect(content).toContain("useMonitorMetricsQuery");
    });

    it("use-settings.ts exports Telegram settings, test ping, and password change", () => {
      const content = readFileSync(resolve(composablesDir, "use-settings.ts"), "utf-8");
      expect(content).toContain("useTelegramSettingsQuery");
      expect(content).toContain("useUpdateTelegramSettingsMutation");
      expect(content).toContain("useTestTelegramPingMutation");
      expect(content).toContain("useChangePasswordMutation");
    });

    it("composables/index.ts exports all modules cleanly", () => {
      const indexContent = readFileSync(resolve(composablesDir, "index.ts"), "utf-8");
      expect(indexContent).toContain("./use-auth.js");
      expect(indexContent).toContain("./use-checks.js");
      expect(indexContent).toContain("./use-incidents.js");
      expect(indexContent).toContain("./use-metrics.js");
      expect(indexContent).toContain("./use-monitors.js");
      expect(indexContent).toContain("./use-sentinel-socket.js");
      expect(indexContent).toContain("./use-settings.js");
    });
  });
});
