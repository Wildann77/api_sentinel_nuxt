import {
  AssertionRule,
  CheckResult,
  EndpointUrl,
  EntityNotFoundException,
  FailureCategory,
  HttpMethod,
  Incident,
  Monitor,
  TriggerType,
  UUIDv7,
  ValidationException,
} from "@sentinel/domain";
import { describe, expect, it } from "vitest";
import { toIncidentDto, toMonitorResponseDto } from "../src/mappers/index.js";
import { formatNotificationConfigAad } from "../src/ports/out/cipher.port.js";
import {
  FakeCipher,
  FakeClock,
  FakeLogger,
  FakeNotification,
  FakeProbe,
  FakeQueue,
  FakeUnitOfWork,
  InMemoryCheckResultRepository,
  InMemoryIncidentRepository,
  InMemoryMetricsRepository,
  InMemoryMonitorRepository,
  InMemoryNotificationConfigRepository,
  InMemoryNotificationDeliveryRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  SequentialIdGenerator,
} from "../src/test-doubles/index.js";
import { ValidateSession } from "../src/use-cases/auth/validate-session.use-case.js";
import { DispatchNotification } from "../src/use-cases/incidents/dispatch-notification.use-case.js";
import { CreateMonitor } from "../src/use-cases/monitors/create-monitor.use-case.js";
import { ExecuteScheduledCheck } from "../src/use-cases/monitors/execute-scheduled-check.use-case.js";
import {
  isMaskedSecret,
  mapAssertionRuleInput,
} from "../src/use-cases/monitors/monitor-helpers.js";
import { UpdateMonitor } from "../src/use-cases/monitors/update-monitor.use-case.js";
import { StreamCsvReport } from "../src/use-cases/reports/stream-csv-report.use-case.js";

