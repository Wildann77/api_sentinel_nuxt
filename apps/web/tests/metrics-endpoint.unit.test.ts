import { getSentinelMetrics, resetSentinelMetrics } from "@sentinel/infra";
import type { H3Event } from "h3";
import { beforeEach, describe, expect, it } from "vitest";
import metricsHandler from "../server/routes/metrics.get.js";

describe("P13.2 — Web /metrics Endpoint Unit Tests", () => {
  beforeEach(() => {
    resetSentinelMetrics();
  });

  it("returns Prometheus metrics exposition text", async () => {
    const metrics = getSentinelMetrics();
    metrics.recordProbe({
      monitorId: "mon-web-1",
      isSuccess: true,
      durationMs: 120,
    });

    const mockEvent = {
      node: {
        res: {
          setHeader: () => {},
        },
      },
    } as unknown as H3Event;

    const body = await metricsHandler(mockEvent);

    expect(body).toContain("sentinel_probe_duration_ms");
    expect(body).toContain('monitor_id="mon-web-1"');
  });
});
