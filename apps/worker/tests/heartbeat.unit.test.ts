import type {
  HeartbeatRepositoryPort,
  LoggerPort,
  WorkerHeartbeatData,
} from "@sentinel/application";
import { describe, expect, it, vi } from "vitest";
import { WorkerHeartbeatService } from "../src/heartbeat.js";

class MockHeartbeatRepository implements HeartbeatRepositoryPort {
  public heartbeats: WorkerHeartbeatData[] = [];

  public async upsert(heartbeat: WorkerHeartbeatData): Promise<void> {
    this.heartbeats.push(heartbeat);
  }

  public async findActive(): Promise<WorkerHeartbeatData[]> {
    return this.heartbeats;
  }

  public async deleteStale(): Promise<number> {
    return 0;
  }
}

const mockLogger: LoggerPort = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: () => mockLogger,
};

describe("WorkerHeartbeatService (P9.1)", () => {
  it("emits heartbeat and updates lastHeartbeatEpoch on tick", async () => {
    const repo = new MockHeartbeatRepository();
    const service = new WorkerHeartbeatService(repo, mockLogger, "worker-test-1", {
      getRunningJobs: () => 3,
    });

    expect(service.running).toBe(false);
    expect(service.getRunningJobs()).toBe(3);

    await service.tick();

    expect(repo.heartbeats.length).toBe(1);
    expect(repo.heartbeats[0].workerId).toBe("worker-test-1");
    expect(repo.heartbeats[0].runningJobs).toBe(3);
    expect(service.getLastHeartbeatEpoch()).toBeGreaterThan(0);
  });

  it("handles repository failure gracefully without bubbling error", async () => {
    const repo = new MockHeartbeatRepository();
    repo.upsert = vi.fn().mockRejectedValue(new Error("Database disconnected"));

    const service = new WorkerHeartbeatService(repo, mockLogger, "worker-test-fail");
    await expect(service.tick()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("starts periodic heartbeat and stops cleanly", async () => {
    const repo = new MockHeartbeatRepository();
    const service = new WorkerHeartbeatService(repo, mockLogger, "worker-test-periodic", {
      intervalSeconds: 1,
    });

    service.start();
    expect(service.running).toBe(true);

    // Initial tick executed on start
    expect(repo.heartbeats.length).toBe(1);

    await service.stop();
    expect(service.running).toBe(false);
  });
});
