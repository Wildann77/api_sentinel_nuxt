import { ConflictException, EntityNotFoundException, ValidationException } from "@sentinel/domain";
import { beforeEach, describe, expect, it } from "vitest";
import {
  FakeCipher,
  FakeClock,
  FakeQueue,
  InMemoryMonitorRepository,
  SequentialIdGenerator,
} from "../src/test-doubles/index.js";
import {
  CreateMonitor,
  DeleteMonitor,
  PauseMonitor,
  ResumeMonitor,
  UpdateMonitor,
} from "../src/use-cases/monitors/index.js";

describe("Fase 8 — Monitor Use Cases Unit Tests", () => {
  let monitorRepo: InMemoryMonitorRepository;
  let cipher: FakeCipher;
  let clock: FakeClock;
  let idGen: SequentialIdGenerator;
  let queue: FakeQueue;

  let createMonitor: CreateMonitor;
  let updateMonitor: UpdateMonitor;
  let pauseMonitor: PauseMonitor;
  let resumeMonitor: ResumeMonitor;
  let deleteMonitor: DeleteMonitor;

  beforeEach(() => {
    monitorRepo = new InMemoryMonitorRepository();
    cipher = new FakeCipher();
    clock = new FakeClock(new Date("2026-10-24T10:00:00.000Z"));
    idGen = new SequentialIdGenerator();
    queue = new FakeQueue();

    createMonitor = new CreateMonitor(monitorRepo, cipher, clock, idGen);
    updateMonitor = new UpdateMonitor(monitorRepo, cipher, clock);
    pauseMonitor = new PauseMonitor(monitorRepo, queue);
    resumeMonitor = new ResumeMonitor(monitorRepo, clock);
    deleteMonitor = new DeleteMonitor(monitorRepo, queue);
  });

  describe("P8.1 — CreateMonitor", () => {
    it("creates active monitor with UNKNOWN health status and computed nextRunAt", async () => {
      const result = await createMonitor.execute({
        name: "Production Gateway",
        url: "https://api.example.com/health",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 5000,
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe("Production Gateway");
      expect(result.url).toBe("https://api.example.com/health");
      expect(result.method).toBe("GET");
      expect(result.isActive).toBe(true);
      expect(result.healthStatus).toBe("UNKNOWN");
      expect(result.version).toBe(1);
      expect(result.nextRunAt).toBe("2026-10-24T10:01:00.000Z");

      const saved = await monitorRepo.findById(result.id);
      expect(saved).not.toBeNull();
      expect(saved?.isActive).toBe(true);
      expect(saved?.healthStatus).toBe("UNKNOWN");
    });

    it("encrypts customHeaders, body, and authConfig with contextual AAD and populates headerKeys", async () => {
      const result = await createMonitor.execute({
        name: "Authenticated Ingestion",
        url: "https://api.example.com/v1/events",
        method: "POST",
        customHeaders: {
          "X-Api-Version": "2026-01",
          "X-Tenant-Id": "tenant-42",
        },
        body: '{"event":"user_login"}',
        auth: {
          type: "BEARER",
          token: "secret-token-12345",
        },
        intervalSeconds: 120,
      });

      expect(result.headerKeys).toEqual(["X-Api-Version", "X-Tenant-Id"]);
      expect(result.authType).toBe("BEARER");

      const saved = await monitorRepo.findById(result.id);
      expect(saved).not.toBeNull();
      expect(saved?.encryptedHeaders).not.toBeNull();
      expect(saved?.encryptedBody).not.toBeNull();
      expect(saved?.encryptedAuthConfig).not.toBeNull();

      // Verify AAD format in fake cipher encryption history
      const monitorIdStr = saved?.id.toString();
      const cipherEncryptions = cipher.encryptions;
      expect(
        cipherEncryptions.some((e) => e.aad === `monitorId:${monitorIdStr}:field:headers`),
      ).toBe(true);
      expect(cipherEncryptions.some((e) => e.aad === `monitorId:${monitorIdStr}:field:body`)).toBe(
        true,
      );
      expect(
        cipherEncryptions.some((e) => e.aad === `monitorId:${monitorIdStr}:field:authConfig`),
      ).toBe(true);
    });

    it("rejects name longer than 100 characters", async () => {
      const longName = "A".repeat(101);
      expect(
        createMonitor.execute({
          name: longName,
          url: "https://api.example.com/health",
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("rejects URL with SSRF blocked targets (localhost, private IP literals, userinfo)", async () => {
      // Localhost
      await expect(
        createMonitor.execute({
          name: "SSRF Localhost",
          url: "http://localhost:8080/test",
        }),
      ).rejects.toThrow(ValidationException);

      await expect(
        createMonitor.execute({
          name: "SSRF Dot Localhost",
          url: "http://sub.localhost/test",
        }),
      ).rejects.toThrow(ValidationException);

      // Private IPv4 literals
      await expect(
        createMonitor.execute({
          name: "SSRF Loopback IP",
          url: "http://127.0.0.1:3000/api",
        }),
      ).rejects.toThrow(ValidationException);

      await expect(
        createMonitor.execute({
          name: "SSRF RFC1918 10/8",
          url: "http://10.0.0.5:8080/metrics",
        }),
      ).rejects.toThrow(ValidationException);

      await expect(
        createMonitor.execute({
          name: "SSRF AWS IMDS",
          url: "http://169.254.169.254/latest/meta-data",
        }),
      ).rejects.toThrow(ValidationException);

      // Userinfo
      await expect(
        createMonitor.execute({
          name: "SSRF Userinfo",
          url: "http://admin:pass@api.example.com",
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("rejects forbidden hop-by-hop headers in customHeaders (Header Deny-List)", async () => {
      await expect(
        createMonitor.execute({
          name: "Forbidden Host Header",
          url: "https://api.example.com/test",
          customHeaders: {
            Host: "evil.corp",
          },
        }),
      ).rejects.toThrow(ValidationException);

      await expect(
        createMonitor.execute({
          name: "Forbidden Connection Header",
          url: "https://api.example.com/test",
          customHeaders: {
            connection: "close",
          },
        }),
      ).rejects.toThrow(ValidationException);

      await expect(
        createMonitor.execute({
          name: "Forbidden Transfer-Encoding Header",
          url: "https://api.example.com/test",
          customHeaders: {
            "transfer-encoding": "chunked",
          },
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("rejects more than 10 assertions", async () => {
      const assertions = Array.from({ length: 11 }, (_, i) => ({
        type: "status" as const,
        operator: "equals" as const,
        expected: 200 + i,
      }));

      await expect(
        createMonitor.execute({
          name: "Too Many Assertions",
          url: "https://api.example.com/health",
          assertions,
        }),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("P8.1 — UpdateMonitor", () => {
    it("updates monitor and increments version", async () => {
      const created = await createMonitor.execute({
        name: "Original Name",
        url: "https://api.example.com/v1",
        intervalSeconds: 60,
      });

      const updated = await updateMonitor.execute({
        id: created.id,
        name: "Updated Name",
        version: 1,
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.version).toBe(2);

      const saved = await monitorRepo.findById(created.id);
      expect(saved?.name).toBe("Updated Name");
      expect(saved?.version).toBe(2);
    });

    it("enforces OCC version conflict: throws ConflictException (409) on stale client version", async () => {
      const created = await createMonitor.execute({
        name: "Concurrent Test",
        url: "https://api.example.com/v1",
      });

      // First update increments version to 2
      await updateMonitor.execute({
        id: created.id,
        name: "First Mutation",
        version: 1,
      });

      // Second update still passes stale version 1
      await expect(
        updateMonitor.execute({
          id: created.id,
          name: "Stale Mutation",
          version: 1,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("preserves existing encrypted secrets when masked placeholder is submitted", async () => {
      const created = await createMonitor.execute({
        name: "Secret Monitor",
        url: "https://api.example.com/secure",
        auth: {
          type: "BEARER",
          token: "original-super-secret-token",
        },
        body: '{"pin":"1234"}',
      });

      const savedBefore = await monitorRepo.findById(created.id);
      const originalAuthCipher = savedBefore?.encryptedAuthConfig?.value;
      const originalBodyCipher = savedBefore?.encryptedBody?.value;

      // Update with masked placeholder token (••••••••)
      const updated = await updateMonitor.execute({
        id: created.id,
        name: "Updated Secret Monitor",
        auth: {
          type: "BEARER",
          token: "••••••••",
        },
        body: "••••••••",
        version: 1,
      });

      expect(updated.name).toBe("Updated Secret Monitor");
      const savedAfter = await monitorRepo.findById(created.id);
      expect(savedAfter?.encryptedAuthConfig?.value).toBe(originalAuthCipher);
      expect(savedAfter?.encryptedBody?.value).toBe(originalBodyCipher);
    });

    it("re-encrypts secret when new plaintext value is submitted", async () => {
      const created = await createMonitor.execute({
        name: "Secret Rotate",
        url: "https://api.example.com/secure",
        auth: {
          type: "BEARER",
          token: "initial-token",
        },
      });

      const savedBefore = await monitorRepo.findById(created.id);
      const initialAuthCipher = savedBefore?.encryptedAuthConfig?.value;

      // Update with genuinely new secret
      await updateMonitor.execute({
        id: created.id,
        auth: {
          type: "BEARER",
          token: "brand-new-rotated-token",
        },
        version: 1,
      });

      const savedAfter = await monitorRepo.findById(created.id);
      expect(savedAfter?.encryptedAuthConfig?.value).not.toBe(initialAuthCipher);
    });

    it("throws EntityNotFoundException (404) if monitor does not exist", async () => {
      await expect(
        updateMonitor.execute({
          id: "01940000-0000-7000-8000-000000000001",
          name: "Non-existent",
        }),
      ).rejects.toThrow(EntityNotFoundException);
    });
  });

  describe("P8.2 — Pause, Resume, Delete", () => {
    it("PauseMonitor sets PAUSED, isActive = false, and cancels scheduled job in pg-boss queue", async () => {
      const created = await createMonitor.execute({
        name: "Monitor To Pause",
        url: "https://api.example.com/check",
      });

      // Simulate a scheduled job in queue
      await queue.send("probe:check", { monitorId: created.id }, { singletonKey: created.id });
      expect(queue.jobs.length).toBe(1);

      const paused = await pauseMonitor.execute(created.id);
      expect(paused.isActive).toBe(false);
      expect(paused.healthStatus).toBe("PAUSED");

      // Verify job was cancelled in queue
      expect(queue.jobs.length).toBe(0);

      const saved = await monitorRepo.findById(created.id);
      expect(saved?.isActive).toBe(false);
      expect(saved?.healthStatus).toBe("PAUSED");
    });

    it("ResumeMonitor sets isActive = true, UNKNOWN, and resets nextRunAt to now", async () => {
      const created = await createMonitor.execute({
        name: "Monitor To Resume",
        url: "https://api.example.com/check",
      });

      await pauseMonitor.execute(created.id);

      // Advance clock by 10 minutes
      clock.advance(10 * 60 * 1000);
      const currentTimeIso = clock.now().toISOString();

      const resumed = await resumeMonitor.execute(created.id);
      expect(resumed.isActive).toBe(true);
      expect(resumed.healthStatus).toBe("UNKNOWN");
      expect(resumed.nextRunAt).toBe(currentTimeIso);

      const saved = await monitorRepo.findById(created.id);
      expect(saved?.isActive).toBe(true);
      expect(saved?.healthStatus).toBe("UNKNOWN");
      expect(saved?.nextRunAt.toISOString()).toBe(currentTimeIso);
    });

    it("DeleteMonitor deletes monitor and cancels any pending pg-boss jobs (D-17)", async () => {
      const created = await createMonitor.execute({
        name: "Monitor To Delete",
        url: "https://api.example.com/check",
      });

      await queue.send("probe:check", { monitorId: created.id }, { singletonKey: created.id });
      expect(queue.jobs.length).toBe(1);

      await deleteMonitor.execute(created.id);

      // Queue job cancelled
      expect(queue.jobs.length).toBe(0);

      // Monitor removed from repository
      const saved = await monitorRepo.findById(created.id);
      expect(saved).toBeNull();
    });

    it("throws EntityNotFoundException (404) on pause, resume, or delete for missing monitor", async () => {
      const missingId = "01940000-0000-7000-8000-000000000099";
      await expect(pauseMonitor.execute(missingId)).rejects.toThrow(EntityNotFoundException);
      await expect(resumeMonitor.execute(missingId)).rejects.toThrow(EntityNotFoundException);
      await expect(deleteMonitor.execute(missingId)).rejects.toThrow(EntityNotFoundException);
    });
  });
});
