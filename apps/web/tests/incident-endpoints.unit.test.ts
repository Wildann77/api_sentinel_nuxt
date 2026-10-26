import {
  EntityNotFoundException,
  FailureCategory,
  HealthStatus,
  HttpMethod,
  Incident,
  Monitor,
  UUIDv7,
  ValidationException,
} from "@sentinel/domain";
import type { H3Event } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import getIncidentHandler from "../server/api/incidents/[id].get.js";
import listIncidentsHandler from "../server/api/incidents/index.get.js";
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

describe("Incident Endpoints (P10.1)", () => {
  const monitorId = "018f0000-0000-7000-8000-000000000001";
  const incidentId = "018f0000-0000-7000-8000-000000000010";

  beforeEach(async () => {
    await resetContainer();
    const container = getContainer(TEST_ENV);

    // Mock findWithFilter, findById on repositories
    vi.spyOn(container.incidentRepository, "findWithFilter").mockResolvedValue({
      items: [
        new Incident({
          id: UUIDv7.fromString(incidentId),
          monitorId: UUIDv7.fromString(monitorId),
          causeCategory: FailureCategory.HTTP_STATUS_MISMATCH,
          initialErrorMessage: "Expected 200, received 503",
          startedAt: new Date("2026-10-24T05:00:00Z"),
          isResolved: false,
          failureCount: 3,
        }),
      ],
      nextCursor: undefined,
    });

    vi.spyOn(container.incidentRepository, "findById").mockImplementation(async (id) => {
      if (id.toString() === incidentId) {
        return new Incident({
          id: UUIDv7.fromString(incidentId),
          monitorId: UUIDv7.fromString(monitorId),
          causeCategory: FailureCategory.HTTP_STATUS_MISMATCH,
          initialErrorMessage: "Expected 200, received 503",
          startedAt: new Date("2026-10-24T05:00:00Z"),
          isResolved: false,
          failureCount: 3,
        });
      }
      return null;
    });

    vi.spyOn(container.monitorRepository, "findById").mockResolvedValue(
      new Monitor({
        id: UUIDv7.fromString(monitorId),
        name: "Order Processing Service",
        url: "https://orders.service.internal/health",
        method: HttpMethod.GET,
        assertionRules: [],
        consecutiveFailures: 3,
        consecutiveSuccesses: 1, // Will evaluate to RECOVERING
        healthStatus: HealthStatus.DOWN,
        isActive: true,
        intervalSeconds: 60,
        timeoutMs: 5000,
        currentIncidentId: UUIDv7.fromString(incidentId),
        createdAt: new Date("2026-10-24T00:00:00Z"),
        updatedAt: new Date("2026-10-24T00:00:00Z"),
      }),
    );

    vi.spyOn(container.notificationDeliveryRepository, "findByIncidentId").mockResolvedValue([
      {
        id: "deliv-101",
        incidentId,
        channel: "TELEGRAM",
        status: "SENT",
        attemptCount: 1,
        lastAttemptAt: new Date("2026-10-24T05:00:05Z"),
        lastError: null,
        createdAt: new Date("2026-10-24T05:00:01Z"),
      },
    ]);

    vi.spyOn(container.checkResultRepository, "findByIncidentId").mockResolvedValue([]);
  });

  describe("GET /api/incidents", () => {
    it("returns paginated incidents with derived status and monitorName", async () => {
      const event = createMockEvent({
        method: "GET",
        path: "/api/incidents",
        query: { isOpen: "true", limit: "20" },
      });

      const response = await listIncidentsHandler(event);

      expect(response.data).toHaveLength(1);
      expect(response.data[0]?.id).toBe(incidentId);
      expect(response.data[0]?.monitorName).toBe("Order Processing Service");
      expect(response.data[0]?.status).toBe("RECOVERING");
      expect(response.data[0]?.notificationDeliveries).toHaveLength(1);
      expect(response.pagination.limit).toBe(20);
      expect(response.pagination.hasMore).toBe(false);
    });

    it("throws ValidationException when query params are invalid", async () => {
      const event = createMockEvent({
        method: "GET",
        path: "/api/incidents",
        query: { limit: "not-a-number" },
      });

      await expect(listIncidentsHandler(event)).rejects.toThrow(ValidationException);
    });
  });

  describe("GET /api/incidents/:id", () => {
    it("returns incident details when found", async () => {
      const event = createMockEvent({
        method: "GET",
        path: `/api/incidents/${incidentId}`,
        params: { id: incidentId },
      });

      const response = await getIncidentHandler(event);

      expect(response.id).toBe(incidentId);
      expect(response.monitorName).toBe("Order Processing Service");
      expect(response.status).toBe("RECOVERING");
      expect(response.notificationDeliveries).toHaveLength(1);
    });

    it("throws EntityNotFoundException when incident does not exist", async () => {
      const event = createMockEvent({
        method: "GET",
        path: "/api/incidents/018f0000-0000-7000-8000-999999999999",
        params: { id: "018f0000-0000-7000-8000-999999999999" },
      });

      await expect(getIncidentHandler(event)).rejects.toThrow(EntityNotFoundException);
    });

    it("throws ValidationException when ID param is missing", async () => {
      const event = createMockEvent({
        method: "GET",
        path: "/api/incidents/",
        params: {},
      });

      await expect(getIncidentHandler(event)).rejects.toThrow(ValidationException);
    });
  });
});
