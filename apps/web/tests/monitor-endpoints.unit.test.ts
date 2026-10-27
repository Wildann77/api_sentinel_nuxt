import {
  ConflictException,
  EndpointUrl,
  EntityNotFoundException,
  HttpMethod,
  InvalidCredentialsException,
  Monitor,
  UUIDv7,
  ValidationException,
} from "@sentinel/domain";
import type { H3Event } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import checkMonitorHandler from "../server/api/monitors/[id]/check.post.js";
import deleteMonitorHandler from "../server/api/monitors/[id]/index.delete.js";
import getMonitorHandler from "../server/api/monitors/[id]/index.get.js";
import patchMonitorHandler from "../server/api/monitors/[id]/index.patch.js";
import pauseMonitorHandler from "../server/api/monitors/[id]/pause.post.js";
import resumeMonitorHandler from "../server/api/monitors/[id]/resume.post.js";
import listMonitorsHandler from "../server/api/monitors/index.get.js";
import createMonitorHandler from "../server/api/monitors/index.post.js";
import testMonitorConfigHandler from "../server/api/monitors/test.post.js";
import authSessionMiddleware from "../server/middleware/04.auth-session.js";
import { getContainer } from "../server/utils/container.js";

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
    setResponseStatus: vi.fn((event: unknown, code: number) => {
      const e = event as { node?: { res?: { statusCode?: number } } };
      if (e.node?.res) {
        e.node.res.statusCode = code;
      }
    }),
  };
});

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

