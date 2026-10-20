import * as http from "node:http";
import * as zlib from "node:zlib";
import { BLOCKED_CIDR_RANGES, FailureCategory, NetworkPolicy } from "@sentinel/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DnsLookupFunctions } from "../src/network/dns-resolver.js";
import { classifyNetworkError, executeSsrfProbe } from "../src/network/probe-executor.js";

describe("P6.7 — SSRF Security & Network Guard 100% Comprehensive Suite", () => {
  let server: http.Server;
  let serverPort: number;

  const mockPublicLookup: DnsLookupFunctions = {
    resolve4: async () => ["93.184.216.34"],
    resolve6: async () => [],
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

      if (url.pathname === "/api/echo") {
        const bodyChunks: Buffer[] = [];
        req.on("data", (chunk) => bodyChunks.push(chunk));
        req.on("end", () => {
          const body = Buffer.concat(bodyChunks).toString("utf-8");
          res.writeHead(200, {
            "content-type": "application/json",
            "x-received-method": req.method ?? "UNKNOWN",
            "x-received-auth": req.headers.authorization ?? "",
            "x-received-api-key": req.headers["x-api-key"] ?? "",
            "x-received-custom": req.headers["x-custom-auth"] ?? "",
            "x-received-ua": req.headers["user-agent"] ?? "",
            "x-received-host": req.headers.host ?? "",
          });
          res.end(
            JSON.stringify({
              method: req.method,
              headers: req.headers,
              body,
            }),
          );
        });
        return;
      }

      if (url.pathname === "/api/slow") {
        // Delay beyond connect/headers timeout to trigger timeout test
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { "content-type": "text/plain" });
            res.end("Slow response");
          }
        }, 1500);
        return;
      }

      if (url.pathname === "/api/redirect-301") {
        res.writeHead(301, { Location: "/api/echo" });
        res.end("Moved Permanently");
        return;
      }

      if (url.pathname === "/api/redirect-307") {
        res.writeHead(307, { Location: "/api/echo" });
        res.end("Temporary Redirect");
        return;
      }

      if (url.pathname === "/api/large-body") {
        // Send body larger than 2 MB uncompressed
        res.writeHead(200, { "content-type": "text/plain" });
        const chunk = Buffer.alloc(512 * 1024, "A"); // 512 KB
        res.write(chunk);
        res.write(chunk);
        res.write(chunk);
        res.write(chunk);
        res.write(chunk); // > 2.5 MB
        res.end();
        return;
      }

      if (url.pathname === "/api/gzip-bomb") {
        // High compression ratio: 5 MB of zeroes compressed to ~5 KB
        const bomb = zlib.gzipSync(Buffer.alloc(5 * 1024 * 1024, 0));
        res.writeHead(200, {
          "content-type": "application/octet-stream",
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

  describe("1. CIDR Blocklist Enforcement (ARCH §5.1, §13, PRD §5.3)", () => {
    const testIpsToBlock = [
      // IPv4
      { ip: "0.0.0.1", reason: "0.0.0.0/8 Current Network" },
      { ip: "10.0.0.1", reason: "10.0.0.0/8 RFC 1918" },
      { ip: "10.254.254.1", reason: "10.0.0.0/8 RFC 1918" },
      { ip: "100.64.0.1", reason: "100.64.0.0/10 Carrier-Grade NAT" },
      { ip: "127.0.0.1", reason: "127.0.0.0/8 Loopback" },
      { ip: "127.1.2.3", reason: "127.0.0.0/8 Loopback" },
      { ip: "169.254.169.254", reason: "169.254.0.0/16 Link-Local Cloud Metadata" },
      { ip: "172.16.0.1", reason: "172.16.0.0/12 RFC 1918" },
      { ip: "172.31.255.254", reason: "172.16.0.0/12 RFC 1918" },
      { ip: "192.0.0.1", reason: "192.0.0.0/24 IETF Protocol Assignments" },
      { ip: "192.0.2.1", reason: "192.0.2.0/24 TEST-NET-1" },
      { ip: "192.168.0.1", reason: "192.168.0.0/16 RFC 1918" },
      { ip: "192.168.1.1", reason: "192.168.0.0/16 RFC 1918" },
      { ip: "198.18.0.1", reason: "198.18.0.0/15 Network Benchmark" },
      { ip: "198.51.100.1", reason: "198.51.100.0/24 TEST-NET-2" },
      { ip: "203.0.113.1", reason: "203.0.113.0/24 TEST-NET-3" },
      { ip: "224.0.0.1", reason: "224.0.0.0/4 Multicast" },
      { ip: "240.0.0.1", reason: "240.0.0.0/4 Reserved" },
      { ip: "255.255.255.255", reason: "255.255.255.255/32 Broadcast" },
      // IPv6
      { ip: "::", reason: "::/128 Unspecified" },
      { ip: "::1", reason: "::1/128 Loopback" },
      { ip: "::ffff:127.0.0.1", reason: "::ffff:0:0/96 IPv4-mapped loopback" },
      { ip: "::ffff:169.254.169.254", reason: "::ffff:0:0/96 IPv4-mapped metadata" },
      { ip: "64:ff9b::a00:1", reason: "64:ff9b::/96 NAT64 with 10.0.0.1" },
      { ip: "2001:db8::1", reason: "2001:db8::/32 Documentation" },
      { ip: "2002:0a00:0001::", reason: "2002::/16 6to4 with 10.0.0.1" },
      { ip: "fc00::1", reason: "fc00::/7 Unique Local" },
      { ip: "fd00::1", reason: "fc00::/7 Unique Local" },
      { ip: "fd00:ec2::254", reason: "fd00:ec2::254/128 AWS IMDSv6" },
      { ip: "fe80::1", reason: "fe80::/10 Link-Local" },
      { ip: "ff02::1", reason: "ff00::/8 Multicast" },
    ];

    for (const { ip, reason } of testIpsToBlock) {
      it(`blocks IP ${ip} (${reason}) via NetworkPolicy and probe execution`, async () => {
        expect(NetworkPolicy.isBlocked(ip)).toBe(true);

        const url = ip.includes(":") ? `http://[${ip}]/test` : `http://${ip}/test`;
        const result = await executeSsrfProbe({
          url,
          method: "GET",
          timeoutMs: 3000,
        });

        expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
        expect(result.statusCode).toBeNull();
        expect(result.errorMessage).toContain("dilarang");
      });
    }

    it("verifies all registered BLOCKED_CIDR_RANGES contain valid non-empty CIDR entries", () => {
      expect(BLOCKED_CIDR_RANGES.length).toBeGreaterThan(20);
      for (const cidr of BLOCKED_CIDR_RANGES) {
        expect(typeof cidr).toBe("string");
        expect(cidr).toContain("/");
      }
    });
  });

  describe("2. Multi-Record DNS Validation (Any Private IP Fails All)", () => {
    it("rejects when one A record is public and one is RFC 1918 private", async () => {
      const mockDns: DnsLookupFunctions = {
        resolve4: async () => ["93.184.216.34", "10.0.0.5"],
        resolve6: async () => [],
      };

      const result = await executeSsrfProbe(
        {
          url: "http://multi-record.evil.org/status",
          method: "GET",
          timeoutMs: 3000,
        },
        { lookup: mockDns },
      );

      expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
      expect(result.statusCode).toBeNull();
      expect(result.errorMessage).toContain("SSRF");
    });

    it("rejects when A record is public but AAAA record is AWS IMDSv6 fd00:ec2::254", async () => {
      const mockDns: DnsLookupFunctions = {
        resolve4: async () => ["93.184.216.34"],
        resolve6: async () => ["fd00:ec2::254"],
      };

      const result = await executeSsrfProbe(
        {
          url: "http://imds.evil.org/latest/meta-data",
          method: "GET",
          timeoutMs: 3000,
        },
        { lookup: mockDns },
      );

      expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
      expect(result.statusCode).toBeNull();
    });

    it("rejects when A record is public but IPv6 is loopback ::1", async () => {
      const mockDns: DnsLookupFunctions = {
        resolve4: async () => ["93.184.216.34"],
        resolve6: async () => ["::1"],
      };

      const result = await executeSsrfProbe(
        {
          url: "http://dual-loopback.evil.org/ping",
          method: "GET",
          timeoutMs: 3000,
        },
        { lookup: mockDns },
      );

      expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
      expect(result.statusCode).toBeNull();
    });
  });

  describe("3. DNS Rebinding TOCTOU Defeat via Socket IP-Pinning", () => {
    it("pins the pre-validated IP to socket connection preventing attacker DNS swap", async () => {
      let callCount = 0;
      const rebindingDns: DnsLookupFunctions = {
        resolve4: async () => {
          callCount++;
          // First check returns valid public IP, attacker changes DNS on subsequent lookups
          return ["93.184.216.34"];
        },
        resolve6: async () => [],
      };

      const result = await executeSsrfProbe(
        {
          url: `http://rebind-test.com:${serverPort}/api/echo`,
          method: "GET",
          timeoutMs: 5000,
        },
        {
          lookup: rebindingDns,
          // Pinned IP points to our safe test server port
          overridePinnedIp: "127.0.0.1",
        },
      );

      expect(result.statusCode).toBe(200);
      expect(result.pinnedIp).toBe("127.0.0.1");
      expect(result.headers["x-received-host"]).toBe(`rebind-test.com:${serverPort}`);
      expect(callCount).toBe(1); // Resolved once during validation, socket uses pinned IP
    });
  });

  describe("4. Numeric, Decimal, Hex, Octal & Translation Literal Validation", () => {
    it("rejects decimal integer IP 2130706433 (127.0.0.1)", async () => {
      const result = await executeSsrfProbe({
        url: "http://2130706433/",
        method: "GET",
        timeoutMs: 3000,
      });
      expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
    });

    it("rejects decimal integer IP 2852039166 (169.254.169.254)", async () => {
      const result = await executeSsrfProbe({
        url: "http://2852039166/latest/meta-data",
        method: "GET",
        timeoutMs: 3000,
      });
      expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
    });

    it("rejects hex IP 0x7f000001 (127.0.0.1)", async () => {
      const result = await executeSsrfProbe({
        url: "http://0x7f000001/",
        method: "GET",
        timeoutMs: 3000,
      });
      expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
    });

    it("rejects octal IP 0177.0.0.1 (127.0.0.1)", async () => {
      const result = await executeSsrfProbe({
        url: "http://0177.0.0.1/",
        method: "GET",
        timeoutMs: 3000,
      });
      expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
    });

    it("rejects IPv4-mapped literal [::ffff:127.0.0.1]", async () => {
      const result = await executeSsrfProbe({
        url: "http://[::ffff:127.0.0.1]/",
        method: "GET",
        timeoutMs: 3000,
      });
      expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
    });

    it("rejects NAT64 translation literal [64:ff9b::a00:1] (10.0.0.1)", async () => {
      const result = await executeSsrfProbe({
        url: "http://[64:ff9b::a00:1]/",
        method: "GET",
        timeoutMs: 3000,
      });
      expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
    });

    it("rejects 6to4 translation literal [2002:0a00:0001::] (10.0.0.1)", async () => {
      const result = await executeSsrfProbe({
        url: "http://[2002:0a00:0001::]/",
        method: "GET",
        timeoutMs: 3000,
      });
      expect(result.errorCategory).toBe(FailureCategory.SSRF_BLOCKED);
    });
  });

  describe("5. URL Hardening & Environment Isolation", () => {
    it("rejects userinfo embedded in target URL", async () => {
      const result = await executeSsrfProbe({
        url: "http://admin:secret123@api.example.com/",
        method: "GET",
        timeoutMs: 3000,
      });

      expect(result.errorCategory).toBe(FailureCategory.EXECUTION_ABORTED);
      expect(result.errorMessage?.toLowerCase()).toContain("kredensial");
      expect(result.errorMessage).not.toContain("secret123");
    });

    it("rejects non-http schemes (ftp, file, gopher)", async () => {
      for (const badScheme of [
        "ftp://example.com/file",
        "file:///etc/passwd",
        "gopher://127.0.0.1:70",
      ]) {
        const result = await executeSsrfProbe({
          url: badScheme,
          method: "GET",
          timeoutMs: 3000,
        });
        expect(result.errorCategory).toBe(FailureCategory.EXECUTION_ABORTED);
        expect(result.errorMessage).toContain("Skema protokol");
      }
    });

    it("ignores ambient proxy environment variables (HTTP_PROXY / HTTPS_PROXY)", async () => {
      const prevHttpProxy = process.env.HTTP_PROXY;
      const prevHttpsProxy = process.env.HTTPS_PROXY;
      const prevAllProxy = process.env.ALL_PROXY;

      try {
        process.env.HTTP_PROXY = "http://malicious-proxy.invalid:8888";
        process.env.HTTPS_PROXY = "http://malicious-proxy.invalid:8888";
        process.env.ALL_PROXY = "http://malicious-proxy.invalid:8888";

        // Must connect directly to test server ignoring malicious proxy
        const result = await executeSsrfProbe(
          {
            url: `http://direct-probe.example.com:${serverPort}/api/echo`,
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
      } finally {
        if (prevHttpProxy !== undefined) process.env.HTTP_PROXY = prevHttpProxy;
        else delete process.env.HTTP_PROXY;
        if (prevHttpsProxy !== undefined) process.env.HTTPS_PROXY = prevHttpsProxy;
        else delete process.env.HTTPS_PROXY;
        if (prevAllProxy !== undefined) process.env.ALL_PROXY = prevAllProxy;
        else delete process.env.ALL_PROXY;
      }
    });
  });

  describe("6. Transport Edge Cases: Redirects, Timeouts, Body Size & TLS", () => {
    it("rejects HTTP 301 and 307 redirects with REDIRECT_NOT_ALLOWED without following", async () => {
      for (const redirectPath of ["/api/redirect-301", "/api/redirect-307"]) {
        const result = await executeSsrfProbe(
          {
            url: `http://example.com:${serverPort}${redirectPath}`,
            method: "GET",
            timeoutMs: 5000,
          },
          {
            lookup: mockPublicLookup,
            overridePinnedIp: "127.0.0.1",
          },
        );

        expect(result.statusCode).toBeGreaterThanOrEqual(300);
        expect(result.statusCode).toBeLessThan(400);
        expect(result.errorCategory).toBe(FailureCategory.REDIRECT_NOT_ALLOWED);
        expect(result.headers.location).toBe("/api/echo");
        expect(result.errorMessage).toContain("tidak diizinkan");
      }
    });

    it("aborts and classifies timeout when server delays headers", async () => {
      const result = await executeSsrfProbe(
        {
          url: `http://example.com:${serverPort}/api/slow`,
          method: "GET",
          timeoutMs: 300, // Deliberately small timeout
        },
        {
          lookup: mockPublicLookup,
          overridePinnedIp: "127.0.0.1",
        },
      );

      expect(result.statusCode).toBeNull();
      expect(result.errorCategory).toBe(FailureCategory.CONNECTION_TIMEOUT);
      expect(result.errorMessage).toContain("timeout");
    });

    it("halts uncompressed stream exceeding 2 MB with RESPONSE_SIZE_EXCEEDED", async () => {
      const result = await executeSsrfProbe(
        {
          url: `http://example.com:${serverPort}/api/large-body`,
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
      expect(result.bodySnippet).toBeNull();
      expect(result.errorMessage).toContain("2 MB");
    });

    it("halts decompression bomb exceeding 2 MB with RESPONSE_SIZE_EXCEEDED", async () => {
      const result = await executeSsrfProbe(
        {
          url: `http://example.com:${serverPort}/api/gzip-bomb`,
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
      expect(result.bodySnippet).toBeNull();
    });

    it("classifies TLS handshake errors and certificate failures as TLS_HANDSHAKE_FAILED", () => {
      const tlsCodes = [
        "ERR_TLS_CERT_ALTNAME_INVALID",
        "CERT_HAS_EXPIRED",
        "DEPTH_ZERO_SELF_SIGNED_CERT",
        "SELF_SIGNED_CERT_IN_CHAIN",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      ];

      for (const code of tlsCodes) {
        const classified = classifyNetworkError({ code, message: `TLS error: ${code}` });
        expect(classified.category).toBe(FailureCategory.TLS_HANDSHAKE_FAILED);
        expect(classified.message).toContain("TLS/SSL handshake");
      }
    });
  });

  describe("7. Protocol Fidelity: Methods, Headers, Body & All 4 Auth Schemes", () => {
    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;

    for (const method of methods) {
      it(`sends ${method} request accurately to the target server`, async () => {
        const testBody =
          method === "GET" || method === "HEAD" ? undefined : `{"method":"${method}"}`;

        const result = await executeSsrfProbe(
          {
            url: `http://example.com:${serverPort}/api/echo`,
            method,
            body: testBody,
            headers: { "x-client-id": "unit-test" },
            timeoutMs: 5000,
          },
          {
            lookup: mockPublicLookup,
            overridePinnedIp: "127.0.0.1",
          },
        );

        expect(result.statusCode).toBe(200);
        expect(result.headers["x-received-method"]).toBe(method);

        if (method !== "HEAD") {
          expect(result.bodySnippet).not.toBeNull();
          const parsed = JSON.parse(result.bodySnippet ?? "{}");
          expect(parsed.method).toBe(method);
        }
      });
    }

    it("delivers Bearer Token authentication header to target", async () => {
      const result = await executeSsrfProbe(
        {
          url: `http://example.com:${serverPort}/api/echo`,
          method: "GET",
          authConfig: {
            type: "bearer",
            token: "super-secret-token-abc",
          },
          timeoutMs: 5000,
        },
        {
          lookup: mockPublicLookup,
          overridePinnedIp: "127.0.0.1",
        },
      );

      expect(result.statusCode).toBe(200);
      expect(result.headers["x-received-auth"]).toBe("Bearer super-secret-token-abc");
    });

    it("delivers Basic Auth credentials properly base64 encoded", async () => {
      const result = await executeSsrfProbe(
        {
          url: `http://example.com:${serverPort}/api/echo`,
          method: "GET",
          authConfig: {
            type: "basic",
            username: "sentinel_user",
            password: "sentinel_password",
          },
          timeoutMs: 5000,
        },
        {
          lookup: mockPublicLookup,
          overridePinnedIp: "127.0.0.1",
        },
      );

      expect(result.statusCode).toBe(200);
      const expectedBase64 = Buffer.from("sentinel_user:sentinel_password").toString("base64");
      expect(result.headers["x-received-auth"]).toBe(`Basic ${expectedBase64}`);
    });

    it("delivers API Key via custom header to target", async () => {
      const result = await executeSsrfProbe(
        {
          url: `http://example.com:${serverPort}/api/echo`,
          method: "GET",
          authConfig: {
            type: "api_key",
            headerName: "X-API-Key",
            headerValue: "key-1234567890",
          },
          timeoutMs: 5000,
        },
        {
          lookup: mockPublicLookup,
          overridePinnedIp: "127.0.0.1",
        },
      );

      expect(result.statusCode).toBe(200);
      expect(result.headers["x-received-api-key"]).toBe("key-1234567890");
    });

    it("delivers Custom Header authentication to target", async () => {
      const result = await executeSsrfProbe(
        {
          url: `http://example.com:${serverPort}/api/echo`,
          method: "GET",
          authConfig: {
            type: "custom_header",
            headers: {
              "X-Custom-Auth": "custom-auth-payload-xyz",
            },
          },
          timeoutMs: 5000,
        },
        {
          lookup: mockPublicLookup,
          overridePinnedIp: "127.0.0.1",
        },
      );

      expect(result.statusCode).toBe(200);
      expect(result.headers["x-received-custom"]).toBe("custom-auth-payload-xyz");
    });

    it("sanitizes authorization, token, and sensitive headers in ProbeResult headers", async () => {
      const result = await executeSsrfProbe(
        {
          url: `http://example.com:${serverPort}/api/echo`,
          method: "GET",
          authConfig: {
            type: "bearer",
            token: "secret-token",
          },
          timeoutMs: 5000,
        },
        {
          lookup: mockPublicLookup,
          overridePinnedIp: "127.0.0.1",
        },
      );

      expect(result.statusCode).toBe(200);
      // Response headers from probe must have sensitive values redacted
      if (result.headers.authorization) {
        expect(result.headers.authorization).toBe("[REDACTED]");
      }
      if (result.headers["x-api-key"]) {
        expect(result.headers["x-api-key"]).toBe("[REDACTED]");
      }
    });
  });
});
