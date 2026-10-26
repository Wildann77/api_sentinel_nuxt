import { EnvValidationError } from "@sentinel/infra";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildWorkerContainer,
  getWorkerContainer,
  resetWorkerContainer,
} from "../src/container.js";

const VALID_KEYRING = JSON.stringify({
  activeKeyId: "key-1",
  keys: {
    "key-1": Buffer.alloc(32, 1).toString("base64"),
  },
});

const VALID_ENV = {
  NODE_ENV: "test",
  PORT: "3000",
  WORKER_PORT: "3001",
  DATABASE_URL: "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel",
  APP_KEYRING: VALID_KEYRING,
  SESSION_SECRET: "a-very-long-and-secure-session-secret-key-32chars",
  LOG_LEVEL: "info",
};

describe("WorkerContainer (P9.1)", () => {
  afterEach(async () => {
    await resetWorkerContainer();
  });

  it("fails fast with EnvValidationError when required env is invalid", () => {
    expect(() => buildWorkerContainer({ ...VALID_ENV, DATABASE_URL: "not-a-valid-url" })).toThrow(
      EnvValidationError,
    );
  });

  it("builds WorkerContainer with all required adapters, repositories, and services", async () => {
    const container = buildWorkerContainer(VALID_ENV, { workerId: "test-worker-01" });

    expect(container.workerId).toBe("test-worker-01");
    expect(container.env.WORKER_PORT).toBe(3001);
    expect(container.pool).toBeDefined();
    expect(container.db).toBeDefined();
    expect(container.logger).toBeDefined();
    expect(container.clock).toBeDefined();
    expect(container.idGenerator).toBeDefined();
    expect(container.cipher).toBeDefined();
    expect(container.unitOfWork).toBeDefined();
    expect(container.boss).toBeDefined();
    expect(container.queuePort).toBeDefined();

    // Repositories
    expect(container.monitorRepository).toBeDefined();
    expect(container.checkResultRepository).toBeDefined();
    expect(container.incidentRepository).toBeDefined();
    expect(container.metricsRepository).toBeDefined();
    expect(container.notificationConfigRepository).toBeDefined();
    expect(container.notificationDeliveryRepository).toBeDefined();
    expect(container.heartbeatRepository).toBeDefined();

    // Services
    expect(container.heartbeatService).toBeDefined();
    expect(container.scheduler).toBeDefined();
    expect(container.httpServer).toBeDefined();
    expect(container.networkProbe).toBeDefined();
    expect(container.executeScheduledCheckUseCase).toBeDefined();
    expect(container.dispatchNotificationUseCase).toBeDefined();
    expect(container.probeCheckJobHandler).toBeDefined();
    expect(container.notificationJobHandler).toBeDefined();
    expect(container.notificationPort).toBeDefined();
    expect(typeof container.getJobLagSeconds()).toBe("number");
    expect(container.isInitialized).toBe(false);

    await container.dispose();
  });

  it("uses WORKER_ID from environment if provided", async () => {
    const container = buildWorkerContainer({
      ...VALID_ENV,
      WORKER_ID: "custom-env-worker-id",
    });

    expect(container.workerId).toBe("custom-env-worker-id");
    await container.dispose();
  });

  it("falls back to worker-<hostname>-<pid> format when WORKER_ID is not specified", async () => {
    const container = buildWorkerContainer(VALID_ENV);

    expect(container.workerId).toMatch(/^worker-.+-\d+$/);
    await container.dispose();
  });

  it("returns singleton instance on getWorkerContainer and resets cleanly", async () => {
    const c1 = getWorkerContainer(VALID_ENV);
    const c2 = getWorkerContainer(VALID_ENV);

    expect(c1).toBe(c2);

    await resetWorkerContainer();
  });
});