describe("P8.3, P8.4, P8.5 — Monitor Endpoints & Slice Suite", () => {
  beforeEach(() => {
    getContainer(VALID_ENV);
    vi.restoreAllMocks();
  });

  describe("P8.5 — Penolakan Tanpa Autentikasi (401)", () => {
    const endpoints = [
      { method: "GET", path: "/api/monitors" },
      { method: "POST", path: "/api/monitors" },
      { method: "GET", path: "/api/monitors/0192e21b-8a21-7000-8b1a-98df76123456" },
      { method: "PATCH", path: "/api/monitors/0192e21b-8a21-7000-8b1a-98df76123456" },
      { method: "DELETE", path: "/api/monitors/0192e21b-8a21-7000-8b1a-98df76123456" },
      { method: "POST", path: "/api/monitors/0192e21b-8a21-7000-8b1a-98df76123456/pause" },
      { method: "POST", path: "/api/monitors/0192e21b-8a21-7000-8b1a-98df76123456/resume" },
    ];

    for (const ep of endpoints) {
      it(`blocks unauthenticated request to ${ep.method} ${ep.path}`, async () => {
        const event = createMockEvent({ method: ep.method, path: ep.path });
        await expect(authSessionMiddleware(event)).rejects.toThrow(InvalidCredentialsException);
      });
    }
  });

  describe("P8.3 — Query Monitor (GET /api/monitors & GET /api/monitors/:id)", () => {
    it("returns envelope with pagination and 20-point sparkline for GET /api/monitors", async () => {
      const container = getContainer();
      const mockResult = {
        items: [
          {
            id: "0192e21b-8a21-7000-8b1a-98df76123456",
            name: "Main API Gateway",
            url: "https://api.example.com/health",
            method: "GET" as const,
            intervalSeconds: 60,
            timeoutMs: 10000,
            isActive: true,
            healthStatus: "UP" as const,
            version: 1,
            headerKeys: ["x-api-key"],
            authType: "API_KEY" as const,
            consecutiveSuccesses: 10,
            failureCount: 0,
            currentIncidentId: null,
            lastCheckedAt: "2026-10-24T10:00:00.000Z",
            nextRunAt: "2026-10-24T10:01:00.000Z",
            sparkline: [
              { durationMs: 120, timestamp: "2026-10-24T09:59:00.000Z" },
              { durationMs: 115, timestamp: "2026-10-24T10:00:00.000Z" },
            ],
            createdAt: "2026-10-24T09:00:00.000Z",
            updatedAt: "2026-10-24T09:00:00.000Z",
          },
        ],
        limit: 50,
        hasMore: false,
        nextCursor: undefined,
      };

      vi.spyOn(container.listMonitorsUseCase, "execute").mockResolvedValue(mockResult);

      const event = createMockEvent({
        method: "GET",
        path: "/api/monitors",
        query: { status: "UP", search: "Gateway", limit: "50" },
      });

      const response = await listMonitorsHandler(event);

      expect(response.data).toHaveLength(1);
      expect(response.data[0]?.name).toBe("Main API Gateway");
      expect(response.data[0]?.sparkline).toHaveLength(2);
      expect(response.pagination).toEqual({
        limit: 50,
        hasMore: false,
        nextCursor: null,
      });
    });

    it("rejects invalid query parameters for GET /api/monitors with ValidationException", async () => {
      const event = createMockEvent({
        method: "GET",
        path: "/api/monitors",
        query: { limit: "-5" },
      });

      await expect(listMonitorsHandler(event)).rejects.toThrow(ValidationException);
    });

    it("returns sanitized monitor detail for GET /api/monitors/:id", async () => {
      const container = getContainer();
      const mockMonitor = {
        id: "0192e21b-8a21-7000-8b1a-98df76123456",
        name: "Payments Service",
        url: "https://api.example.com/pay",
        method: "POST" as const,
        intervalSeconds: 120,
        timeoutMs: 5000,
        isActive: true,
        healthStatus: "UP" as const,
        version: 2,
        headerKeys: ["authorization", "x-client-id"],
        authType: "BEARER" as const,
        consecutiveSuccesses: 5,
        failureCount: 0,
        currentIncidentId: null,
        lastCheckedAt: "2026-10-24T10:00:00.000Z",
        nextRunAt: "2026-10-24T10:02:00.000Z",
        sparkline: [],
        createdAt: "2026-10-24T08:00:00.000Z",
        updatedAt: "2026-10-24T09:00:00.000Z",
      };

      vi.spyOn(container.getMonitorUseCase, "execute").mockResolvedValue(mockMonitor);

      const event = createMockEvent({
        method: "GET",
        path: "/api/monitors/0192e21b-8a21-7000-8b1a-98df76123456",
        params: { id: "0192e21b-8a21-7000-8b1a-98df76123456" },
      });

      const response = await getMonitorHandler(event);

      expect(response.id).toBe("0192e21b-8a21-7000-8b1a-98df76123456");
      expect(response.headerKeys).toEqual(["authorization", "x-client-id"]);
      expect(response.authType).toBe("BEARER");
      // Verify no secret fields exist
      expect((response as Record<string, unknown>).encryptedHeaders).toBeUndefined();
      expect((response as Record<string, unknown>).encryptedAuthConfig).toBeUndefined();
      expect((response as Record<string, unknown>).encryptedBody).toBeUndefined();
    });

    it("throws EntityNotFoundException if monitor does not exist", async () => {
      const container = getContainer();
      vi.spyOn(container.getMonitorUseCase, "execute").mockRejectedValue(
        new EntityNotFoundException("Monitor tidak ditemukan."),
      );

      const event = createMockEvent({
        method: "GET",
        path: "/api/monitors/0192e21b-0000-7000-8000-000000000000",
        params: { id: "0192e21b-0000-7000-8000-000000000000" },
      });

      await expect(getMonitorHandler(event)).rejects.toThrow(EntityNotFoundException);
    });
  });

  describe("P8.4 — REST Handlers (POST, PATCH, DELETE, PAUSE, RESUME)", () => {
    it("creates monitor and returns 201 with sanitized response", async () => {
      const container = getContainer();
      const mockCreated = {
        id: "0192e21b-8a21-7000-8b1a-98df76123456",
        name: "New Service",
        url: "https://api.example.com/v1",
        method: "GET" as const,
        intervalSeconds: 60,
        timeoutMs: 10000,
        isActive: true,
        healthStatus: "UNKNOWN" as const,
        version: 1,
        headerKeys: ["x-custom"],
        authType: "NONE" as const,
        consecutiveSuccesses: 0,
        failureCount: 0,
        currentIncidentId: null,
        lastCheckedAt: null,
        nextRunAt: "2026-10-24T10:01:00.000Z",
        sparkline: [],
        createdAt: "2026-10-24T10:00:00.000Z",
        updatedAt: "2026-10-24T10:00:00.000Z",
      };

      vi.spyOn(container.createMonitorUseCase, "execute").mockResolvedValue(mockCreated);

      const event = createMockEvent({
        method: "POST",
        path: "/api/monitors",
        body: {
          name: "New Service",
          url: "https://api.example.com/v1",
          method: "GET",
          intervalSeconds: 60,
          timeoutMs: 10000,
        },
      });

      const response = await createMonitorHandler(event);

      expect(response).toEqual(mockCreated);
      expect(event.node.res.statusCode).toBe(201);
    });

    it("updates monitor via PATCH", async () => {
      const container = getContainer();
      const mockUpdated = {
        id: "0192e21b-8a21-7000-8b1a-98df76123456",
        name: "Updated Service",
        url: "https://api.example.com/v2",
        method: "GET" as const,
        intervalSeconds: 60,
        timeoutMs: 10000,
        isActive: true,
        healthStatus: "UP" as const,
        version: 2,
        headerKeys: [],
        authType: "NONE" as const,
        consecutiveSuccesses: 1,
        failureCount: 0,
        currentIncidentId: null,
        lastCheckedAt: "2026-10-24T10:00:00.000Z",
        nextRunAt: "2026-10-24T10:01:00.000Z",
        sparkline: [],
        createdAt: "2026-10-24T09:00:00.000Z",
        updatedAt: "2026-10-24T10:05:00.000Z",
      };

      vi.spyOn(container.updateMonitorUseCase, "execute").mockResolvedValue(mockUpdated);

      const event = createMockEvent({
        method: "PATCH",
        path: "/api/monitors/0192e21b-8a21-7000-8b1a-98df76123456",
        params: { id: "0192e21b-8a21-7000-8b1a-98df76123456" },
        body: { name: "Updated Service", version: 1 },
      });

      const response = await patchMonitorHandler(event);
      expect(response.name).toBe("Updated Service");
      expect(response.version).toBe(2);
    });

    it("propagates 409 ConflictException on concurrent update mismatch", async () => {
      const container = getContainer();
      vi.spyOn(container.updateMonitorUseCase, "execute").mockRejectedValue(
        new ConflictException("OCC mismatch: versi tidak cocok."),
      );

      const event = createMockEvent({
        method: "PATCH",
        path: "/api/monitors/0192e21b-8a21-7000-8b1a-98df76123456",
        params: { id: "0192e21b-8a21-7000-8b1a-98df76123456" },
        body: { version: 1 },
      });

      await expect(patchMonitorHandler(event)).rejects.toThrow(ConflictException);
    });

    it("pauses monitor via POST /api/monitors/:id/pause", async () => {
      const container = getContainer();
      const mockPaused = {
        id: "0192e21b-8a21-7000-8b1a-98df76123456",
        name: "Service",
        url: "https://api.example.com",
        method: "GET" as const,
        intervalSeconds: 60,
        timeoutMs: 10000,
        isActive: false,
        healthStatus: "PAUSED" as const,
        version: 2,
        headerKeys: [],
        authType: "NONE" as const,
        consecutiveSuccesses: 0,
        failureCount: 0,
        currentIncidentId: null,
        lastCheckedAt: null,
        nextRunAt: "2026-10-24T10:00:00.000Z",
        sparkline: [],
        createdAt: "2026-10-24T09:00:00.000Z",
        updatedAt: "2026-10-24T10:10:00.000Z",
      };

      vi.spyOn(container.pauseMonitorUseCase, "execute").mockResolvedValue(mockPaused);

      const event = createMockEvent({
        method: "POST",
        path: "/api/monitors/0192e21b-8a21-7000-8b1a-98df76123456/pause",
        params: { id: "0192e21b-8a21-7000-8b1a-98df76123456" },
      });

      const response = await pauseMonitorHandler(event);
      expect(response.isActive).toBe(false);
      expect(response.healthStatus).toBe("PAUSED");
    });

    it("resumes monitor via POST /api/monitors/:id/resume", async () => {
      const container = getContainer();
      const mockResumed = {
        id: "0192e21b-8a21-7000-8b1a-98df76123456",
        name: "Service",
        url: "https://api.example.com",
        method: "GET" as const,
        intervalSeconds: 60,
        timeoutMs: 10000,
        isActive: true,
        healthStatus: "UNKNOWN" as const,
        version: 3,
        headerKeys: [],
        authType: "NONE" as const,
        consecutiveSuccesses: 0,
        failureCount: 0,
        currentIncidentId: null,
        lastCheckedAt: null,
        nextRunAt: "2026-10-24T10:15:00.000Z",
        sparkline: [],
        createdAt: "2026-10-24T09:00:00.000Z",
        updatedAt: "2026-10-24T10:15:00.000Z",
      };

      vi.spyOn(container.resumeMonitorUseCase, "execute").mockResolvedValue(mockResumed);

      const event = createMockEvent({
        method: "POST",
        path: "/api/monitors/0192e21b-8a21-7000-8b1a-98df76123456/resume",
        params: { id: "0192e21b-8a21-7000-8b1a-98df76123456" },
      });

      const response = await resumeMonitorHandler(event);
      expect(response.isActive).toBe(true);
      expect(response.healthStatus).toBe("UNKNOWN");
    });

    it("deletes monitor via DELETE /api/monitors/:id and returns 204", async () => {
      const container = getContainer();
      vi.spyOn(container.deleteMonitorUseCase, "execute").mockResolvedValue();

      const event = createMockEvent({
        method: "DELETE",
        path: "/api/monitors/0192e21b-8a21-7000-8b1a-98df76123456",
        params: { id: "0192e21b-8a21-7000-8b1a-98df76123456" },
      });

      const response = await deleteMonitorHandler(event);
      expect(response).toBeNull();
      expect(event.node.res.statusCode).toBe(204);
    });
  });

  describe("P8.5 — SSRF & 11 Aturan Validasi Ditolak", () => {
    it("rejects private localhost IP via SSRF pre-check", async () => {
      const event = createMockEvent({
        method: "POST",
        path: "/api/monitors",
        body: {
          name: "SSRF Attempt",
          url: "http://127.0.0.1:8080/admin",
        },
      });

      await expect(createMonitorHandler(event)).rejects.toThrow(ValidationException);
    });

    it("rejects cloud metadata IP 169.254.169.254 via SSRF pre-check", async () => {
      const event = createMockEvent({
        method: "POST",
        path: "/api/monitors",
        body: {
          name: "Cloud Metadata",
          url: "http://169.254.169.254/latest/meta-data/",
        },
      });

      await expect(createMonitorHandler(event)).rejects.toThrow(ValidationException);
    });

    it("rejects private RFC 1918 range (192.168.1.1, 10.0.0.1, 172.16.0.1)", async () => {
      const privateUrls = [
        "http://192.168.1.1/api",
        "http://10.0.0.1/api",
        "http://172.16.0.1/api",
        "http://localhost/api",
      ];

      for (const url of privateUrls) {
        const event = createMockEvent({
          method: "POST",
          path: "/api/monitors",
          body: { name: "Private Target", url },
        });

        await expect(createMonitorHandler(event)).rejects.toThrow(ValidationException);
      }
    });

    it("rejects URL with credentials (user:password@)", async () => {
      const event = createMockEvent({
        method: "POST",
        path: "/api/monitors",
        body: {
          name: "Creds in URL",
          url: "https://user:pass@api.example.com",
        },
      });

      await expect(createMonitorHandler(event)).rejects.toThrow(ValidationException);
    });

    it("rejects forbidden hop-by-hop headers", async () => {
      const forbiddenKeys = ["host", "connection", "transfer-encoding", "upgrade"];
      for (const key of forbiddenKeys) {
        const event = createMockEvent({
          method: "POST",
          path: "/api/monitors",
          body: {
            name: "Hop by hop header",
            url: "https://api.example.com",
            customHeaders: { [key]: "evil-value" },
          },
        });

        await expect(createMonitorHandler(event)).rejects.toThrow(ValidationException);
      }
    });

    it("rejects assertion rules exceeding maximum of 10", async () => {
      const elevenAssertions = Array.from({ length: 11 }, () => ({
        type: "STATUS_CODE",
        operator: "EQUALS",
        expected: 200,
      }));

      const event = createMockEvent({
        method: "POST",
        path: "/api/monitors",
        body: {
          name: "Too many assertions",
          url: "https://api.example.com",
          assertions: elevenAssertions,
        },
      });

      await expect(createMonitorHandler(event)).rejects.toThrow(ValidationException);
    });

    it("rejects invalid interval seconds (< 60s)", async () => {
      const event = createMockEvent({
        method: "POST",
        path: "/api/monitors",
        body: {
          name: "Invalid interval",
          url: "https://api.example.com",
          intervalSeconds: 30,
        },
      });

      await expect(createMonitorHandler(event)).rejects.toThrow(ValidationException);
    });

    it("rejects invalid timeout (< 1000ms or > 30000ms)", async () => {
      const eventTooShort = createMockEvent({
        method: "POST",
        path: "/api/monitors",
        body: {
          name: "Timeout short",
          url: "https://api.example.com",
          timeoutMs: 500,
        },
      });
      await expect(createMonitorHandler(eventTooShort)).rejects.toThrow(ValidationException);

      const eventTooLong = createMockEvent({
        method: "POST",
        path: "/api/monitors",
        body: {
          name: "Timeout long",
          url: "https://api.example.com",
          timeoutMs: 60000,
        },
      });
      await expect(createMonitorHandler(eventTooLong)).rejects.toThrow(ValidationException);
    });

    it("rejects body larger than 64 KB", async () => {
      const giantBody = "x".repeat(70000);
      const event = createMockEvent({
        method: "POST",
        path: "/api/monitors",
        body: {
          name: "Huge Body",
          url: "https://api.example.com",
          body: giantBody,
        },
      });

      await expect(createMonitorHandler(event)).rejects.toThrow(ValidationException);
    });
  });

  describe("P8.5 — Sweep Kebocoran Kredensial / Zero Leak", () => {
    it("never leaks secret bearer tokens, passwords, or header secrets in JSON responses", async () => {
      const CANARY_SECRET = "SUPER_SECRET_CANARY_TOKEN_999888777666";

      const container = getContainer();
      let savedMonitor: Monitor | null = null;
      vi.spyOn(container.monitorRepository, "save").mockImplementation(async (m) => {
        savedMonitor = m;
      });
      vi.spyOn(container.monitorRepository, "findById").mockImplementation(
        async () => savedMonitor,
      );
      vi.spyOn(container.monitorRepository, "findWithFilter").mockImplementation(async () => ({
        items: savedMonitor ? [savedMonitor] : [],
        nextCursor: undefined,
      }));
      vi.spyOn(container.checkResultRepository, "findSparkline").mockResolvedValue([]);

      // Test CreateMonitor directly with actual use case to verify zero leak end to end
      const created = await container.createMonitorUseCase.execute({
        name: "Canary Monitor",
        url: "https://api.example.com/secure",
        method: "POST",
        intervalSeconds: 60,
        timeoutMs: 5000,
        auth: {
          type: "BEARER",
          token: CANARY_SECRET,
        },
        customHeaders: {
          "x-api-key": CANARY_SECRET,
        },
        body: JSON.stringify({ secret: CANARY_SECRET }),
      });

      const responseJson = JSON.stringify(created);
      expect(responseJson).not.toContain(CANARY_SECRET);
      expect(created.headerKeys).toEqual(["x-api-key"]);
      expect(created.authType).toBe("BEARER");

      // Test GetMonitor directly
      const retrieved = await container.getMonitorUseCase.execute(created.id);
      const retrievedJson = JSON.stringify(retrieved);
      expect(retrievedJson).not.toContain(CANARY_SECRET);

      // Test ListMonitors
      const listResult = await container.listMonitorsUseCase.execute();
      const listJson = JSON.stringify(listResult);
      expect(listJson).not.toContain(CANARY_SECRET);
    });
  });

  describe("POST /api/monitors/:id/check (P9.4)", () => {
    it("enqueues manual check job with priority and returns 202 Accepted", async () => {
      const container = getContainer();
      const monitor = Monitor.create({
        id: UUIDv7.fromString("019488a0-0000-7000-8000-000000000001"),
        name: "Test Monitor",
        url: EndpointUrl.create("https://api.example.com/health"),
        method: HttpMethod.GET,
        intervalSeconds: 60,
        timeoutMs: 5000,
        isActive: true,
      });

      vi.spyOn(container.monitorRepository, "findById").mockResolvedValue(monitor);
      vi.spyOn(container.rateLimiter, "consumeTier2UserCheck").mockResolvedValue({
        allowed: true,
        remaining: 19,
        resetAfterSeconds: 60,
      });
      vi.spyOn(container.rateLimiter, "consumeTier2MonitorCheck").mockResolvedValue({
        allowed: true,
        remaining: 0,
        resetAfterSeconds: 10,
      });
      const sendSpy = vi.spyOn(container.boss, "send").mockResolvedValue("job-123");

      const event = createMockEvent({
        method: "POST",
        params: { id: monitor.id.toString() },
        context: {
          user: { id: "user-123", username: "admin" },
        },
      });

      const response = await checkMonitorHandler(event);

      expect(response.checkId).toBeDefined();
      expect(response.message).toContain("berhasil dijadwalkan");
      expect(event.node.res.statusCode).toBe(202);
      expect(sendSpy).toHaveBeenCalledWith(
        "probe:check",
        expect.objectContaining({
          monitorId: monitor.id.toString(),
          checkId: response.checkId,
          triggerType: "MANUAL",
        }),
        expect.objectContaining({ priority: 10 }),
      );
    });

    it("throws EntityNotFoundException if monitor does not exist", async () => {
      const container = getContainer();
      vi.spyOn(container.monitorRepository, "findById").mockResolvedValue(null);
      vi.spyOn(container.rateLimiter, "consumeTier2UserCheck").mockResolvedValue({
        allowed: true,
        remaining: 19,
        resetAfterSeconds: 60,
      });
      vi.spyOn(container.rateLimiter, "consumeTier2MonitorCheck").mockResolvedValue({
        allowed: true,
        remaining: 0,
        resetAfterSeconds: 10,
      });

      const event = createMockEvent({
        method: "POST",
        params: { id: "019488a0-0000-7000-8000-000000000099" },
        context: {
          user: { id: "user-123", username: "admin" },
        },
      });

      await expect(checkMonitorHandler(event)).rejects.toThrow(EntityNotFoundException);
    });
  });

  describe("POST /api/monitors/test (P9.4 / D-10)", () => {
    it("executes dry-run test probe and returns CheckDetailDto", async () => {
      const container = getContainer();
      vi.spyOn(container.rateLimiter, "consumeTier2UserCheck").mockResolvedValue({
        allowed: true,
        remaining: 19,
        resetAfterSeconds: 60,
      });

      const executeSpy = vi.spyOn(container.testMonitorConfigUseCase, "execute").mockResolvedValue({
        id: "check-123",
        monitorId: "mon-123",
        status: "UP",
        statusCode: 200,
        latencyMs: 55,
        failureCategory: null,
        failureReason: null,
        triggerType: "MANUAL",
        scheduledFor: null,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        correlationId: "corr-123",
        executedAt: new Date().toISOString(),
        diagnostics: {
          pinnedIp: "93.184.216.34",
          dnsDurationMs: 5,
          connectDurationMs: 10,
          tlsDurationMs: 15,
          firstByteDurationMs: 25,
          requestHeaders: {},
          responseHeaders: { "content-type": "application/json" },
          responseBodySnippet: '{"ok":true}',
          assertionResults: [],
        },
      });

      const body = {
        url: "https://api.example.com/health",
        method: "GET",
        timeoutMs: 5000,
      };

      const event = createMockEvent({
        method: "POST",
        body,
        context: {
          user: { id: "user-123", username: "admin" },
        },
      });

      const result = await testMonitorConfigHandler(event);

      expect(executeSpy).toHaveBeenCalledWith({ request: body });
      expect(result.status).toBe("UP");
      expect(result.statusCode).toBe(200);
      expect(result.triggerType).toBe("MANUAL");
    });
  });
});
