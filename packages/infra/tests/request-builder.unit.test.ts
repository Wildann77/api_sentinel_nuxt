import { ValidationException } from "@sentinel/domain";
import { describe, expect, it } from "vitest";
import { buildProbeRequest } from "../src/network/request-builder.js";

describe("P6.1 — RequestBuilder Unit Tests", () => {
  it("builds a standard GET request with default User-Agent and timeout", () => {
    const result = buildProbeRequest({
      url: "https://example.com/api/health",
    });

    expect(result.method).toBe("GET");
    expect(result.url).toBe("https://example.com/api/health");
    expect(result.headers["user-agent"]).toBe("API-Sentinel-Probe/1.0");
    expect(result.timeoutMs).toBe(10_000);
    expect(result.body).toBeUndefined();
  });

  it("normalizes method to uppercase", () => {
    const result = buildProbeRequest({
      url: "https://example.com/api/status",
      method: "post",
      body: '{"status":"ok"}',
    });

    expect(result.method).toBe("POST");
    expect(result.body).toBe('{"status":"ok"}');
    expect(result.headers["content-type"]).toBe("application/json; charset=utf-8");
  });

  it("throws ValidationException for unsupported HTTP method", () => {
    expect(() =>
      buildProbeRequest({
        url: "https://example.com",
        method: "INVALID",
      }),
    ).toThrow(ValidationException);
  });

  it("strips connection hop-by-hop deny-list headers and internal sentinel headers", () => {
    const result = buildProbeRequest({
      url: "https://example.com",
      headers: {
        Host: "evil.internal",
        "Content-Length": "123",
        "Transfer-Encoding": "chunked",
        Connection: "keep-alive",
        "Keep-Alive": "timeout=5",
        Upgrade: "websocket",
        "Proxy-Authorization": "Basic dXNlcjpwYXNz",
        "X-Sentinel-Internal-Id": "sec-123",
        "sentinel-tenant": "admin",
        "X-Custom-Client": "MyClient",
      },
    });

    expect(result.headers.host).toBeUndefined();
    expect(result.headers["content-length"]).toBeUndefined();
    expect(result.headers["transfer-encoding"]).toBeUndefined();
    expect(result.headers.connection).toBeUndefined();
    expect(result.headers["keep-alive"]).toBeUndefined();
    expect(result.headers.upgrade).toBeUndefined();
    expect(result.headers["proxy-authorization"]).toBeUndefined();
    expect(result.headers["x-sentinel-internal-id"]).toBeUndefined();
    expect(result.headers["sentinel-tenant"]).toBeUndefined();
    expect(result.headers["x-custom-client"]).toBe("MyClient");
  });

  it("allows user-specified custom User-Agent to override default", () => {
    const result = buildProbeRequest({
      url: "https://example.com",
      headers: {
        "User-Agent": "Custom-Agent/2.0",
      },
    });

    expect(result.headers["user-agent"]).toBe("Custom-Agent/2.0");
  });

  it("throws ValidationException if header contains CRLF characters", () => {
    expect(() =>
      buildProbeRequest({
        url: "https://example.com",
        headers: {
          "X-Bad-Header": "value\r\nInjected: evil",
        },
      }),
    ).toThrow(ValidationException);
  });

  it("applies Bearer auth token properly", () => {
    const result = buildProbeRequest({
      url: "https://example.com",
      authConfig: {
        type: "bearer",
        token: "secret-token-xyz",
      },
    });

    expect(result.headers.authorization).toBe("Bearer secret-token-xyz");
  });

  it("applies Basic auth credentials with base64 encoding", () => {
    const result = buildProbeRequest({
      url: "https://example.com",
      authConfig: {
        type: "basic",
        username: "admin",
        password: "password123",
      },
    });

    const expectedBase64 = Buffer.from("admin:password123").toString("base64");
    expect(result.headers.authorization).toBe(`Basic ${expectedBase64}`);
  });

  it("applies API Key via header", () => {
    const result = buildProbeRequest({
      url: "https://example.com",
      authConfig: {
        type: "api_key",
        headerName: "X-API-KEY",
        headerValue: "key-999",
      },
    });

    expect(result.headers["x-api-key"]).toBe("key-999");
  });

  it("applies Custom Header auth and filters out deny-list entries", () => {
    const result = buildProbeRequest({
      url: "https://example.com",
      authConfig: {
        type: "custom_header",
        headers: {
          "X-Tenant": "tenant-abc",
          Host: "blocked.domain",
        },
      },
    });

    expect(result.headers["x-tenant"]).toBe("tenant-abc");
    expect(result.headers.host).toBeUndefined();
  });

  it("ignores body for GET and HEAD requests", () => {
    const getResult = buildProbeRequest({
      url: "https://example.com",
      method: "GET",
      body: '{"ignored":true}',
    });
    expect(getResult.body).toBeUndefined();

    const headResult = buildProbeRequest({
      url: "https://example.com",
      method: "HEAD",
      body: '{"ignored":true}',
    });
    expect(headResult.body).toBeUndefined();
  });

  it("retains explicit user Content-Type if provided", () => {
    const result = buildProbeRequest({
      url: "https://example.com",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "param=value",
    });

    expect(result.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(result.body).toBe("param=value");
  });

  it("clamps timeoutMs within range 1,000 ms to 30,000 ms", () => {
    const low = buildProbeRequest({
      url: "https://example.com",
      timeoutMs: 500,
    });
    expect(low.timeoutMs).toBe(1_000);

    const high = buildProbeRequest({
      url: "https://example.com",
      timeoutMs: 60_000,
    });
    expect(high.timeoutMs).toBe(30_000);

    const valid = buildProbeRequest({
      url: "https://example.com",
      timeoutMs: 5_000,
    });
    expect(valid.timeoutMs).toBe(5_000);
  });

  it("rejects SSRF private IP literals via EndpointUrl during request building", () => {
    expect(() =>
      buildProbeRequest({
        url: "http://127.0.0.1:8080/test",
      }),
    ).toThrow(ValidationException);

    expect(() =>
      buildProbeRequest({
        url: "http://169.254.169.254/latest/meta-data",
      }),
    ).toThrow(ValidationException);
  });
});
