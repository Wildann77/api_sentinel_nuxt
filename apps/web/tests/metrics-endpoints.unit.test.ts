import { HttpMethod, Monitor, UUIDv7, ValidationException } from "@sentinel/domain";
import type { H3Event } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import getCompositeLatencyHandler from "../server/api/metrics/latency.get.js";
import getMetricsSummaryHandler from "../server/api/metrics/summary.get.js";
import getMonitorMetricsHandler from "../server/api/monitors/[id]/metrics.get.js";
import { getContainer, resetContainer } from "../server/utils/container.js";

interface MockEventOverrides {
  method?: string;
  path?: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  remoteAddress?: string;
  context?: Record<string, unknown>;
  body?: unknown;
}

function createMockEvent(overrides: MockEventOverrides = {}): H3Event {
  const headers: Record<string, string> = {
    host: "localhost:3000",
    ...(overrides.headers || {}),
  };
  const responseHeaders: Record<string, string | string[]> = {};
  const statusCode = 200;

  return {
    method: overrides.method || "GET",
    path: overrides.path || "/",
    node: {
      req: {
        method: overrides.method || "GET",
        url: overrides.path || "/",
        headers,
        socket: {
          remoteAddress: overrides.remoteAddress || "127.0.0.1",
        },
      },
      res: {
        statusCode,
        setHeader: (name: string, value: string | string[]) => {
          responseHeaders[name.toLowerCase()] = value;
        },
        getHeader: (name: string) => responseHeaders[name.toLowerCase()],
        headersSent: false,
      },
    },
    context: {
      params: overrides.params,
      ...(overrides.context || {}),
    },
    _body: overrides.body,
    _query: overrides.query,
  } as unknown as H3Event;
}

vi.mock("h3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("h3")>();
  return {
    ...actual,
    readBody: vi.fn(async (event: unknown) => (event as { _body?: unknown })?._body),
    getQuery: vi.fn((event: unknown) => (event as { _query?: unknown })?._query || {}),
    getRouterParam: vi.fn((event: unknown, paramName: string) => {
      const e = event as { context?: { params?: Record<string, string> } };
      return e.context?.params?.[paramName];
    }),
  };
});

const VALID_KEYRING = JSON.stringify({
  activeKeyId: "key-1",
  keys: {
    "key-1": Buffer.alloc(32, 1).toString("base64"),
  },
});

const TEST_ENV = {
  NODE_ENV: "test",
  PORT: "3000",
  WORKER_PORT: "3001",
  DATABASE_URL: "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel",
  APP_KEYRING: VALID_KEYRING,
  SESSION_SECRET: "a-very-long-and-secure-session-secret-key-32chars",
  LOG_LEVEL: "info",
};

describe("Metrics Endpoints Suite (P11.2)", () => {
  const monitorId = "018f0000-0000-7000-8000-000000000001";

  beforeEach(async () => {
    await resetContainer();
    const container = getContainer(TEST_ENV);

    vi.spyOn(container.monitorRepository, "findById").mockImplementation(async (id) => {
      if (id.toString() === monitorId) {
        return new Monitor({
          id: UUIDv7.fromString(monitorId),
          name: "Payment Gateway",
          url: "https://api.payment.internal/health",
          method: HttpMethod.GET,
          intervalSeconds: 60,
          timeoutMs: 5000,
          isActive: true,
          createdAt: new Date("2026-10-24T00:00:00Z"),
          updatedAt: new Date("2026-10-24T00:00:00Z"),
        });
      }
      return null;
    });

    vi.spyOn(container.metricsRepository, "getSummary").mockResolvedValue({
      totalMonitors: 10,
      upCount: 8,
      degradedCount: 1,
      downCount: 1,
      pausedCount: 0,
      unknownCount: 0,
      openIncidentsCount: 1,
      averageUptimePercentage: 99.1,
      averageLatencyMs: 145,
    });

    vi.spyOn(container.metricsRepository, "getMonitorMetrics").mockResolvedValue({
      monitorId,
      range: "24h",
      overallUptimePercentage: 99.8,
      overallAvgLatencyMs: 120,
      buckets: [
        {
          bucketStart: "2026-10-24T00:00:00.000Z",
          totalChecks: 24,
          successfulChecks: 24,
          failedChecks: 0,
          uptimePercentage: 100,
          avgLatencyMs: 110,
          p95LatencyMs: 140,
          p99LatencyMs: 155,
        },
      ],
    });

    vi.spyOn(container.metricsRepository, "getCompositeLatency").mockResolvedValue({
      range: "24h",
      points: [
        {
          timestamp: "2026-10-24T00:00:00.000Z",
          avgLatencyMs: 125,
          p95LatencyMs: 180,
          minLatencyMs: 40,
          maxLatencyMs: 350,
        },
      ],
    });
  });

  describe("GET /api/metrics/summary", () => {
    it("returns 200 with summary metrics", async () => {
      const response = await getMetricsSummaryHandler();

      expect(response.totalMonitors).toBe(10);
      expect(response.upCount).toBe(8);
      expect(response.openIncidentsCount).toBe(1);
      expect(response.averageUptimePercentage).toBe(99.1);
      expect(response.averageLatencyMs).toBe(145);
    });
  });

  describe("GET /api/monitors/:id/metrics", () => {
    it("returns monitor metrics with range and buckets", async () => {
      const event = createMockEvent({
        params: { id: monitorId },
        query: { range: "24h" },
      });

      const response = await getMonitorMetricsHandler(event);

      expect(response.monitorId).toBe(monitorId);
      expect(response.range).toBe("24h");
      expect(response.overallUptimePercentage).toBe(99.8);
      expect(response.buckets).toHaveLength(1);
      expect(response.buckets[0]?.p99LatencyMs).toBe(155);
    });

    it("throws ValidationException if monitor id is invalid", async () => {
      const event = createMockEvent({
        params: { id: "bad-id" },
      });

      await expect(getMonitorMetricsHandler(event)).rejects.toThrow(ValidationException);
    });
  });

  describe("GET /api/metrics/latency", () => {
    it("returns composite latency metrics for dashboard (D-19)", async () => {
      const event = createMockEvent({
        query: { range: "24h" },
      });

      const response = await getCompositeLatencyHandler(event);

      expect(response.range).toBe("24h");
      expect(response.points).toHaveLength(1);
      expect(response.points[0]?.avgLatencyMs).toBe(125);
      expect(response.points[0]?.p95LatencyMs).toBe(180);
    });
  });
});
