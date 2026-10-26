import { EnvValidationError } from "@sentinel/infra";
import { afterEach, describe, expect, it } from "vitest";
import { buildWebContainer, getContainer, resetContainer } from "../server/utils/container.js";

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

describe("P7.2 — Web Composition Root Container", () => {
  afterEach(async () => {
    await resetContainer();
  });

  it("throws EnvValidationError on boot if required environment variables are missing", () => {
    expect(() => buildWebContainer({ ...VALID_ENV, DATABASE_URL: "invalid-url" })).toThrow(
      EnvValidationError,
    );
    expect(() => buildWebContainer({ ...VALID_ENV, SESSION_SECRET: "short" })).toThrow(
      EnvValidationError,
    );
  });

  it("builds WebContainer with all adapters, repositories, and use cases instantiated", async () => {
    const container = buildWebContainer(VALID_ENV);

    expect(container.env.PORT).toBe(3000);
    expect(container.db).toBeDefined();
    expect(container.pool).toBeDefined();
    expect(container.logger).toBeDefined();
    expect(container.clock).toBeDefined();
    expect(container.idGenerator).toBeDefined();
    expect(container.cipher).toBeDefined();
    expect(container.passwordHasher).toBeDefined();
    expect(container.rateLimiter).toBeDefined();
    expect(container.unitOfWork).toBeDefined();
    expect(container.pubSub).toBeDefined();

    // Repositories
    expect(container.userRepository).toBeDefined();
    expect(container.sessionRepository).toBeDefined();
    expect(container.monitorRepository).toBeDefined();
    expect(container.checkResultRepository).toBeDefined();
    expect(container.incidentRepository).toBeDefined();
    expect(container.metricsRepository).toBeDefined();
    expect(container.notificationConfigRepository).toBeDefined();
    expect(container.notificationDeliveryRepository).toBeDefined();
    expect(container.heartbeatRepository).toBeDefined();

    // Use cases
    expect(container.authenticateUserUseCase).toBeDefined();
    expect(container.validateSessionUseCase).toBeDefined();
    expect(container.revokeSessionUseCase).toBeDefined();
    expect(container.changeOwnerPasswordUseCase).toBeDefined();
    expect(container.createMonitorUseCase).toBeDefined();
    expect(container.updateMonitorUseCase).toBeDefined();
    expect(container.deleteMonitorUseCase).toBeDefined();
    expect(container.pauseMonitorUseCase).toBeDefined();
    expect(container.resumeMonitorUseCase).toBeDefined();
    expect(container.getMonitorUseCase).toBeDefined();
    expect(container.listMonitorsUseCase).toBeDefined();

    await container.dispose();
  });

  it("returns singleton instance on subsequent getContainer() calls and disposes cleanly", async () => {
    const c1 = getContainer(VALID_ENV);
    const c2 = getContainer(VALID_ENV);

    expect(c1).toBe(c2);

    await resetContainer();
  });
});
