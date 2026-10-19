import {
  CheckResult,
  EntityNotFoundException,
  FailureCategory,
  HttpMethod,
  Incident,
  Monitor,
  TriggerType,
  UUIDv7,
  ValidationException,
} from "@sentinel/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryCheckResultRepository } from "../src/test-doubles/in-memory-check-result-repository.js";
import { InMemoryIncidentRepository } from "../src/test-doubles/in-memory-incident-repository.js";
import { InMemoryMonitorRepository } from "../src/test-doubles/in-memory-monitor-repository.js";
import { SequentialIdGenerator } from "../src/test-doubles/sequential-id-generator.js";
import { StreamCsvReport } from "../src/use-cases/reports/stream-csv-report.use-case.js";

describe("StreamCsvReport Use Case (US 30, PRD §4.17)", () => {
  let idGen: SequentialIdGenerator;
  let checkRepo: InMemoryCheckResultRepository;
  let incidentRepo: InMemoryIncidentRepository;
  let monitorRepo: InMemoryMonitorRepository;
  let useCase: StreamCsvReport;

  beforeEach(() => {
    idGen = new SequentialIdGenerator();
    checkRepo = new InMemoryCheckResultRepository();
    incidentRepo = new InMemoryIncidentRepository();
    monitorRepo = new InMemoryMonitorRepository();
    useCase = new StreamCsvReport(checkRepo, incidentRepo, monitorRepo);
  });

  const createDummyMonitor = async (name: string, idStr?: string) => {
    const id = idStr ? UUIDv7.fromString(idStr) : UUIDv7.fromString(idGen.generate());
    const monitor = new Monitor({
      id,
      name,
      url: "https://api.example.com/health",
      method: HttpMethod.GET,
      headers: {},
      body: null,
      authConfig: null,
      assertions: [],
      intervalSeconds: 60,
      timeoutMs: 5000,
      degradedThresholdMs: 2000,
      consecutiveFailuresThreshold: 3,
      consecutiveSuccessesThreshold: 2,
    });
    await monitorRepo.save(monitor);
    return monitor;
  };

  async function collectLines(iterable: AsyncIterable<string>): Promise<string[]> {
    const lines: string[] = [];
    for await (const chunk of iterable) {
      lines.push(chunk);
    }
    return lines;
  }

  describe("Validation", () => {
    it("throws ValidationException if from > to", async () => {
      await expect(
        useCase.execute({
          query: {
            type: "checks",
            from: "2026-03-02T00:00:00.000Z",
            to: "2026-03-01T00:00:00.000Z",
          },
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("throws EntityNotFoundException if filter monitorId does not exist", async () => {
      const nonExistentId = idGen.generate();
      await expect(
        useCase.execute({
          query: {
            type: "checks",
            monitorId: nonExistentId,
            from: "2026-03-01T00:00:00.000Z",
            to: "2026-03-02T00:00:00.000Z",
          },
        }),
      ).rejects.toThrow(EntityNotFoundException);
    });
  });

  describe("Checks Export (type=checks)", () => {
    it("generates correct CSV headers and data rows with formula injection protection", async () => {
      const monitor = await createDummyMonitor("=Payment Gateway API");
      const monitorId = monitor.id;

      const check1 = new CheckResult({
        id: UUIDv7.fromString(idGen.generate()),
        monitorId,
        incidentId: null,
        triggerType: TriggerType.SCHEDULED,
        scheduledFor: new Date("2026-03-01T10:00:00.000Z"),
        startedAt: new Date("2026-03-01T10:00:00.000Z"),
        finishedAt: new Date("2026-03-01T10:00:00.200Z"),
        durationMs: 200,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
        assertionResults: [],
        diagnostic: null,
        correlationId: idGen.generate(),
        pinnedIp: "192.0.2.1",
      });

      const check2 = new CheckResult({
        id: UUIDv7.fromString(idGen.generate()),
        monitorId,
        incidentId: null,
        triggerType: TriggerType.MANUAL,
        scheduledFor: null,
        startedAt: new Date("2026-03-01T10:05:00.000Z"),
        finishedAt: new Date("2026-03-01T10:05:01.500Z"),
        durationMs: 1500,
        isSuccess: false,
        statusCode: 500,
        failureCategory: FailureCategory.HTTP_STATUS_MISMATCH,
        assertionResults: [],
        diagnostic: "+cmd|' /C calc'!A0 with token bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
        correlationId: idGen.generate(),
        pinnedIp: "192.0.2.1",
      });

      await checkRepo.save(check1);
      await checkRepo.save(check2);

      const stream = await useCase.execute({
        query: {
          type: "checks",
          monitorId: monitorId.toString(),
          from: "2026-03-01T09:00:00.000Z",
          to: "2026-03-01T11:00:00.000Z",
        },
      });

      const lines = await collectLines(stream);

      // Header
      expect(lines[0]).toBe(
        "timestamp,monitor_name,status,status_code,latency_ms,failure_category,failure_reason,trigger_type\r\n",
      );

      // Row 1: Check 1 (Success)
      // Name starting with = is neutralized with '
      expect(lines[1]).toContain("'=Payment Gateway API,UP,200,200,,,SCHEDULED");

      // Row 2: Check 2 (Failure)
      // Diagnostic starts with + -> neutralized with '
      // Telegram token is redacted
      expect(lines[2]).toContain("DOWN,500,1500,HTTP_STATUS_MISMATCH");
      expect(lines[2]).toContain("bot[REDACTED_TELEGRAM_TOKEN]");
      expect(lines[2]).not.toContain("bot123456:ABC-DEF");
      expect(lines[2]).toContain("MANUAL");
    });
  });

  describe("Incidents Export (type=incidents)", () => {
    it("generates correct CSV headers and data rows for open and resolved incidents", async () => {
      const monitor = await createDummyMonitor("@Notification Service");
      const monitorId = monitor.id;

      const incidentResolved = new Incident({
        id: UUIDv7.fromString(idGen.generate()),
        monitorId,
        startedAt: new Date("2026-03-01T12:00:00.000Z"),
        recoveredAt: new Date("2026-03-01T12:30:00.000Z"),
        durationSeconds: 1800,
        causeCategory: FailureCategory.CONNECTION_TIMEOUT,
        initialErrorMessage: "-Connection timed out after 5000ms",
        failureCount: 3,
        isResolved: true,
      });

      const incidentOpen = new Incident({
        id: UUIDv7.fromString(idGen.generate()),
        monitorId,
        startedAt: new Date("2026-03-01T13:00:00.000Z"),
        recoveredAt: null,
        durationSeconds: null,
        causeCategory: FailureCategory.DNS_RESOLUTION_FAILED,
        initialErrorMessage: "Authorization Bearer secret-auth-token-12345 failed",
        failureCount: 5,
        isResolved: false,
      });

      await incidentRepo.save(incidentResolved);
      await incidentRepo.save(incidentOpen);

      const stream = await useCase.execute({
        query: {
          type: "incidents",
          from: "2026-03-01T11:00:00.000Z",
          to: "2026-03-01T14:00:00.000Z",
        },
      });

      const lines = await collectLines(stream);

      // Header
      expect(lines[0]).toBe(
        "started_at,resolved_at,duration_seconds,monitor_name,status,failure_category,failure_reason\r\n",
      );

      // Row 1: Resolved incident
      expect(lines[1]).toContain("1800");
      expect(lines[1]).toContain("'@Notification Service");
      expect(lines[1]).toContain("RESOLVED");
      expect(lines[1]).toContain("CONNECTION_TIMEOUT");
      expect(lines[1]).toContain("'-Connection timed out");

      // Row 2: Open incident
      expect(lines[2]).toContain("OPEN");
      expect(lines[2]).toContain("DNS_RESOLUTION_FAILED");
      expect(lines[2]).toContain("Bearer [REDACTED_TOKEN]");
      expect(lines[2]).not.toContain("secret-auth-token-12345");
    });
  });
});
