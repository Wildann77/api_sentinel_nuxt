import type { MonitorResponseDto } from "@sentinel/contracts";
import { EndpointUrl, HttpMethod, Monitor, UUIDv7 } from "@sentinel/domain";
import { describe, expect, it } from "vitest";
import { toMonitorResponseDto } from "../src/mappers/index.js";
import type {
  CreateMonitorCommand,
  CreateMonitorUseCase,
} from "../src/ports/in/monitor.use-cases.js";
import {
  FakeCipher,
  FakeClock,
  FakeQueue,
  FakeUnitOfWork,
  InMemoryMonitorRepository,
  SequentialIdGenerator,
} from "../src/test-doubles/index.js";

class TestCreateMonitorUseCase implements CreateMonitorUseCase {
  constructor(
    private readonly monitorRepo: InMemoryMonitorRepository,
    private readonly clock: FakeClock,
    private readonly idGen: SequentialIdGenerator,
    private readonly cipher: FakeCipher,
    private readonly queue: FakeQueue,
    private readonly uow: FakeUnitOfWork,
  ) {}

  public async execute(command: CreateMonitorCommand): Promise<MonitorResponseDto> {
    return this.uow.runInTransaction(async (tx) => {
      const monitorIdStr = this.idGen.generate();
      const monitorId = UUIDv7.fromString(monitorIdStr);

      let encryptedHeaders = null;
      let headerKeys: string[] = [];
      if (command.request.customHeaders) {
        headerKeys = Object.keys(command.request.customHeaders);
        const headersJson = JSON.stringify(command.request.customHeaders);
        const cipherText = await this.cipher.encrypt(headersJson, `${monitorIdStr}:headers`);
        encryptedHeaders = {
          cipherText,
          keyId: "active",
          algorithm: "xchacha20poly1305_ietf" as const,
        };
      }

      const monitor = new Monitor({
        id: monitorId,
        name: command.request.name,
        url: new EndpointUrl(command.request.url),
        method: (command.request.method ?? HttpMethod.GET) as HttpMethod,
        intervalSeconds: command.request.intervalSeconds ?? 60,
        timeoutMs: command.request.timeoutMs ?? 10000,
        encryptedHeaders,
        headerKeys,
        authType: (command.request.auth?.type ?? "NONE") as
          | "NONE"
          | "BEARER"
          | "BASIC"
          | "API_KEY"
          | "CUSTOM_HEADER",
        nextRunAt: this.clock.now(),
      });

      await this.monitorRepo.save(monitor, tx);

      await this.queue.send(
        "probe:check",
        { monitorId: monitor.id.toString() },
        { singletonKey: monitor.id.toString(), db: tx },
      );

      return toMonitorResponseDto(monitor);
    });
  }
}

describe("P3.4 DoD Gate — Use Case execution with Test Doubles", () => {
  it("executes CreateMonitorUseCase using in-memory test doubles inside a transaction", async () => {
    const monitorRepo = new InMemoryMonitorRepository();
    const clock = new FakeClock("2026-10-23T12:00:00.000Z");
    const idGen = new SequentialIdGenerator();
    const cipher = new FakeCipher();
    const queue = new FakeQueue();
    const uow = new FakeUnitOfWork();

    const useCase = new TestCreateMonitorUseCase(monitorRepo, clock, idGen, cipher, queue, uow);

    const dto = await useCase.execute({
      request: {
        name: "Payments Service",
        url: "https://pay.example.com/health",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 5000,
        assertions: [],
        customHeaders: {
          "X-Api-Key": "secret-super-key",
        },
      },
    });

    expect(dto.id).toBe("018f0000-0000-7000-8000-000000000001");
    expect(dto.name).toBe("Payments Service");
    expect(dto.headerKeys).toEqual(["X-Api-Key"]);
    expect(dto.nextRunAt).toBe("2026-10-23T12:00:00.000Z");

    // Assert that no secret leaked into the DTO
    expect(dto).not.toHaveProperty("encryptedHeaders");
    expect(JSON.stringify(dto)).not.toContain("secret-super-key");

    // Assert repository and queue received the data
    const saved = await monitorRepo.findById(dto.id);
    expect(saved).not.toBeNull();
    expect(saved?.encryptedHeaders).not.toBeNull();

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]?.payload).toEqual({ monitorId: dto.id });
    expect(queue.jobs[0]?.options?.singletonKey).toBe(dto.id);

    // Assert unit of work committed
    expect(uow.committedCount).toBe(1);
    expect(uow.rolledBackCount).toBe(0);
  });
});
