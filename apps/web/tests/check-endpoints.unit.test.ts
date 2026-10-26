import {
  CheckResult,
  EntityNotFoundException,
  FailureCategory,
  HttpMethod,
  Monitor,
  UUIDv7,
  ValidationException,
} from "@sentinel/domain";
import type { H3Event } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import getCheckDetailHandler from "../server/api/checks/[id].get.js";
import getRecentChecksHandler from "../server/api/checks/recent.get.js";
import listMonitorChecksHandler from "../server/api/monitors/[id]/checks.get.js";
import { getContainer, resetContainer } from "../server/utils/container.js";

interface MockEventOverrides {
  method?: string;
  path?: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  remoteAddress?: string;
  context?: Record<string, unknown>;
  body?: unknown;
}

function createMockEvent(overrides: MockEventOverrides = {}): H3Event {
  const headers: Record<string, string> = {
    host: "localhost:3000",
    ...(overrides.headers || {}),
  };
  const responseHeaders: Record<string, string | string[]> = {};
  const statusCode = 200;

  return {
    method: overrides.method || "GET",
    path: overrides.path || "/",
    node: {
      req: {
        method: overrides.method || "GET",
        url: overrides.path || "/",
        headers,
        socket: {
          remoteAddress: overrides.remoteAddress || "127.0.0.1",
        },
      },
      res: {
        statusCode,
        setHeader: (name: string, value: string | string[]) => {
          responseHeaders[name.toLowerCase()] = value;
        },
        getHeader: (name: string) => responseHeaders[name.toLowerCase()],
        headersSent: false,
      },
    },
    context: {
      params: overrides.params,
      ...(overrides.context || {}),
    },
    _body: overrides.body,
    _query: overrides.query,
  } as unknown as H3Event;
}

vi.mock("h3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("h3")>();
  return {
    ...actual,
    readBody: vi.fn(async (event: unknown) => (event as { _body?: unknown })?._body),
    getQuery: vi.fn((event: unknown) => (event as { _query?: unknown })?._query || {}),
    getRouterParam: vi.fn((event: unknown, paramName: string) => {
      const e = event as { context?: { params?: Record<string, string> } };
      return e.context?.params?.[paramName];
    }),
  };
});

const VALID_KEYRING = JSON.stringify({
  activeKeyId: "key-1",
  keys: {
    "key-1": Buffer.alloc(32, 1).toString("base64"),
  },
});

const TEST_ENV = {
  NODE_ENV: "test",
  PORT: "3000",
  WORKER_PORT: "3001",
  DATABASE_URL: "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel",
  APP_KEYRING: VALID_KEYRING,
  SESSION_SECRET: "a-very-long-and-secure-session-secret-key-32chars",
  LOG_LEVEL: "info",
};

