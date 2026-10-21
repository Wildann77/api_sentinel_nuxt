import { describe, expect, it } from "vitest";
import {
  CompositeLatencyMetricsSchema,
  IncidentSchema,
  MetricsSummarySchema,
  MonitorMetricsSchema,
} from "../src/index.js";

describe("Incident & Metrics Schemas", () => {
  describe("IncidentSchema", () => {
    it("validates incident with notification deliveries (D-19)", () => {
      const result = IncidentSchema.safeParse({
        id: "0192e21b-8a21-7000-8b1a-98df76123456",
        monitorId: "0192e21b-8a21-7000-8b1a-98df76123457",
        openedAt: new Date().toISOString(),
        resolvedAt: null,
        durationSeconds: null,
        failureCount: 4,
        lastFailureCategory: "HTTP_STATUS_MISMATCH",
        lastFailureReason: "Expected 200, received 500",
        notificationDeliveries: [
          {
            id: "0192e21b-8a21-7000-8b1a-98df76123458",
            channel: "TELEGRAM",
            status: "SENT",
            attemptCount: 1,
            lastAttemptAt: new Date().toISOString(),
            lastError: null,
          },
        ],
        createdAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("MetricsSummarySchema", () => {
    it("validates summary metrics with null uptime (when no checks)", () => {
      const result = MetricsSummarySchema.safeParse({
        totalMonitors: 10,
        upCount: 8,
        degradedCount: 1,
        downCount: 1,
        pausedCount: 0,
        openIncidentsCount: 1,
        averageUptimePercentage: null,
        averageLatencyMs: 135,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("MonitorMetricsSchema & CompositeLatencyMetricsSchema", () => {
    it("validates monitor metric buckets and ranges", () => {
      const result = MonitorMetricsSchema.safeParse({
        monitorId: "0192e21b-8a21-7000-8b1a-98df76123456",
        range: "24h",
        overallUptimePercentage: 99.8,
        overallAvgLatencyMs: 120,
        buckets: [
          {
            bucketStart: new Date().toISOString(),
            totalChecks: 60,
            successfulChecks: 60,
            failedChecks: 0,
            uptimePercentage: 100,
            avgLatencyMs: 115,
            p95LatencyMs: 140,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("validates composite latency metrics", () => {
      const result = CompositeLatencyMetricsSchema.safeParse({
        range: "7d",
        points: [
          {
            timestamp: new Date().toISOString(),
            avgLatencyMs: 150,
            p95LatencyMs: 210,
            minLatencyMs: 80,
            maxLatencyMs: 400,
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });
});
