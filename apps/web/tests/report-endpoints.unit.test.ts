import {
  CheckResult,
  FailureCategory,
  HttpMethod,
  Monitor,
  TriggerType,
  UUIDv7,
  ValidationException,
} from "@sentinel/domain";
import type { H3Event } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import exportCsvHandler from "../server/api/reports/export.csv.get.js";
import { getContainer, resetContainer } from "../server/utils/container.js";

interface MockEventOverrides {
  method?: string;
  path?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

function createMockEvent(overrides: MockEventOverrides = {}) {
  const headers: Record<string, string> = {
    host: "localhost:3000",
    ...(overrides.headers || {}),
  };
  const responseHeaders: Record<string, string | string[]> = {};
  const writtenChunks: string[] = [];

  const res = {
    statusCode: 200,
    headersSent: false,
    socket: {},
    setHeader: (name: string, value: string | string[]) => {
      responseHeaders[name.toLowerCase()] = value;
    },
    getHeader: (name: string) => responseHeaders[name.toLowerCase()],
    write: (chunk: unknown) => {
      writtenChunks.push(String(chunk));
      return true;
    },
    end: () => {},
  };

  const event = {
    method: overrides.method || "GET",
    path: overrides.path || "/api/reports/export.csv",
    node: {
      req: {
        method: overrides.method || "GET",
        url: overrides.path || "/api/reports/export.csv",
        headers,
        socket: {
          remoteAddress: "127.0.0.1",
        },
      },
      res,
    },
    context: {},
    _query: overrides.query,
  } as unknown as H3Event & { _query?: unknown };

  return { event, responseHeaders, writtenChunks };
}

vi.mock("h3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("h3")>();
  return {
    ...actual,
    getQuery: vi.fn((event: unknown) => (event as { _query?: unknown })?._query || {}),
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
  INTERNAL_API_SECRET: "01234567890123456789012345678901",
  TELEGRAM_API_BASE_URL: "https://api.telegram.org",
};

describe("GET /api/reports/export.csv Endpoint (P11.3, US 30)", () => {
  beforeEach(async () => {
    await resetContainer();
    getContainer(TEST_ENV);
  });

  it("throws ValidationException if query params are missing or invalid", async () => {
    const { event } = createMockEvent({
      query: {},
    });

    await expect(exportCsvHandler(event)).rejects.toThrow(ValidationException);
  });

  it("throws ValidationException if type is invalid", async () => {
    const { event } = createMockEvent({
      query: {
        type: "unknown_type",
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-02T00:00:00.000Z",
      },
    });

    await expect(exportCsvHandler(event)).rejects.toThrow(ValidationException);
  });

  it("streams checks CSV report with correct Content-Type and Content-Disposition headers", async () => {
    const container = getContainer();

    const monitorId = "018f0000-0000-7000-8000-000000000001";
    const monitor = new Monitor({
      id: UUIDv7.fromString(monitorId),
      name: "Order Processing Service",
      url: "https://api.example.com/orders",
      method: HttpMethod.GET,
      headers: {},
      body: null,
      authConfig: null,
      assertions: [],
      intervalSeconds: 60,
      timeoutMs: 5000,
      degradedThresholdMs: 2000,
      consecutiveFailuresThreshold: 3,
      consecutiveSuccessesThreshold: 2,
    });

    vi.spyOn(container.monitorRepository, "findById").mockResolvedValue(monitor);

    const check = new CheckResult({
      id: UUIDv7.fromString("018f0000-0000-7000-8000-000000000002"),
      monitorId: UUIDv7.fromString(monitorId),
      incidentId: null,
      triggerType: TriggerType.SCHEDULED,
      scheduledFor: new Date("2026-03-01T10:00:00.000Z"),
      startedAt: new Date("2026-03-01T10:00:00.000Z"),
      finishedAt: new Date("2026-03-01T10:00:00.120Z"),
      durationMs: 120,
      isSuccess: true,
      statusCode: 200,
      failureCategory: null,
      assertionResults: [],
      diagnostic: null,
      correlationId: "corr-1",
      pinnedIp: "192.0.2.1",
    });

    vi.spyOn(container.checkResultRepository, "streamChecks").mockImplementation(
      async function* () {
        yield check;
      },
    );

    const { event, responseHeaders, writtenChunks } = createMockEvent({
      query: {
        type: "checks",
        monitorId,
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-02T00:00:00.000Z",
      },
    });

    await exportCsvHandler(event);

    // Verify response headers
    expect(responseHeaders["content-type"]).toBe("text/csv; charset=utf-8");
    expect(responseHeaders["content-disposition"]).toMatch(
      /^attachment; filename="report-checks-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(responseHeaders["cache-control"]).toBe("no-cache, no-store, must-revalidate");

    // Verify streamed content
    const fullCsv = writtenChunks.join("");
    expect(fullCsv).toContain(
      "timestamp,monitor_name,status,status_code,latency_ms,failure_category,failure_reason,trigger_type\r\n",
    );
    expect(fullCsv).toContain("Order Processing Service,UP,200,120,,,SCHEDULED\r\n");
  });

  it("neutralizes formula injection and redacts secrets in CSV stream", async () => {
    const container = getContainer();

    const monitorId = "018f0000-0000-7000-8000-000000000001";
    const monitor = new Monitor({
      id: UUIDv7.fromString(monitorId),
      name: "=Formula Monitor",
      url: "https://api.example.com/dangerous",
      method: HttpMethod.GET,
      headers: {},
      body: null,
      authConfig: null,
      assertions: [],
      intervalSeconds: 60,
      timeoutMs: 5000,
      degradedThresholdMs: 2000,
      consecutiveFailuresThreshold: 3,
      consecutiveSuccessesThreshold: 2,
    });

    vi.spyOn(container.monitorRepository, "findById").mockResolvedValue(monitor);

    const check = new CheckResult({
      id: UUIDv7.fromString("018f0000-0000-7000-8000-000000000003"),
      monitorId: UUIDv7.fromString(monitorId),
      incidentId: null,
      triggerType: TriggerType.MANUAL,
      scheduledFor: null,
      startedAt: new Date("2026-03-01T10:00:00.000Z"),
      finishedAt: new Date("2026-03-01T10:00:00.500Z"),
      durationMs: 500,
      isSuccess: false,
      statusCode: 500,
      failureCategory: FailureCategory.HTTP_STATUS_MISMATCH,
      assertionResults: [],
      diagnostic: "=cmd|' /C calc'!A0 token bot999999:xyz-SECRET-token123",
      correlationId: "corr-2",
      pinnedIp: "192.0.2.1",
    });

    vi.spyOn(container.checkResultRepository, "streamChecks").mockImplementation(
      async function* () {
        yield check;
      },
    );

    const { event, writtenChunks } = createMockEvent({
      query: {
        type: "checks",
        monitorId,
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-02T00:00:00.000Z",
      },
    });

    await exportCsvHandler(event);

    const fullCsv = writtenChunks.join("");
    // Formula prefix in monitor name neutralized
    expect(fullCsv).toContain("'=Formula Monitor");
    // Formula prefix in failure reason neutralized
    expect(fullCsv).toContain("'=cmd|' /C calc'!A0");
    // Bot token redacted
    expect(fullCsv).toContain("bot[REDACTED_TELEGRAM_TOKEN]");
    expect(fullCsv).not.toContain("bot999999:xyz");
  });
});
