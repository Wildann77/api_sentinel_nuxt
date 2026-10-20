import * as http from "node:http";
import * as zlib from "node:zlib";
import { FailureCategory } from "@sentinel/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DnsLookupFunctions } from "../src/network/dns-resolver.js";
import { NodeHttpSsrfProbeAdapter } from "../src/network/node-http-ssrf-probe.adapter.js";
import { executeSsrfProbe } from "../src/network/probe-executor.js";

describe("P6.3 & P6.4 — SSRF Probe Executor Integration Tests", () => {
  let server: http.Server;
  let serverPort: number;

  const mockPublicLookup: DnsLookupFunctions = {
    resolve4: async () => ["93.184.216.34"],
    resolve6: async () => [],
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

      if (url.pathname === "/api/status") {
        res.writeHead(200, {
          "content-type": "application/json",
          "x-sentinel-test": "sentinel-ok",
        });
        res.end(JSON.stringify({ status: "operational", uptime: 99.9 }));
        return;
      }

      if (url.pathname === "/api/redirect") {
        res.writeHead(302, {
          Location: "/api/status",
          "content-type": "text/plain",
        });
        res.end("Redirecting to /api/status");
        return;
      }

      if (url.pathname === "/api/headers") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ receivedHost: req.headers.host }));
        return;
      }

      if (url.pathname === "/api/gzip") {
        const payload = JSON.stringify({ message: "Gzipped content", ok: true });
        const compressed = zlib.gzipSync(Buffer.from(payload));
        res.writeHead(200, {
          "content-type": "application/json",
          "content-encoding": "gzip",
        });
        res.end(compressed);
        return;
      }

      if (url.pathname === "/api/bomb") {
        const bomb = zlib.gzipSync(Buffer.alloc(2.5 * 1024 * 1024, "X"));
        res.writeHead(200, {
          "content-type": "text/plain",
          "content-encoding": "gzip",
        });
        res.end(bomb);
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("executes standard GET request and returns valid ProbeResult with latency metrics", async () => {
    const result = await executeSsrfProbe(
      {
        url: `http://api.sentinel-test.com:${serverPort}/api/status`,
        method: "GET",
        timeoutMs: 5000,
      },
      {
        lookup: mockPublicLookup,
        overridePinnedIp: "127.0.0.1",
      },
    );

    expect(result.statusCode).toBe(200);
    expect(result.errorCategory).toBeNull();
    expect(result.errorMessage).toBeNull();
    expect(result.pinnedIp).toBe("127.0.0.1");
    expect(result.headers["content-type"]).toBe("application/json");
    expect(result.headers["x-sentinel-test"]).toBe("sentinel-ok");
    expect(result.bodySnippet).toContain("operational");

    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThan(0);
    expect(typeof result.connectDurationMs).toBe("number");
    expect(typeof result.firstByteDurationMs).toBe("number");
    expect(result.tlsDurationMs).toBeNull(); // HTTP, no TLS
  });

  it("P6.3: disables redirect and classifies 302 response as REDIRECT_NOT_ALLOWED without following it", async () => {
    const result = await executeSsrfProbe(
      {
        url: `http://api.sentinel-test.com:${serverPort}/api/redirect`,
        method: "GET",
        timeoutMs: 5000,
      },
      {
        lookup: mockPublicLookup,
        overridePinnedIp: "127.0.0.1",
      },
    );

    expect(result.statusCode).toBe(302);
    expect(result.errorCategory).toBe(FailureCategory.REDIRECT_NOT_ALLOWED);
    expect(result.headers.location).toBe("/api/status");
    expect(result.errorMessage).toContain("tidak diizinkan");
    expect(result.bodySnippet).toContain("Redirecting to /api/status");
  });

  it("P6.3: preserves original Host header matching domain name to defeat DNS rebinding TOCTOU", async () => {
    const result = await executeSsrfProbe(
      {
        url: `http://monitored-api.example.org:${serverPort}/api/headers`,
        method: "GET",
        timeoutMs: 5000,
      },
      {
        lookup: mockPublicLookup,
        overridePinnedIp: "127.0.0.1",
      },
    );

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.bodySnippet ?? "{}");
    expect(parsed.receivedHost).toBe(`monitored-api.example.org:${serverPort}`);
  });

  it("P6.4: decompresses gzip body and captures response snippet", async () => {
    const result = await executeSsrfProbe(
      {
        url: `http://api.sentinel-test.com:${serverPort}/api/gzip`,
        method: "GET",
        timeoutMs: 5000,
      },
      {
        lookup: mockPublicLookup,
        overridePinnedIp: "127.0.0.1",
      },
    );

    expect(result.statusCode).toBe(200);
    expect(result.errorCategory).toBeNull();
    const parsed = JSON.parse(result.bodySnippet ?? "{}");
    expect(parsed.message).toBe("Gzipped content");
    expect(parsed.ok).toBe(true);
  });

  it("P6.4: halts on decompression bomb exceeding 2 MB and classifies as RESPONSE_SIZE_EXCEEDED", async () => {
    const result = await executeSsrfProbe(
      {
        url: `http://api.sentinel-test.com:${serverPort}/api/bomb`,
        method: "GET",
        timeoutMs: 5000,
      },
      {
        lookup: mockPublicLookup,
        overridePinnedIp: "127.0.0.1",
      },
    );

    expect(result.statusCode).toBe(200);
    expect(result.errorCategory).toBe(FailureCategory.RESPONSE_SIZE_EXCEEDED);
    expect(result.errorMessage).toContain("2 MB");
    expect(result.bodySnippet).toBeNull();
  });

  it("P6.4: destroys stream immediately and sets bodySnippet=null when needsResponseBody=false", async () => {
    const result = await executeSsrfProbe(
      {
        url: `http://api.sentinel-test.com:${serverPort}/api/status`,
        method: "GET",
        timeoutMs: 5000,
        needsResponseBody: false,
      },
      {
        lookup: mockPublicLookup,
        overridePinnedIp: "127.0.0.1",
      },
    );

    expect(result.statusCode).toBe(200);
    expect(result.errorCategory).toBeNull();
    expect(result.bodySnippet).toBeNull();
    expect(result.headers["content-type"]).toBe("application/json");
  });

  it("blocks private loopback IP address with SSRF_BLOCKED", async () => {
    const result = await executeSsrfProbe({
      url: "http://127.0.0.1:8080/test",
      method: "GET",
      timeoutMs: 5000,
    });

    expect(result.statusCode).toBeNull();
    expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
    expect(result.errorMessage).toContain("dilarang");
  });

  it("blocks cloud metadata 169.254.169.254 with SSRF_BLOCKED", async () => {
    const result = await executeSsrfProbe({
      url: "http://169.254.169.254/latest/meta-data",
      method: "GET",
      timeoutMs: 5000,
    });

    expect(result.statusCode).toBeNull();
    expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
    expect(result.errorMessage).toContain("dilarang");
  });

  it("classifies DNS resolution error as DNS_RESOLUTION_FAILED", async () => {
    const failingLookup: DnsLookupFunctions = {
      resolve4: async () => {
        throw new Error("ENOTFOUND getaddrinfo failure");
      },
      resolve6: async () => {
        throw new Error("ENOTFOUND getaddrinfo failure");
      },
    };

    const result = await executeSsrfProbe(
      {
        url: "http://non-existent-probe-host.com/health",
        method: "GET",
        timeoutMs: 5000,
      },
      { lookup: failingLookup },
    );

    expect(result.statusCode).toBeNull();
    expect(result.errorCategory).toBe(FailureCategory.DNS_RESOLUTION_FAILED);
  });

  it("classifies ECONNREFUSED as CONNECTION_REFUSED", async () => {
    // Port 59998 has no listening server
    const result = await executeSsrfProbe(
      {
        url: "http://api.sentinel-test.com:59998/test",
        method: "GET",
        timeoutMs: 3000,
      },
      {
        lookup: mockPublicLookup,
        overridePinnedIp: "127.0.0.1",
      },
    );

    expect(result.statusCode).toBeNull();
    expect(result.errorCategory).toBe(FailureCategory.CONNECTION_REFUSED);
  });

  it("NodeHttpSsrfProbeAdapter conforms to NetworkProbePort interface", async () => {
    const adapter = new NodeHttpSsrfProbeAdapter(mockPublicLookup);
    expect(adapter.isSsrfSafe).toBe(true);

    const result = await adapter.probe({
      url: "http://127.0.0.1:8080/forbidden",
      method: "GET",
      timeoutMs: 3000,
    });

    expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
  });
});
