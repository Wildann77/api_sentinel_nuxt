import {
  EntityNotFoundException,
  HttpMethod,
  Monitor,
  UUIDv7,
  ValidationException,
} from "@sentinel/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryMetricsRepository } from "../src/test-doubles/in-memory-metrics-repository.js";
import { InMemoryMonitorRepository } from "../src/test-doubles/in-memory-monitor-repository.js";
import { SequentialIdGenerator } from "../src/test-doubles/sequential-id-generator.js";
import {
  GetCompositeLatency,
  GetMetricsSummary,
  GetMonitorMetrics,
} from "../src/use-cases/metrics/index.js";

describe("P11.2 Metrics Use Cases Unit Suite", () => {
  let idGen: SequentialIdGenerator;
  let metricsRepo: InMemoryMetricsRepository;
  let monitorRepo: InMemoryMonitorRepository;
  let getSummaryUseCase: GetMetricsSummary;
  let getMonitorMetricsUseCase: GetMonitorMetrics;
  let getCompositeLatencyUseCase: GetCompositeLatency;

  let monitorId: UUIDv7;

  beforeEach(async () => {
    idGen = new SequentialIdGenerator();
    metricsRepo = new InMemoryMetricsRepository();
    monitorRepo = new InMemoryMonitorRepository();

    getSummaryUseCase = new GetMetricsSummary(metricsRepo);
    getMonitorMetricsUseCase = new GetMonitorMetrics(metricsRepo, monitorRepo);
    getCompositeLatencyUseCase = new GetCompositeLatency(metricsRepo);

    monitorId = UUIDv7.fromString(idGen.generate());
    const monitor = Monitor.create({
      id: monitorId,
      name: "Checkout Service",
      url: "https://api.checkout.internal/health",
      method: HttpMethod.GET,
      intervalSeconds: 60,
      timeoutMs: 5000,
    });
    await monitorRepo.save(monitor);
  });

  describe("GetMetricsSummaryUseCase", () => {
    it("returns summary metrics containing uptime, counts and latency", async () => {
      metricsRepo.summary = {
        totalMonitors: 5,
        upCount: 4,
        degradedCount: 1,
        downCount: 0,
        pausedCount: 0,
        unknownCount: 0,
        openIncidentsCount: 1,
        averageUptimePercentage: 99.5,
        averageLatencyMs: 142,
      };

      const result = await getSummaryUseCase.execute();

      expect(result.totalMonitors).toBe(5);
      expect(result.upCount).toBe(4);
      expect(result.degradedCount).toBe(1);
      expect(result.averageUptimePercentage).toBe(99.5);
      expect(result.averageLatencyMs).toBe(142);
    });
  });

  describe("GetMonitorMetricsUseCase", () => {
    it("throws ValidationException if monitorId is not a valid UUID", async () => {
      await expect(
        getMonitorMetricsUseCase.execute({ monitorId: "invalid", range: "24h" }),
      ).rejects.toThrow(ValidationException);
    });

    it("throws ValidationException if range is invalid", async () => {
      await expect(
        getMonitorMetricsUseCase.execute({
          monitorId: monitorId.toString(),
          range: "1y" as unknown as "24h",
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("throws EntityNotFoundException if monitor does not exist", async () => {
      const nonExistent = idGen.generate();
      await expect(
        getMonitorMetricsUseCase.execute({ monitorId: nonExistent, range: "24h" }),
      ).rejects.toThrow(EntityNotFoundException);
    });

    it("returns aggregated metrics buckets with p95, p99 and uptime", async () => {
      metricsRepo.monitorMetrics.set(`${monitorId.toString()}:24h`, {
        monitorId: monitorId.toString(),
        range: "24h",
        overallUptimePercentage: 98.75,
        overallAvgLatencyMs: 125,
        buckets: [
          {
            bucketStart: "2026-10-24T10:00:00.000Z",
            totalChecks: 12,
            successfulChecks: 12,
            failedChecks: 0,
            uptimePercentage: 100,
            avgLatencyMs: 120,
            p95LatencyMs: 150,
            p99LatencyMs: 165,
          },
        ],
      });

      const result = await getMonitorMetricsUseCase.execute({
        monitorId: monitorId.toString(),
        range: "24h",
      });

      expect(result.monitorId).toBe(monitorId.toString());
      expect(result.range).toBe("24h");
      expect(result.overallUptimePercentage).toBe(98.75);
      expect(result.overallAvgLatencyMs).toBe(125);
      expect(result.buckets).toHaveLength(1);
      expect(result.buckets[0]?.p95LatencyMs).toBe(150);
      expect(result.buckets[0]?.p99LatencyMs).toBe(165);
    });
  });

  describe("GetCompositeLatencyMetricsUseCase", () => {
    it("throws ValidationException if range is invalid", async () => {
      await expect(
        getCompositeLatencyUseCase.execute({ range: "bad" as unknown as "24h" }),
      ).rejects.toThrow(ValidationException);
    });

    it("returns composite latency metrics for the requested range", async () => {
      metricsRepo.compositeLatency["7d"] = {
        range: "7d",
        points: [
          {
            timestamp: "2026-10-24T00:00:00.000Z",
            avgLatencyMs: 130,
            p95LatencyMs: 200,
            minLatencyMs: 50,
            maxLatencyMs: 450,
          },
        ],
      };

      const result = await getCompositeLatencyUseCase.execute({ range: "7d" });

      expect(result.range).toBe("7d");
      expect(result.points).toHaveLength(1);
      expect(result.points[0]?.avgLatencyMs).toBe(130);
      expect(result.points[0]?.p95LatencyMs).toBe(200);
    });
  });
});