describe("Application Layer — Branch & Edge Case Coverage", () => {
  describe("monitor-helpers.ts", () => {
    it("evaluates isMaskedSecret accurately across all types", () => {
      expect(isMaskedSecret(null)).toBe(false);
      expect(isMaskedSecret(undefined)).toBe(false);
      expect(isMaskedSecret(12345)).toBe(false);
      expect(isMaskedSecret({ key: "val" })).toBe(false);
      expect(isMaskedSecret("")).toBe(false);
      expect(isMaskedSecret("   ")).toBe(false);
      expect(isMaskedSecret("valid-secret-key")).toBe(false);

      expect(isMaskedSecret("••••••••")).toBe(true);
      expect(isMaskedSecret("•")).toBe(true);
      expect(isMaskedSecret("prefix••••suffix")).toBe(true);
      expect(isMaskedSecret("__SENTINEL_UNCHANGED__")).toBe(true);
    });

    it("maps status assertion rule inputs", () => {
      const fromNumber = mapAssertionRuleInput({
        type: "status",
        operator: "equals",
        expected: 200,
      });
      expect(fromNumber.expected).toEqual([200]);

      const fromString = mapAssertionRuleInput({
        type: "status",
        operator: "not_equals",
        expected: "404",
      });
      expect(fromString.expected).toEqual([404]);
      expect(fromString.operator).toBe("not_equals");

      const fromArray = mapAssertionRuleInput({
        type: "status",
        expected: [200, "201", 204],
      });
      expect(fromArray.expected).toEqual([200, 201, 204]);
      expect(fromArray.operator).toBe("equals");

      const fallback = mapAssertionRuleInput({
        type: "status",
      } as unknown as Record<string, unknown>);
      expect(fallback.expected).toEqual([200]);
    });

    it("maps header assertion rule inputs", () => {
      expect(() =>
        mapAssertionRuleInput({
          type: "header",
        } as unknown as Record<string, unknown>),
      ).toThrow(ValidationException);

      const validHeader = mapAssertionRuleInput({
        type: "header",
        target: "content-type",
        operator: "contains",
        expected: "json",
      });
      expect(validHeader.target).toBe("content-type");
      expect(validHeader.operator).toBe("contains");
      expect(validHeader.expected).toBe("json");

      const headerWithProperty = mapAssertionRuleInput({
        type: "header",
        property: "x-api-version",
      } as unknown as Record<string, unknown>);
      expect(headerWithProperty.target).toBe("x-api-version");
      expect(headerWithProperty.operator).toBe("exists");
    });

    it("maps body-json assertion rule inputs", () => {
      expect(() =>
        mapAssertionRuleInput({
          type: "body-json",
        } as unknown as Record<string, unknown>),
      ).toThrow(ValidationException);

      const validJson = mapAssertionRuleInput({
        type: "body-json",
        target: "$.status",
        operator: "equals",
        expected: "ok",
      });
      expect(validJson.target).toBe("$.status");
      expect(validJson.operator).toBe("equals");
      expect(validJson.expected).toBe("ok");

      const jsonWithProperty = mapAssertionRuleInput({
        type: "body-json",
        property: "$.items[0].id",
      } as unknown as Record<string, unknown>);
      expect(jsonWithProperty.target).toBe("$.items[0].id");
      expect(jsonWithProperty.operator).toBe("exists");
    });

    it("throws ValidationException for unsupported assertion types", () => {
      expect(() =>
        mapAssertionRuleInput({
          type: "unknown-type" as unknown as "status",
        }),
      ).toThrow(ValidationException);
    });
  });

  describe("ValidateSession Use Case Edge Cases", () => {
    const validSecret = "a".repeat(32);

    it("throws when sessionSecret is less than 32 characters", () => {
      const userRepo = new InMemoryUserRepository();
      const sessionRepo = new InMemorySessionRepository();
      const clock = new FakeClock();

      expect(() => new ValidateSession(userRepo, sessionRepo, clock, "short")).toThrow(
        /at least 32 characters/,
      );
    });

    it("returns unauthenticated for empty or whitespace-only token", async () => {
      const userRepo = new InMemoryUserRepository();
      const sessionRepo = new InMemorySessionRepository();
      const clock = new FakeClock();
      const useCase = new ValidateSession(userRepo, sessionRepo, clock, validSecret);

      const resEmpty = await useCase.execute({ token: "" });
      expect(resEmpty.authenticated).toBe(false);

      const resWhitespace = await useCase.execute({ token: "   " });
      expect(resWhitespace.authenticated).toBe(false);

      const resNonString = await useCase.execute({ token: null as unknown as string });
      expect(resNonString.authenticated).toBe(false);
    });

    it("revokes session and returns unauthenticated if user no longer exists", async () => {
      const userRepo = new InMemoryUserRepository();
      const sessionRepo = new InMemorySessionRepository();
      const clock = new FakeClock(new Date("2026-10-27T10:00:00Z"));
      const useCase = new ValidateSession(userRepo, sessionRepo, clock, validSecret);

      // Create session for user that doesn't exist in userRepo
      const token = "valid-token-no-user-exists";
      const crypto = await import("node:crypto");
      const tokenHash = crypto.createHmac("sha256", validSecret).update(token).digest("hex");

      await sessionRepo.create({
        tokenHash,
        userId: "non-existent-user",
        idleExpiresAt: new Date("2026-10-27T12:00:00Z"),
        absoluteExpiresAt: new Date("2026-10-28T10:00:00Z"),
        createdAt: new Date("2026-10-27T10:00:00Z"),
        lastActiveAt: new Date("2026-10-27T10:00:00Z"),
      });

      const res = await useCase.execute({ token });
      expect(res.authenticated).toBe(false);
      expect(await sessionRepo.findByTokenHash(tokenHash)).toBeNull();
    });

    it("clamps idleExpiresAt to absoluteExpiresAt when candidate idle exceeds absolute expiry", async () => {
      const userRepo = new InMemoryUserRepository();
      const sessionRepo = new InMemorySessionRepository();
      const clock = new FakeClock(new Date("2026-10-27T10:00:00Z"));
      const useCase = new ValidateSession(userRepo, sessionRepo, clock, validSecret);

      await userRepo.createOwner({
        id: "user-1",
        username: "admin",
        passwordHash: "hash",
        createdAt: new Date(),
      });

      const token = "near-absolute-expiry-token";
      const crypto = await import("node:crypto");
      const tokenHash = crypto.createHmac("sha256", validSecret).update(token).digest("hex");

      // Absolute expiry is only 2 hours away, whereas default idle TTL is 24 hours
      const absoluteExpiresAt = new Date("2026-10-27T12:00:00Z");
      await sessionRepo.create({
        tokenHash,
        userId: "user-1",
        idleExpiresAt: new Date("2026-10-27T11:00:00Z"),
        absoluteExpiresAt,
        createdAt: new Date("2026-10-27T10:00:00Z"),
        lastActiveAt: new Date("2026-10-27T10:00:00Z"),
      });

      const res = await useCase.execute({ token });
      expect(res.authenticated).toBe(true);

      const updatedSession = await sessionRepo.findByTokenHash(tokenHash);
      expect(updatedSession?.idleExpiresAt.toISOString()).toBe(absoluteExpiresAt.toISOString());
    });
  });

  describe("ExecuteScheduledCheck Use Case Edge Cases", () => {
    it("handles monitor not found and inactive states", async () => {
      const monitorRepo = new InMemoryMonitorRepository();
      const checkRepo = new InMemoryCheckResultRepository();
      const incidentRepo = new InMemoryIncidentRepository();
      const deliveryRepo = new InMemoryNotificationDeliveryRepository();
      const uow = new FakeUnitOfWork();
      const probe = new FakeProbe();
      const cipher = new FakeCipher();
      const queue = new FakeQueue();
      const idGen = new SequentialIdGenerator();
      const clock = new FakeClock();
      const logger = new FakeLogger();

      const useCase = new ExecuteScheduledCheck(
        monitorRepo,
        checkRepo,
        incidentRepo,
        deliveryRepo,
        uow,
        probe,
        cipher,
        queue,
        idGen,
        clock,
        logger,
      );

      const notFound = await useCase.execute({ monitorId: "01940000-0000-7000-8000-000000000001" });
      expect(notFound.status).toBe("SKIPPED");
      expect(notFound.reason).toBe("Monitor not found");

      const inactiveMon = Monitor.create({
        id: UUIDv7.fromString(idGen.generate()),
        name: "Inactive API",
        url: EndpointUrl.create("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: false,
      });
      await monitorRepo.save(inactiveMon);

      const skipped = await useCase.execute({ monitorId: inactiveMon.id.toString() });
      expect(skipped.status).toBe("SKIPPED");
      expect(skipped.reason).toBe("Monitor is paused or inactive");
    });

    it("handles secret decryption error gracefully and continues probe check", async () => {
      const monitorRepo = new InMemoryMonitorRepository();
      const checkRepo = new InMemoryCheckResultRepository();
      const incidentRepo = new InMemoryIncidentRepository();
      const deliveryRepo = new InMemoryNotificationDeliveryRepository();
      const uow = new FakeUnitOfWork();
      const probe = new FakeProbe();
      const cipher = new FakeCipher();
      const queue = new FakeQueue();
      const idGen = new SequentialIdGenerator();
      const clock = new FakeClock();
      const logger = new FakeLogger();

      // Make cipher throw on decrypt
      cipher.decrypt = async () => {
        throw new Error("Corrupted AEAD tag mismatch");
      };

      const monitor = Monitor.create({
        id: UUIDv7.fromString(idGen.generate()),
        name: "Encrypted API",
        url: EndpointUrl.create("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
        encryptedHeaders: {
          cipherText: "corrupted_headers",
          keyId: "k1",
          algorithm: "xchacha20poly1305_ietf",
        },
        encryptedBody: {
          cipherText: "corrupted_body",
          keyId: "k1",
          algorithm: "xchacha20poly1305_ietf",
        },
        encryptedAuthConfig: {
          cipherText: "corrupted_auth",
          keyId: "k1",
          algorithm: "xchacha20poly1305_ietf",
        },
      });
      await monitorRepo.save(monitor);

      probe.enqueueResponse({
        statusCode: 200,
        headers: {},
        bodySnippet: "OK",
        durationMs: 40,
      });

      const useCase = new ExecuteScheduledCheck(
        monitorRepo,
        checkRepo,
        incidentRepo,
        deliveryRepo,
        uow,
        probe,
        cipher,
        queue,
        idGen,
        clock,
        logger,
      );

      const result = await useCase.execute({
        monitorId: monitor.id.toString(),
        scheduledFor: "2026-10-27T10:00:00Z",
      });

      expect(result.status).toBe("EXECUTED");
      expect(logger.logs.some((l) => l.msg.includes("Failed to decrypt monitor secrets"))).toBe(
        true,
      );
    });

    it("catches unexpected orchestrator exceptions and records EXECUTION_ABORTED", async () => {
      const monitorRepo = new InMemoryMonitorRepository();
      const checkRepo = new InMemoryCheckResultRepository();
      const incidentRepo = new InMemoryIncidentRepository();
      const deliveryRepo = new InMemoryNotificationDeliveryRepository();
      const uow = new FakeUnitOfWork();
      const probe = new FakeProbe();
      const cipher = new FakeCipher();
      const queue = new FakeQueue();
      const idGen = new SequentialIdGenerator();
      const clock = new FakeClock();
      const logger = new FakeLogger();

      const monitor = Monitor.create({
        id: UUIDv7.fromString(idGen.generate()),
        name: "Crashing API",
        url: EndpointUrl.create("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
      });
      await monitorRepo.save(monitor);

      // Make probe throw unexpected Error
      probe.probe = async () => {
        throw new Error("System out of memory panic");
      };

      const useCase = new ExecuteScheduledCheck(
        monitorRepo,
        checkRepo,
        incidentRepo,
        deliveryRepo,
        uow,
        probe,
        cipher,
        queue,
        idGen,
        clock,
        logger,
      );

      const result = await useCase.execute({ monitorId: monitor.id.toString() });
      expect(result.status).toBe("EXECUTED");
      expect(result.isSuccess).toBe(false);

      const checks = await checkRepo.findByMonitorId(monitor.id, 10);
      expect(checks[0]?.failureCategory).toBe(FailureCategory.EXECUTION_ABORTED);
      expect(checks[0]?.sanitizedDiagnostic).toContain("System out of memory panic");
    });

    it("aborts transaction early if monitor becomes inactive or was deleted concurrently", async () => {
      const monitorRepo = new InMemoryMonitorRepository();
      const checkRepo = new InMemoryCheckResultRepository();
      const incidentRepo = new InMemoryIncidentRepository();
      const deliveryRepo = new InMemoryNotificationDeliveryRepository();
      const uow = new FakeUnitOfWork();
      const probe = new FakeProbe();
      const cipher = new FakeCipher();
      const queue = new FakeQueue();
      const idGen = new SequentialIdGenerator();
      const clock = new FakeClock();
      const logger = new FakeLogger();

      const monitor = Monitor.create({
        id: UUIDv7.fromString(idGen.generate()),
        name: "Concurrently Deleted API",
        url: EndpointUrl.create("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
      });
      await monitorRepo.save(monitor);

      // Simulate lockForUpdate returning null (deleted concurrently)
      monitorRepo.lockForUpdate = async () => null;

      const useCase = new ExecuteScheduledCheck(
        monitorRepo,
        checkRepo,
        incidentRepo,
        deliveryRepo,
        uow,
        probe,
        cipher,
        queue,
        idGen,
        clock,
        logger,
      );

      const _result = await useCase.execute({ monitorId: monitor.id.toString() });
      expect(logger.logs.some((l) => l.msg.includes("Monitor state changed or was deleted"))).toBe(
        true,
      );
    });
  });

  describe("DispatchNotification Use Case Edge Cases", () => {
    it("skips and logs warning if incident or monitor does not exist", async () => {
      const incidentRepo = new InMemoryIncidentRepository();
      const monitorRepo = new InMemoryMonitorRepository();
      const configRepo = new InMemoryNotificationConfigRepository();
      const deliveryRepo = new InMemoryNotificationDeliveryRepository();
      const notifPort = new FakeNotification();
      const cipher = new FakeCipher();
      const clock = new FakeClock();
      const logger = new FakeLogger();

      const encryptedBotToken = await cipher.encrypt(
        "bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
        formatNotificationConfigAad("cfg-1", "botToken"),
      );
      await configRepo.saveTelegramConfig({
        id: "cfg-1",
        chatId: "123456",
        encryptedBotToken,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const useCase = new DispatchNotification(
        configRepo,
        incidentRepo,
        monitorRepo,
        deliveryRepo,
        notifPort,
        cipher,
        clock,
        logger,
      );

      // Incident not found
      await useCase.execute({
        incidentId: "01940000-0000-7000-8000-000000000099",
        monitorId: "01940000-0000-7000-8000-000000000098",
        type: "OPENED",
      });
      expect(logger.logs.some((l) => l.msg.includes("incident not found"))).toBe(true);

      // Incident found, but monitor not found
      const incident = new Incident({
        id: new UUIDv7("01940000-0000-7000-8000-000000000010"),
        monitorId: new UUIDv7("01940000-0000-7000-8000-000000000011"),
        startedAt: new Date(),
        causeCategory: FailureCategory.HTTP_STATUS_MISMATCH,
        initialErrorMessage: "HTTP 500",
      });
      await incidentRepo.save(incident);

      await useCase.execute({
        incidentId: incident.id.toString(),
        monitorId: incident.monitorId.toString(),
        type: "OPENED",
      });
      expect(logger.logs.some((l) => l.msg.includes("monitor not found"))).toBe(true);
    });

    it("propagates retryAfterSeconds when Telegram returns 429 rate limit", async () => {
      const incidentRepo = new InMemoryIncidentRepository();
      const monitorRepo = new InMemoryMonitorRepository();
      const configRepo = new InMemoryNotificationConfigRepository();
      const deliveryRepo = new InMemoryNotificationDeliveryRepository();
      const notifPort = new FakeNotification();
      notifPort.queueResult({
        success: false,
        error: "Too Many Requests",
        retryAfterSeconds: 45,
      });
      const cipher = new FakeCipher();
      const clock = new FakeClock();
      const logger = new FakeLogger();

      const encryptedBotToken = await cipher.encrypt(
        "bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
        formatNotificationConfigAad("cfg-1", "botToken"),
      );
      await configRepo.saveTelegramConfig({
        id: "cfg-1",
        chatId: "123456",
        encryptedBotToken,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const monitor = Monitor.create({
        id: new UUIDv7("01940000-0000-7000-8000-000000000021"),
        name: "Rate Limited API",
        url: EndpointUrl.create("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
      });
      await monitorRepo.save(monitor);

      const incident = new Incident({
        id: new UUIDv7("01940000-0000-7000-8000-000000000020"),
        monitorId: monitor.id,
        startedAt: new Date(),
        causeCategory: FailureCategory.HTTP_STATUS_MISMATCH,
        initialErrorMessage: "503 Service Unavailable",
      });
      await incidentRepo.save(incident);

      const useCase = new DispatchNotification(
        configRepo,
        incidentRepo,
        monitorRepo,
        deliveryRepo,
        notifPort,
        cipher,
        clock,
        logger,
      );

      try {
        await useCase.execute({
          incidentId: incident.id.toString(),
          monitorId: monitor.id.toString(),
          type: "OPENED",
        });
        expect.unreachable("Should have thrown rate limit error");
      } catch (err: unknown) {
        const error = err as { message: string; retryAfterSeconds?: number };
        expect(error.message).toContain("Too Many Requests");
        expect(error.retryAfterSeconds).toBe(45);
      }
    });
  });

  describe("StreamCsvReport Edge Cases", () => {
    it("streams CSV for checks and falls back to idStr if monitor deleted", async () => {
      const monitorRepo = new InMemoryMonitorRepository();
      const checkRepo = new InMemoryCheckResultRepository();
      const incidentRepo = new InMemoryIncidentRepository();

      const deletedMonitorId = "01940000-0000-7000-8000-000000000030";
      const checkResult = CheckResult.create({
        id: new UUIDv7("01940000-0000-7000-8000-000000000031"),
        monitorId: new UUIDv7(deletedMonitorId),
        triggerType: TriggerType.SCHEDULED,
        startedAt: new Date("2026-10-27T08:00:00Z"),
        finishedAt: new Date("2026-10-27T08:00:01Z"),
        durationMs: 120,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
        assertionResults: [],
        diagnostic: null,
      });
      await checkRepo.save(checkResult);

      const streamUseCase = new StreamCsvReport(checkRepo, incidentRepo, monitorRepo);
      const chunks: string[] = [];
      for await (const chunk of await streamUseCase.execute({
        query: {
          type: "checks",
          from: "2026-10-27T00:00:00Z",
          to: "2026-10-27T23:59:59Z",
        },
      })) {
        chunks.push(chunk);
      }

      const csv = chunks.join("");
      expect(csv).toContain(deletedMonitorId); // Fallback to id string as monitor name
    });

    it("streams CSV for incidents with empty fields sanitized", async () => {
      const monitorRepo = new InMemoryMonitorRepository();
      const checkRepo = new InMemoryCheckResultRepository();
      const incidentRepo = new InMemoryIncidentRepository();

      const monitor = Monitor.create({
        id: new UUIDv7("01940000-0000-7000-8000-000000000040"),
        name: "Test Monitor",
        url: EndpointUrl.create("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
      });
      await monitorRepo.save(monitor);

      const incident = new Incident({
        id: new UUIDv7("01940000-0000-7000-8000-000000000041"),
        monitorId: monitor.id,
        startedAt: new Date("2026-10-27T09:00:00Z"),
        causeCategory: FailureCategory.CONNECTION_TIMEOUT,
        initialErrorMessage: "Connection timed out",
      });
      await incidentRepo.save(incident);

      const streamUseCase = new StreamCsvReport(checkRepo, incidentRepo, monitorRepo);
      const chunks: string[] = [];
      for await (const chunk of await streamUseCase.execute({
        query: {
          type: "incidents",
          from: "2026-10-27T00:00:00Z",
          to: "2026-10-27T23:59:59Z",
        },
      })) {
        chunks.push(chunk);
      }

      const csv = chunks.join("");
      expect(csv).toContain("OPEN");
      expect(csv).toContain("CONNECTION_TIMEOUT");
    });
  });

  describe("Mappers Edge Cases", () => {
    it("maps monitor assertion expected with non-primitive object to string", () => {
      const monitor = Monitor.create({
        id: new UUIDv7("01940000-0000-7000-8000-000000000050"),
        name: "Complex Expected API",
        url: EndpointUrl.create("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
        assertionRules: [
          {
            type: "header",
            target: "x-custom",
            operator: "equals",
            expected: { nested: true },
          } as unknown as import("@sentinel/domain").AssertionRule,
        ],
      });

      const dto = toMonitorResponseDto(monitor);
      expect(dto.assertions[0]?.expected).toBe("[object Object]");
    });

    it("maps incident with custom createdAt and explicit status", () => {
      const incident = new Incident({
        id: new UUIDv7("01940000-0000-7000-8000-000000000060"),
        monitorId: new UUIDv7("01940000-0000-7000-8000-000000000061"),
        startedAt: new Date("2026-10-27T09:00:00Z"),
        causeCategory: FailureCategory.DNS_RESOLUTION_FAILED,
        initialErrorMessage: "NXDOMAIN",
      });

      const dto = toIncidentDto(incident, {
        createdAt: "2026-10-27T09:00:00Z",
        status: "INVESTIGATING" as unknown as import("@sentinel/contracts").IncidentStatus,
        notificationDeliveries: [
          {
            id: "deliv-1",
            incidentId: incident.id.toString(),
            channel: "TELEGRAM",
            status: "SENT",
            attemptCount: 1,
            sentAt: "2026-10-27T09:01:00.000Z",
            lastError: null,
          },
        ],
        checks: [],
      });

      expect(dto.status).toBe("INVESTIGATING");
      expect(dto.createdAt).toBe("2026-10-27T09:00:00.000Z");
      expect(dto.notificationDeliveries).toHaveLength(1);
    });

    it("maps monitor assertion expected with string, number, boolean", () => {
      const monitor = Monitor.create({
        id: new UUIDv7("01940000-0000-7000-8000-000000000070"),
        name: "Primitive Expected API",
        url: EndpointUrl.create("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
        assertionRules: [
          new AssertionRule({
            type: "header",
            target: "content-type",
            operator: "equals",
            expected: "json",
          }),
          new AssertionRule({
            type: "body-json",
            target: "$.code",
            operator: "equals",
            expected: 0,
          }),
          new AssertionRule({
            type: "body-json",
            target: "$.active",
            operator: "equals",
            expected: true,
          }),
        ],
      });

      const dto = toMonitorResponseDto(monitor);
      expect(dto.assertions[0]?.expected).toBe("json");
      expect(dto.assertions[1]?.expected).toBe(0);
      expect(dto.assertions[2]?.expected).toBe(true);
    });
  });

  describe("ExecuteManualCheck Edge Cases", () => {
    it("handles monitor not found, decryption success and failure, and concurrent delete", async () => {
      const { ExecuteManualCheck } = await import(
        "../src/use-cases/monitors/execute-manual-check.use-case.js"
      );
      const monitorRepo = new InMemoryMonitorRepository();
      const checkRepo = new InMemoryCheckResultRepository();
      const uow = new FakeUnitOfWork();
      const probe = new FakeProbe();
      const cipher = new FakeCipher();
      const idGen = new SequentialIdGenerator();
      const clock = new FakeClock();
      const logger = new FakeLogger();

      const manualCheck = new ExecuteManualCheck(
        monitorRepo,
        checkRepo,
        uow,
        cipher,
        clock,
        idGen,
        logger,
        probe,
      );

      // Not found throws Error
      await expect(
        manualCheck.execute({ monitorId: "01940000-0000-7000-8000-000000000088" }),
      ).rejects.toThrow(/not found/);

      // Decryption success with headers, body, authConfig
      const { formatMonitorAad } = await import("../src/ports/out/cipher.port.js");
      const monId = new UUIDv7("01940000-0000-7000-8000-000000000089");
      const aadHeaders = formatMonitorAad(monId.toString(), "headers");
      const aadBody = formatMonitorAad(monId.toString(), "body");
      const aadAuth = formatMonitorAad(monId.toString(), "authConfig");

      const encHeaders = await cipher.encrypt(
        JSON.stringify({ "X-API-Key": "secret" }),
        aadHeaders,
      );
      const encBody = await cipher.encrypt("payload-body", aadBody);
      const encAuth = await cipher.encrypt(
        JSON.stringify({ type: "BEARER", token: "tok123" }),
        aadAuth,
      );

      const monitor = Monitor.create({
        id: monId,
        name: "Manual Check API",
        url: EndpointUrl.create("https://example.com"),
        method: HttpMethod.POST,
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
        encryptedHeaders: {
          cipherText: encHeaders,
          keyId: "k1",
          algorithm: "xchacha20poly1305_ietf",
        },
        encryptedBody: { cipherText: encBody, keyId: "k1", algorithm: "xchacha20poly1305_ietf" },
        encryptedAuthConfig: {
          cipherText: encAuth,
          keyId: "k1",
          algorithm: "xchacha20poly1305_ietf",
        },
      });
      await monitorRepo.save(monitor);

      const res = await manualCheck.execute({ monitorId: monId.toString() });
      expect(res.status).toBe("UP");

      // Concurrent delete inside lockForUpdate
      monitorRepo.lockForUpdate = async () => null;
      const _resDeleted = await manualCheck.execute({ monitorId: monId.toString() });
      expect(logger.logs.some((l) => l.msg.includes("Monitor deleted before lock acquired"))).toBe(
        true,
      );
    });
  });

  describe("CreateMonitor & UpdateMonitor Edge Cases", () => {
    it("creates monitor with headers, body, custom auth types, and assertions", async () => {
      const monitorRepo = new InMemoryMonitorRepository();
      const cipher = new FakeCipher();
      const clock = new FakeClock();
      const idGen = new SequentialIdGenerator();

      const createUseCase = new CreateMonitor(monitorRepo, cipher, clock, idGen);

      const created = await createUseCase.execute({
        name: "Full Feature Monitor",
        url: "https://example.com/api",
        method: "POST",
        customHeaders: { "x-tenant": "acme" },
        body: '{"ping": true}',
        auth: { type: "BASIC", username: "user", password: "pw" },
        assertions: [
          { type: "status", operator: "equals", expected: 201 },
          { type: "header", target: "content-type", operator: "contains", expected: "json" },
        ],
      });

      expect(created.headerKeys).toContain("x-tenant");
      expect(created.authType).toBe("BASIC");
      expect(created.assertions).toHaveLength(2);
    });

    it("updates monitor with validation error, cleared headers, and updated assertions", async () => {
      const monitorRepo = new InMemoryMonitorRepository();
      const cipher = new FakeCipher();
      const clock = new FakeClock();
      const idGen = new SequentialIdGenerator();

      const createUseCase = new CreateMonitor(monitorRepo, cipher, clock, idGen);
      const updateUseCase = new UpdateMonitor(monitorRepo, cipher, clock);

      const created = await createUseCase.execute({
        name: "Updatable API",
        url: "https://example.com/updatable",
        customHeaders: { "x-app": "sentinel" },
      });

      // Validation failure: invalid intervalSeconds (less than 10)
      await expect(
        updateUseCase.execute({
          id: created.id,
          intervalSeconds: 2 as unknown as number,
        }),
      ).rejects.toThrow(ValidationException);

      // Clear headers with empty object
      const updated = await updateUseCase.execute({
        id: created.id,
        customHeaders: {},
        assertions: [{ type: "status", operator: "equals", expected: 200 }],
      });
      expect(updated.headerKeys).toHaveLength(0);
      expect(updated.assertions).toHaveLength(1);
    });
  });

  describe("Settings Use Cases Edge Cases", () => {
    it("handles update telegram settings validation and persistence", async () => {
      const { UpdateTelegramSettings } = await import(
        "../src/use-cases/settings/update-telegram-settings.use-case.js"
      );
      const configRepo = new InMemoryNotificationConfigRepository();
      const cipher = new FakeCipher();
      const clock = new FakeClock();
      const idGen = new SequentialIdGenerator();
      const logger = new FakeLogger();

      const useCase = new UpdateTelegramSettings(configRepo, cipher, clock, idGen, logger);

      // Validation failure
      await expect(
        useCase.execute({
          botToken: "invalid_format",
          chatId: "",
        }),
      ).rejects.toThrow(ValidationException);

      // Success without existing config
      const validToken = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456789";
      const res = await useCase.execute({
        botToken: validToken,
        chatId: "123456",
      });
      expect(res.configured).toBe(true);
      expect(res.chatId).toBe("123456");

      // Success with existing config
      const resUpdated = await useCase.execute({
        botToken: validToken,
        chatId: "987654",
      });
      expect(resUpdated.chatId).toBe("987654");
    });

    it("handles test telegram notification scenarios (validation, missing config, fallback)", async () => {
      const { TestTelegramNotification } = await import(
        "../src/use-cases/settings/test-telegram-notification.use-case.js"
      );
      const configRepo = new InMemoryNotificationConfigRepository();
      const notifPort = new FakeNotification();
      const cipher = new FakeCipher();
      const logger = new FakeLogger();

      const useCase = new TestTelegramNotification(configRepo, notifPort, cipher, logger);

      // Validation failure
      await expect(
        useCase.execute({
          botToken: "short",
          chatId: "",
        } as unknown as Parameters<typeof useCase.execute>[0]),
      ).rejects.toThrow(ValidationException);

      // Missing stored config when params empty
      await expect(useCase.execute({})).rejects.toThrow(ValidationException);

      // Save valid stored config
      const validToken = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456789";
      const { formatNotificationConfigAad } = await import("../src/ports/out/cipher.port.js");
      const enc = await cipher.encrypt(
        validToken,
        formatNotificationConfigAad("cfg-1", "botToken"),
      );
      await configRepo.saveTelegramConfig({
        id: "cfg-1",
        chatId: "55555",
        encryptedBotToken: enc,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Partial params: missing token, uses stored token
      const resFallbackToken = await useCase.execute({ chatId: "77777" });
      expect(resFallbackToken.success).toBe(true);

      // Partial params: missing chatId, uses stored chatId
      const resFallbackChat = await useCase.execute({ botToken: validToken });
      expect(resFallbackChat.success).toBe(true);

      // Notification failure
      notifPort.defaultResult = { success: false, error: "Telegram API 500 error" };
      const resFail = await useCase.execute({});
      expect(resFail.success).toBe(false);
      expect(resFail.message).toContain("Telegram API 500");
    });
  });

  describe("ProbeCheckOrchestrator Edge Cases", () => {
    it("handles null durations, null status code, and assertion defaults", async () => {
      const { ProbeCheckOrchestrator } = await import(
        "../src/services/probe-check-orchestrator.js"
      );
      const probe = new FakeProbe();
      const clock = new FakeClock();
      const idGen = new SequentialIdGenerator();

      const orchestrator = new ProbeCheckOrchestrator(probe, clock, idGen);

      probe.enqueueResponse({
        statusCode: null,
        headers: {},
        bodySnippet: null,
        durationMs: null,
        dnsDurationMs: null,
        connectDurationMs: null,
        tlsDurationMs: null,
      });

      const res = await orchestrator.execute({
        monitorId: new UUIDv7("01940000-0000-7000-8000-000000000091"),
        url: "https://example.com",
        method: "GET",
        timeoutMs: 5000,
        assertionRules: [new AssertionRule({ type: "status", operator: "equals", expected: 500 })],
        triggerType: TriggerType.SCHEDULED,
      });

      expect(res.checkResult.isSuccess).toBe(false);
      expect(res.checkResult.statusCode).toBeNull();
      expect(res.checkResult.durationMs).toBeNull();
    });

    it("records telemetry spans for connect, tls, and transfer duration breakdown", async () => {
      const { ProbeCheckOrchestrator } = await import(
        "../src/services/probe-check-orchestrator.js"
      );
      const probe = new FakeProbe();
      const clock = new FakeClock();
      const idGen = new SequentialIdGenerator();
      const spans: unknown[] = [];
      const fakeTelemetry = {
        recordSpan: (span: unknown) => spans.push(span),
        withSpan: async <T>(_name: string, fn: () => Promise<T>): Promise<T> => fn(),
      };

      const orchestrator = new ProbeCheckOrchestrator(
        probe,
        clock,
        idGen,
        fakeTelemetry as unknown as import("../src/ports/out/telemetry.port.js").TelemetryPort,
      );

      probe.enqueueResponse({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        bodySnippet: '{"status":"ok"}',
        durationMs: 150,
        dnsDurationMs: 15,
        connectDurationMs: 25,
        tlsDurationMs: 35,
      });

      const res = await orchestrator.execute({
        monitorId: new UUIDv7("01940000-0000-7000-8000-000000000092"),
        url: "https://example.com/api",
        method: "GET",
        timeoutMs: 5000,
        assertionRules: [new AssertionRule({ type: "status", operator: "equals", expected: 200 })],
        triggerType: TriggerType.SCHEDULED,
      });

      expect(res.checkResult.isSuccess).toBe(true);
      expect(spans.some((s) => s.name === "probe.tcp_connect")).toBe(true);
      expect(spans.some((s) => s.name === "probe.tls_handshake")).toBe(true);
      expect(spans.some((s) => s.name === "probe.response_transfer")).toBe(true);
      expect(spans.some((s) => s.name === "assertion.evaluation")).toBe(true);
    });

    it("handles probe errorCategory and custom correlationId", async () => {
      const { ProbeCheckOrchestrator } = await import(
        "../src/services/probe-check-orchestrator.js"
      );
      const probe = new FakeProbe();
      const clock = new FakeClock();
      const idGen = new SequentialIdGenerator();

      const orchestrator = new ProbeCheckOrchestrator(probe, clock, idGen);

      probe.enqueueResponse({
        statusCode: null,
        headers: {},
        bodySnippet: null,
        durationMs: 5000,
        errorCategory: FailureCategory.CONNECTION_TIMEOUT,
        errorMessage: "Connection timed out after 5000ms",
      });

      const res = await orchestrator.execute({
        monitorId: new UUIDv7("01940000-0000-7000-8000-000000000093"),
        url: "https://timeout.example.com",
        method: "GET",
        timeoutMs: 5000,
        assertionRules: [],
        triggerType: TriggerType.MANUAL,
        correlationId: "custom-corr-123",
      });

      expect(res.checkResult.isSuccess).toBe(false);
      expect(res.checkResult.correlationId).toBe("custom-corr-123");
      expect(res.checkResult.failureCategory).toBe(FailureCategory.CONNECTION_TIMEOUT);
      expect(res.checkResult.sanitizedDiagnostic).toContain("Connection timed out");
    });
  });

  describe("Monitor Use Cases — Branch Coverage", () => {
    it("PauseMonitor handles string, object command, and not found", async () => {
      const { PauseMonitor } = await import("../src/use-cases/monitors/pause-monitor.use-case.js");
      const monitorRepo = new InMemoryMonitorRepository();
      const queue = new FakeQueue();
      const useCase = new PauseMonitor(monitorRepo, queue);

      const monitor = Monitor.create({
        id: new UUIDv7("01940000-0000-7000-8000-000000000101"),
        name: "Test Pause",
        url: new EndpointUrl("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        assertionRules: [],
        now: new Date(),
      });
      await monitorRepo.save(monitor);

      // String ID
      const paused1 = await useCase.execute(monitor.id.toString());
      expect(paused1.isActive).toBe(false);

      // Object command
      const paused2 = await useCase.execute({ id: monitor.id.toString() });
      expect(paused2.isActive).toBe(false);

      // Not found
      await expect(useCase.execute("01940000-0000-7000-8000-999999999999")).rejects.toThrow(
        EntityNotFoundException,
      );
    });

    it("ResumeMonitor handles string, object command, and not found", async () => {
      const { ResumeMonitor } = await import(
        "../src/use-cases/monitors/resume-monitor.use-case.js"
      );
      const monitorRepo = new InMemoryMonitorRepository();
      const clock = new FakeClock();
      const useCase = new ResumeMonitor(monitorRepo, clock);

      const monitor = Monitor.create({
        id: new UUIDv7("01940000-0000-7000-8000-000000000102"),
        name: "Test Resume",
        url: new EndpointUrl("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        assertionRules: [],
        now: new Date(),
      });
      monitor.pause();
      await monitorRepo.save(monitor);

      // String ID
      const res1 = await useCase.execute(monitor.id.toString());
      expect(res1.isActive).toBe(true);

      // Object command
      const res2 = await useCase.execute({ id: monitor.id.toString() });
      expect(res2.isActive).toBe(true);

      // Not found
      await expect(useCase.execute("01940000-0000-7000-8000-999999999999")).rejects.toThrow(
        EntityNotFoundException,
      );
    });

    it("DeleteMonitor handles string, object command, and not found", async () => {
      const { DeleteMonitor } = await import(
        "../src/use-cases/monitors/delete-monitor.use-case.js"
      );
      const monitorRepo = new InMemoryMonitorRepository();
      const queue = new FakeQueue();
      const useCase = new DeleteMonitor(monitorRepo, queue);

      const monitor = Monitor.create({
        id: new UUIDv7("01940000-0000-7000-8000-000000000103"),
        name: "Test Delete",
        url: new EndpointUrl("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        assertionRules: [],
        now: new Date(),
      });
      await monitorRepo.save(monitor);

      // Object command
      await useCase.execute({ id: monitor.id.toString() });
      expect(await monitorRepo.findById(monitor.id.toString())).toBeNull();

      // String command not found
      await expect(useCase.execute(monitor.id.toString())).rejects.toThrow(EntityNotFoundException);
    });

    it("GetMonitor handles invalid id, not found, and success", async () => {
      const { GetMonitor } = await import("../src/use-cases/monitors/get-monitor.use-case.js");
      const monitorRepo = new InMemoryMonitorRepository();
      const useCase = new GetMonitor(monitorRepo);

      // Invalid ID
      await expect(useCase.execute("" as unknown as string)).rejects.toThrow(ValidationException);
      await expect(useCase.execute(null as unknown as string)).rejects.toThrow(ValidationException);

      // Not found
      await expect(useCase.execute("01940000-0000-7000-8000-999999999999")).rejects.toThrow(
        EntityNotFoundException,
      );

      // Success
      const monitor = Monitor.create({
        id: new UUIDv7("01940000-0000-7000-8000-000000000104"),
        name: "Found Monitor",
        url: new EndpointUrl("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        assertionRules: [],
        now: new Date(),
      });
      await monitorRepo.save(monitor);

      const found = await useCase.execute(monitor.id.toString());
      expect(found.id).toBe(monitor.id.toString());
      expect(found.name).toBe("Found Monitor");
    });

    it("TestMonitorConfig validates input and executes orchestrator", async () => {
      const { TestMonitorConfig } = await import(
        "../src/use-cases/monitors/test-monitor-config.use-case.js"
      );
      const probe = new FakeProbe();
      const clock = new FakeClock();
      const idGen = new SequentialIdGenerator();

      const useCase = new TestMonitorConfig(probe, clock, idGen);

      // Invalid input throws ValidationException
      await expect(
        useCase.execute({
          request: {
            url: "invalid-url",
            method: "GET",
          } as unknown as Parameters<typeof useCase.execute>[0]["request"],
        }),
      ).rejects.toThrow(ValidationException);

      // Valid execution
      probe.enqueueResponse({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        bodySnippet: '{"status":"ok"}',
        durationMs: 45,
      });

      const res = await useCase.execute({
        request: {
          url: "https://api.example.com/health",
          method: "GET",
          timeoutMs: 5000,
          assertions: [{ type: "status", operator: "equals", expected: 200 }],
          auth: { type: "BEARER", token: "secret-token" },
        },
      });

      expect(res.status).toBe("UP");
      expect(res.statusCode).toBe(200);
      expect(res.diagnostics.responseBodySnippet).toBe('{"status":"ok"}');
    });
  });

  describe("Check & Incident Use Cases — Branch Coverage", () => {
    it("ListChecksUseCase validates params and returns cursor pagination", async () => {
      const { ListChecksUseCase } = await import("../src/use-cases/checks/list-checks.use-case.js");
      const checkRepo = new InMemoryCheckResultRepository();
      const monitorRepo = new InMemoryMonitorRepository();
      const useCase = new ListChecksUseCase(checkRepo, monitorRepo);

      // Invalid monitor ID
      await expect(useCase.execute({ monitorId: "not-uuid" })).rejects.toThrow(ValidationException);

      // Monitor not found
      await expect(
        useCase.execute({ monitorId: "01940000-0000-7000-8000-999999999999" }),
      ).rejects.toThrow(EntityNotFoundException);

      const monId = "01940000-0000-7000-8000-000000000201";
      const monitor = Monitor.create({
        id: new UUIDv7(monId),
        name: "Checks Monitor",
        url: new EndpointUrl("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        assertionRules: [],
        now: new Date(),
      });
      await monitorRepo.save(monitor);

      // Invalid from / to dates
      await expect(useCase.execute({ monitorId: monId, from: "invalid-date" })).rejects.toThrow(
        ValidationException,
      );
      await expect(useCase.execute({ monitorId: monId, to: "invalid-date" })).rejects.toThrow(
        ValidationException,
      );

      // Add sample check results
      const c1 = CheckResult.create({
        id: new UUIDv7("01940000-0000-7000-8000-000000000211"),
        monitorId: new UUIDv7(monId),
        incidentId: null,
        triggerType: TriggerType.SCHEDULED,
        scheduledFor: null,
        startedAt: new Date(Date.now() - 5000),
        finishedAt: new Date(Date.now() - 4900),
        durationMs: 100,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
        assertionResults: [],
        diagnostic: null,
        correlationId: "corr-1",
      });
      const c2 = CheckResult.create({
        id: new UUIDv7("01940000-0000-7000-8000-000000000212"),
        monitorId: new UUIDv7(monId),
        incidentId: null,
        triggerType: TriggerType.SCHEDULED,
        scheduledFor: null,
        startedAt: new Date(Date.now() - 2000),
        finishedAt: new Date(Date.now() - 1900),
        durationMs: 100,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
        assertionResults: [],
        diagnostic: null,
        correlationId: "corr-2",
      });
      await checkRepo.save(c1);
      await checkRepo.save(c2);

      // Limit 1 hasMore = true
      const page1 = await useCase.execute({
        monitorId: monId,
        limit: 1,
        from: new Date(Date.now() - 10000).toISOString(),
        to: new Date().toISOString(),
      });
      expect(page1.pagination.hasMore).toBe(true);
      expect(page1.pagination.nextCursor).toBeDefined();

      // Limit 10 hasMore = false
      const pageAll = await useCase.execute({ monitorId: monId, limit: 10 });
      expect(pageAll.pagination.hasMore).toBe(false);
      expect(pageAll.data.length).toBe(2);
    });

    it("GetCheckDetailUseCase handles validation, not found, and returns DTO", async () => {
      const { GetCheckDetailUseCase } = await import(
        "../src/use-cases/checks/get-check-detail.use-case.js"
      );
      const checkRepo = new InMemoryCheckResultRepository();
      const useCase = new GetCheckDetailUseCase(checkRepo);

      await expect(useCase.execute("")).rejects.toThrow(ValidationException);
      await expect(useCase.execute("not-uuid")).rejects.toThrow(ValidationException);
      await expect(useCase.execute("01940000-0000-7000-8000-999999999999")).rejects.toThrow(
        EntityNotFoundException,
      );

      const check = CheckResult.create({
        id: new UUIDv7("01940000-0000-7000-8000-000000000221"),
        monitorId: new UUIDv7("01940000-0000-7000-8000-000000000201"),
        incidentId: null,
        triggerType: TriggerType.MANUAL,
        scheduledFor: null,
        startedAt: new Date(),
        finishedAt: new Date(),
        durationMs: 50,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
        assertionResults: [],
        diagnostic: null,
        correlationId: "check-corr",
      });
      await checkRepo.save(check);

      const res = await useCase.execute(check.id.toString());
      expect(res.id).toBe(check.id.toString());
      expect(res.status).toBe("UP");
    });

    it("GetRecentChecksUseCase handles limit bounds and returns list", async () => {
      const { GetRecentChecksUseCase } = await import(
        "../src/use-cases/checks/get-recent-checks.use-case.js"
      );
      const checkRepo = new InMemoryCheckResultRepository();
      const useCase = new GetRecentChecksUseCase(checkRepo);

      const listEmpty = await useCase.execute();
      expect(listEmpty).toEqual([]);

      const listWithLimit = await useCase.execute({ limit: 5 });
      expect(listWithLimit).toEqual([]);
    });

    it("GetIncident handles status states, notification deliveries, and not found", async () => {
      const { GetIncident } = await import("../src/use-cases/incidents/get-incident.use-case.js");
      const incidentRepo = new InMemoryIncidentRepository();
      const monitorRepo = new InMemoryMonitorRepository();
      const notifRepo = new InMemoryNotificationDeliveryRepository();
      const checkRepo = new InMemoryCheckResultRepository();

      const useCase = new GetIncident(incidentRepo, monitorRepo, notifRepo, checkRepo);

      await expect(useCase.execute("")).rejects.toThrow(ValidationException);
      await expect(useCase.execute("01940000-0000-7000-8000-999999999999")).rejects.toThrow(
        EntityNotFoundException,
      );

      const monId = new UUIDv7("01940000-0000-7000-8000-000000000301");
      const monitor = Monitor.create({
        id: monId,
        name: "Incident Monitor",
        url: new EndpointUrl("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        assertionRules: [],
        now: new Date(),
      });
      await monitorRepo.save(monitor);

      const incident = new Incident({
        id: new UUIDv7("01940000-0000-7000-8000-000000000311"),
        monitorId: monId,
        startedAt: new Date(Date.now() - 60000),
        causeCategory: FailureCategory.HTTP_STATUS_MISMATCH,
        initialErrorMessage: "500 Internal Server Error",
      });
      await incidentRepo.save(incident);

      // Save delivery with null and non-null lastAttemptAt
      await notifRepo.save({
        id: "del-1",
        incidentId: incident.id.toString(),
        channel: "telegram",
        status: "DELIVERED",
        attemptCount: 1,
        lastAttemptAt: new Date(),
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await notifRepo.save({
        id: "del-2",
        incidentId: incident.id.toString(),
        channel: "telegram",
        status: "PENDING",
        attemptCount: 0,
        lastAttemptAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Status OPEN
      const openRes = await useCase.execute(incident.id.toString());
      expect(openRes.status).toBe("OPEN");
      expect(openRes.monitorName).toBe("Incident Monitor");
      expect(openRes.notificationDeliveries.length).toBe(2);

      // Status RECOVERING (consecutiveSuccesses === 1)
      monitor.recordCheckSuccess(
        CheckResult.create({
          id: new UUIDv7("01940000-0000-7000-8000-000000000321"),
          monitorId: monId,
          incidentId: incident.id,
          triggerType: TriggerType.SCHEDULED,
          scheduledFor: null,
          startedAt: new Date(),
          finishedAt: new Date(),
          durationMs: 30,
          isSuccess: true,
          statusCode: 200,
          failureCategory: null,
          assertionResults: [],
          diagnostic: null,
          correlationId: "succ-1",
        }),
      );
      await monitorRepo.update(monitor);
      const recoveringRes = await useCase.execute(incident.id.toString());
      expect(recoveringRes.status).toBe("RECOVERING");

      // Status RESOLVED
      incident.resolve(new Date());
      await incidentRepo.update(incident);
      const resolvedRes = await useCase.execute(incident.id.toString());
      expect(resolvedRes.status).toBe("RESOLVED");
    });

    it("ListIncidents executes with filters and pagination", async () => {
      const { ListIncidents } = await import(
        "../src/use-cases/incidents/list-incidents.use-case.js"
      );
      const incidentRepo = new InMemoryIncidentRepository();
      const monitorRepo = new InMemoryMonitorRepository();
      const notifRepo = new InMemoryNotificationDeliveryRepository();
      const useCase = new ListIncidents(incidentRepo, monitorRepo, notifRepo);

      const emptyRes = await useCase.execute({});
      expect(emptyRes.data).toEqual([]);
      expect(emptyRes.pagination.hasMore).toBe(false);

      const monId = new UUIDv7("01940000-0000-7000-8000-000000000302");
      const incident = new Incident({
        id: new UUIDv7("01940000-0000-7000-8000-000000000312"),
        monitorId: monId,
        startedAt: new Date(),
        causeCategory: FailureCategory.CONNECTION_TIMEOUT,
        initialErrorMessage: "Timeout",
      });
      await incidentRepo.save(incident);

      const res = await useCase.execute({ monitorId: monId.toString(), isOpen: true });
      expect(res.data.length).toBe(1);
      expect(res.data[0]?.id).toBe(incident.id.toString());
    });
  });

  describe("Metrics & Settings Use Cases — Branch Coverage", () => {
    it("GetMonitorMetricsUseCaseImpl validates input and retrieves metrics", async () => {
      const { GetMonitorMetricsUseCaseImpl } = await import(
        "../src/use-cases/metrics/get-monitor-metrics.use-case.js"
      );
      const metricsRepo = new InMemoryMetricsRepository();
      const monitorRepo = new InMemoryMonitorRepository();
      const useCase = new GetMonitorMetricsUseCaseImpl(metricsRepo, monitorRepo);

      // Invalid monitor ID
      await expect(useCase.execute({ monitorId: "not-uuid", range: "24h" })).rejects.toThrow(
        ValidationException,
      );

      // Invalid range
      await expect(
        useCase.execute({
          monitorId: "01940000-0000-7000-8000-000000000401",
          range: "1y" as unknown as "24h",
        }),
      ).rejects.toThrow(ValidationException);

      // Monitor not found
      await expect(
        useCase.execute({
          monitorId: "01940000-0000-7000-8000-000000000401",
          range: "24h",
        }),
      ).rejects.toThrow(EntityNotFoundException);

      // Success
      const monId = "01940000-0000-7000-8000-000000000401";
      const monitor = Monitor.create({
        id: new UUIDv7(monId),
        name: "Metrics Mon",
        url: new EndpointUrl("https://example.com"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        assertionRules: [],
        now: new Date(),
      });
      await monitorRepo.save(monitor);

      const metrics = await useCase.execute({ monitorId: monId, range: "24h" });
      expect(metrics.monitorId).toBe(monId);
      expect(metrics.range).toBe("24h");
    });

    it("GetTelegramSettings returns configured false vs true", async () => {
      const { GetTelegramSettings } = await import(
        "../src/use-cases/settings/get-telegram-settings.query.js"
      );
      const configRepo = new InMemoryNotificationConfigRepository();
      const useCase = new GetTelegramSettings(configRepo);

      const notConfigured = await useCase.execute();
      expect(notConfigured.configured).toBe(false);
      expect(notConfigured.chatId).toBeNull();

      await configRepo.saveTelegramConfig({
        id: "cfg-1",
        chatId: "987654",
        encryptedBotToken: "enc-tok",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const configured = await useCase.execute();
      expect(configured.configured).toBe(true);
      expect(configured.chatId).toBe("987654");
    });
  });
});
