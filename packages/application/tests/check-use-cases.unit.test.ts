import {
  CheckResult,
  EntityNotFoundException,
  HttpMethod,
  Monitor,
  UUIDv7,
  ValidationException,
} from "@sentinel/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryCheckResultRepository } from "../src/test-doubles/in-memory-check-result-repository.js";
import { InMemoryMonitorRepository } from "../src/test-doubles/in-memory-monitor-repository.js";
import { SequentialIdGenerator } from "../src/test-doubles/sequential-id-generator.js";
import {
  GetCheckDetailUseCase,
  GetRecentChecksUseCase,
  ListChecksUseCase,
} from "../src/use-cases/checks/index.js";

describe("P11.1 Check Use Cases Unit Suite", () => {
  let idGen: SequentialIdGenerator;
  let checkRepo: InMemoryCheckResultRepository;
  let monitorRepo: InMemoryMonitorRepository;
  let listChecksUseCase: ListChecksUseCase;
  let getCheckDetailUseCase: GetCheckDetailUseCase;
  let getRecentChecksUseCase: GetRecentChecksUseCase;

  let monitorId: UUIDv7;

  beforeEach(async () => {
    idGen = new SequentialIdGenerator();
    checkRepo = new InMemoryCheckResultRepository();
    monitorRepo = new InMemoryMonitorRepository();
    listChecksUseCase = new ListChecksUseCase(checkRepo, monitorRepo);
    getCheckDetailUseCase = new GetCheckDetailUseCase(checkRepo);
    getRecentChecksUseCase = new GetRecentChecksUseCase(checkRepo);

    monitorId = UUIDv7.fromString(idGen.generate());
    const monitor = Monitor.create({
      id: monitorId,
      name: "Orders API",
      url: "https://api.example.com/orders",
      method: HttpMethod.GET,
      intervalSeconds: 60,
      timeoutMs: 5000,
    });
    await monitorRepo.save(monitor);
  });

  describe("ListChecksUseCase", () => {
    it("throws ValidationException if monitorId is not a valid UUIDv7", async () => {
      await expect(listChecksUseCase.execute({ monitorId: "not-a-uuid" })).rejects.toThrow(
        ValidationException,
      );
    });

    it("throws EntityNotFoundException if monitor does not exist", async () => {
      const nonExistentId = idGen.generate();
      await expect(listChecksUseCase.execute({ monitorId: nonExistentId })).rejects.toThrow(
        EntityNotFoundException,
      );
    });

    it("throws ValidationException if date range is invalid", async () => {
      await expect(
        listChecksUseCase.execute({ monitorId: monitorId.toString(), from: "invalid-date" }),
      ).rejects.toThrow(ValidationException);
      await expect(
        listChecksUseCase.execute({ monitorId: monitorId.toString(), to: "invalid-date" }),
      ).rejects.toThrow(ValidationException);
    });

    it("returns paginated check results with MANUAL triggerType indicator", async () => {
      const check1 = CheckResult.create({
        id: UUIDv7.fromString(idGen.generate()),
        monitorId,
        triggerType: "SCHEDULED",
        startedAt: new Date("2026-10-24T10:00:00Z"),
        durationMs: 120,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
      });

      const check2 = CheckResult.create({
        id: UUIDv7.fromString(idGen.generate()),
        monitorId,
        triggerType: "MANUAL",
        startedAt: new Date("2026-10-24T10:05:00Z"),
        durationMs: 150,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
      });

      await checkRepo.save(check1);
      await checkRepo.save(check2);

      const response = await listChecksUseCase.execute({
        monitorId: monitorId.toString(),
        limit: 10,
      });

      expect(response.data).toHaveLength(2);
      expect(response.pagination.limit).toBe(10);
      expect(response.pagination.hasMore).toBe(false);

      const manualCheck = response.data.find((c) => c.triggerType === "MANUAL");
      expect(manualCheck).toBeDefined();
      expect(manualCheck?.id).toBe(check2.id.toString());
    });

    it("supports cursor pagination across multiple pages", async () => {
      const c1 = CheckResult.create({
        id: UUIDv7.fromString(idGen.generate()),
        monitorId,
        triggerType: "SCHEDULED",
        startedAt: new Date("2026-10-24T10:01:00Z"),
        durationMs: 100,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
      });
      const c2 = CheckResult.create({
        id: UUIDv7.fromString(idGen.generate()),
        monitorId,
        triggerType: "SCHEDULED",
        startedAt: new Date("2026-10-24T10:02:00Z"),
        durationMs: 110,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
      });
      const c3 = CheckResult.create({
        id: UUIDv7.fromString(idGen.generate()),
        monitorId,
        triggerType: "SCHEDULED",
        startedAt: new Date("2026-10-24T10:03:00Z"),
        durationMs: 120,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
      });

      await checkRepo.save(c1);
      await checkRepo.save(c2);
      await checkRepo.save(c3);

      const page1 = await listChecksUseCase.execute({
        monitorId: monitorId.toString(),
        limit: 2,
      });

      expect(page1.data).toHaveLength(2);
      expect(page1.pagination.hasMore).toBe(true);
      expect(page1.pagination.nextCursor).toBe(c2.id.toString());

      const page2 = await listChecksUseCase.execute({
        monitorId: monitorId.toString(),
        limit: 2,
        cursor: page1.pagination.nextCursor ?? undefined,
      });

      expect(page2.data).toHaveLength(1);
      expect(page2.data[0]?.id).toBe(c1.id.toString());
      expect(page2.pagination.hasMore).toBe(false);
    });

    it("filters checks by from and to time range", async () => {
      const c1 = CheckResult.create({
        id: UUIDv7.fromString(idGen.generate()),
        monitorId,
        triggerType: "SCHEDULED",
        startedAt: new Date("2026-10-24T08:00:00Z"),
        durationMs: 100,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
      });
      const c2 = CheckResult.create({
        id: UUIDv7.fromString(idGen.generate()),
        monitorId,
        triggerType: "SCHEDULED",
        startedAt: new Date("2026-10-24T10:00:00Z"),
        durationMs: 100,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
      });
      const c3 = CheckResult.create({
        id: UUIDv7.fromString(idGen.generate()),
        monitorId,
        triggerType: "SCHEDULED",
        startedAt: new Date("2026-10-24T12:00:00Z"),
        durationMs: 100,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
      });

      await checkRepo.save(c1);
      await checkRepo.save(c2);
      await checkRepo.save(c3);

      const filtered = await listChecksUseCase.execute({
        monitorId: monitorId.toString(),
        from: "2026-10-24T09:00:00.000Z",
        to: "2026-10-24T11:00:00.000Z",
      });

      expect(filtered.data).toHaveLength(1);
      expect(filtered.data[0]?.id).toBe(c2.id.toString());
    });
  });

  describe("GetCheckDetailUseCase", () => {
    it("throws ValidationException if checkId is invalid", async () => {
      await expect(getCheckDetailUseCase.execute("bad-id")).rejects.toThrow(ValidationException);
    });

    it("throws EntityNotFoundException if checkResult is not found", async () => {
      await expect(getCheckDetailUseCase.execute(idGen.generate())).rejects.toThrow(
        EntityNotFoundException,
      );
    });

    it("returns sanitized diagnostic detail conforming to CheckDetailDto", async () => {
      const checkId = UUIDv7.fromString(idGen.generate());
      const check = CheckResult.create({
        id: checkId,
        monitorId,
        triggerType: "SCHEDULED",
        startedAt: new Date("2026-10-24T10:00:00Z"),
        durationMs: 250,
        isSuccess: false,
        statusCode: 500,
        failureCategory: "HTTP_STATUS_MISMATCH",
        diagnostic: "Server returned 500 with bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
        pinnedIp: "93.184.216.34",
        assertionResults: [
          {
            ruleType: "STATUS_CODE",
            target: "statusCode",
            operator: "EQUALS",
            expected: 200,
            actual: 500,
            status: "FAIL",
            message: "Expected 200 but received 500",
          },
        ],
      });

      await checkRepo.save(check);

      const detail = await getCheckDetailUseCase.execute(checkId.toString());

      expect(detail.id).toBe(checkId.toString());
      expect(detail.monitorId).toBe(monitorId.toString());
      expect(detail.status).toBe("DOWN");
      expect(detail.statusCode).toBe(500);
      expect(detail.failureCategory).toBe("HTTP_STATUS_MISMATCH");
      // Verify token redacted in failureReason
      expect(detail.failureReason).toContain("[REDACTED_TELEGRAM_TOKEN]");
      // Verify diagnostics
      expect(detail.diagnostics.pinnedIp).toBe("93.184.216.34");
      expect(detail.diagnostics.assertionResults).toHaveLength(1);
      expect(detail.diagnostics.assertionResults[0]?.passed).toBe(false);
      expect(detail.diagnostics.assertionResults[0]?.message).toBe("Expected 200 but received 500");
    });
  });

  describe("GetRecentChecksUseCase", () => {
    it("returns up to limit checks across all monitors", async () => {
      const otherMonitorId = UUIDv7.fromString(idGen.generate());
      for (let i = 0; i < 15; i++) {
        await checkRepo.save(
          CheckResult.create({
            id: UUIDv7.fromString(idGen.generate()),
            monitorId: i % 2 === 0 ? monitorId : otherMonitorId,
            triggerType: "SCHEDULED",
            startedAt: new Date(Date.now() - (15 - i) * 1000),
            durationMs: 100 + i,
            isSuccess: true,
            statusCode: 200,
            failureCategory: null,
          }),
        );
      }

      const recent = await getRecentChecksUseCase.execute({ limit: 10 });
      expect(recent).toHaveLength(10);
      const firstTime = new Date(recent[0]?.executedAt ?? 0).getTime();
      const secondTime = new Date(recent[1]?.executedAt ?? 0).getTime();
      expect(firstTime).toBeGreaterThanOrEqual(secondTime);
    });
  });
});