describe("Check Endpoints Suite (P11.1)", () => {
  const monitorId = "018f0000-0000-7000-8000-000000000001";
  const checkId = "018f0000-0000-7000-8000-000000000002";

  beforeEach(async () => {
    await resetContainer();
    const container = getContainer(TEST_ENV);

    vi.spyOn(container.monitorRepository, "findById").mockImplementation(async (id) => {
      if (id.toString() === monitorId) {
        return new Monitor({
          id: UUIDv7.fromString(monitorId),
          name: "Payment Gateway",
          url: "https://api.payment.internal/health",
          method: HttpMethod.GET,
          intervalSeconds: 60,
          timeoutMs: 5000,
          isActive: true,
          createdAt: new Date("2026-10-24T00:00:00Z"),
          updatedAt: new Date("2026-10-24T00:00:00Z"),
        });
      }
      return null;
    });

    vi.spyOn(container.checkResultRepository, "findByMonitorId").mockResolvedValue([
      new CheckResult({
        id: UUIDv7.fromString(checkId),
        monitorId: UUIDv7.fromString(monitorId),
        incidentId: null,
        triggerType: "MANUAL",
        scheduledFor: null,
        startedAt: new Date("2026-10-24T10:00:00Z"),
        finishedAt: new Date("2026-10-24T10:00:00.120Z"),
        durationMs: 120,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
        assertionResults: [],
        correlationId: "corr-123",
        pinnedIp: "104.26.10.1",
      }),
    ]);

    vi.spyOn(container.checkResultRepository, "findById").mockImplementation(async (id) => {
      if (id.toString() === checkId) {
        return new CheckResult({
          id: UUIDv7.fromString(checkId),
          monitorId: UUIDv7.fromString(monitorId),
          incidentId: null,
          triggerType: "SCHEDULED",
          scheduledFor: new Date("2026-10-24T10:00:00Z"),
          startedAt: new Date("2026-10-24T10:00:00Z"),
          finishedAt: new Date("2026-10-24T10:00:00.250Z"),
          durationMs: 250,
          isSuccess: false,
          statusCode: 502,
          failureCategory: FailureCategory.HTTP_STATUS_MISMATCH,
          diagnostic: "Bad Gateway from upstream",
          correlationId: "corr-detail",
          pinnedIp: "198.51.100.5",
          assertionResults: [
            {
              ruleType: "STATUS_CODE",
              target: "statusCode",
              operator: "EQUALS",
              expected: 200,
              actual: 502,
              status: "FAIL",
              message: "Expected 200, got 502",
            },
          ],
        });
      }
      return null;
    });

    vi.spyOn(container.checkResultRepository, "findRecent").mockResolvedValue([
      new CheckResult({
        id: UUIDv7.fromString(checkId),
        monitorId: UUIDv7.fromString(monitorId),
        incidentId: null,
        triggerType: "SCHEDULED",
        scheduledFor: new Date("2026-10-24T10:00:00Z"),
        startedAt: new Date("2026-10-24T10:00:00Z"),
        finishedAt: new Date("2026-10-24T10:00:00.080Z"),
        durationMs: 80,
        isSuccess: true,
        statusCode: 200,
        failureCategory: null,
        assertionResults: [],
        correlationId: "corr-recent",
        pinnedIp: "104.26.10.1",
      }),
    ]);
  });

  describe("GET /api/monitors/:id/checks", () => {
    it("returns paginated checks with MANUAL badge and cursor metadata", async () => {
      const event = createMockEvent({
        params: { id: monitorId },
        query: { limit: "20" },
      });

      const response = await listMonitorChecksHandler(event);

      expect(response.data).toHaveLength(1);
      expect(response.data[0]?.id).toBe(checkId);
      expect(response.data[0]?.triggerType).toBe("MANUAL");
      expect(response.pagination.limit).toBe(20);
      expect(response.pagination.hasMore).toBe(false);
    });

    it("throws ValidationException when monitor ID is missing or invalid", async () => {
      const event = createMockEvent({
        params: { id: "not-uuid" },
      });

      await expect(listMonitorChecksHandler(event)).rejects.toThrow(ValidationException);
    });

    it("throws EntityNotFoundException when monitor does not exist", async () => {
      const nonExistent = "018f0000-0000-7000-8000-000000000099";
      const event = createMockEvent({
        params: { id: nonExistent },
      });

      await expect(listMonitorChecksHandler(event)).rejects.toThrow(EntityNotFoundException);
    });
  });

  describe("GET /api/checks/:id", () => {
    it("returns sanitized inspection drawer detail", async () => {
      const event = createMockEvent({
        params: { id: checkId },
      });

      const response = await getCheckDetailHandler(event);

      expect(response.id).toBe(checkId);
      expect(response.status).toBe("DOWN");
      expect(response.statusCode).toBe(502);
      expect(response.failureCategory).toBe("HTTP_STATUS_MISMATCH");
      expect(response.diagnostics.pinnedIp).toBe("198.51.100.5");
      expect(response.diagnostics.assertionResults).toHaveLength(1);
      expect(response.diagnostics.assertionResults[0]?.passed).toBe(false);
    });

    it("throws EntityNotFoundException when check id is unknown", async () => {
      const event = createMockEvent({
        params: { id: "018f0000-0000-7000-8000-000000000099" },
      });

      await expect(getCheckDetailHandler(event)).rejects.toThrow(EntityNotFoundException);
    });
  });

  describe("GET /api/checks/recent", () => {
    it("returns recent checks feed conforming to D-19", async () => {
      const event = createMockEvent({
        query: { limit: "10" },
      });

      const response = await getRecentChecksHandler(event);

      expect(response.data).toHaveLength(1);
      expect(response.data[0]?.id).toBe(checkId);
      expect(response.data[0]?.status).toBe("UP");
      expect(response.data[0]?.latencyMs).toBe(80);
    });
  });
});
