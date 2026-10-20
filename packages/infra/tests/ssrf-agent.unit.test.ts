import type * as dns from "node:dns";
import * as http from "node:http";
import * as https from "node:https";
import { FailureCategory } from "@sentinel/domain";
import { describe, expect, it } from "vitest";
import {
  CONNECT_TIMEOUT_MS,
  ConnectionTimeoutException,
  createPinnedLookup,
  createSsrfAgent,
  HEADERS_TIMEOUT_MS,
  HeadersTimeoutException,
} from "../src/network/ssrf-agent.js";

describe("P6.3 — Agent Socket IP-Pinning Unit Tests", () => {
  it("createPinnedLookup resolves IPv4 to pinned numeric IP", async () => {
    const lookup = createPinnedLookup("93.184.216.34");

    const singleResult = await new Promise<{ address: string; family: number }>(
      (resolve, reject) => {
        lookup("example.com", {}, (err, address, family) => {
          if (err) return reject(err);
          resolve({ address: address as string, family: family ?? 4 });
        });
      },
    );

    expect(singleResult.address).toBe("93.184.216.34");
    expect(singleResult.family).toBe(4);
  });

  it("createPinnedLookup resolves IPv6 to pinned numeric IP", async () => {
    const lookup = createPinnedLookup("2606:2800:220:1:248:1893:25c8:1946");

    const singleResult = await new Promise<{ address: string; family: number }>(
      (resolve, reject) => {
        lookup("example.com", {}, (err, address, family) => {
          if (err) return reject(err);
          resolve({ address: address as string, family: family ?? 6 });
        });
      },
    );

    expect(singleResult.address).toBe("2606:2800:220:1:248:1893:25c8:1946");
    expect(singleResult.family).toBe(6);
  });

  it("createPinnedLookup handles { all: true } option correctly", async () => {
    const lookup = createPinnedLookup("93.184.216.34");

    const multiResult = await new Promise<dns.LookupAddress[]>((resolve, reject) => {
      lookup("example.com", { all: true }, (err, addresses) => {
        if (err) return reject(err);
        resolve(addresses as dns.LookupAddress[]);
      });
    });

    expect(multiResult).toHaveLength(1);
    expect(multiResult[0]?.address).toBe("93.184.216.34");
    expect(multiResult[0]?.family).toBe(4);
  });

  it("createPinnedLookup throws error if pinnedIp is not a valid IP", () => {
    expect(() => createPinnedLookup("not-an-ip.com")).toThrow("bukan alamat IP numerik");
  });

  it("createSsrfAgent configures http.Agent with pinned lookup and keepAlive=false", () => {
    const agent = createSsrfAgent({
      pinnedIp: "93.184.216.34",
      isHttps: false,
      originalHostname: "api.example.com",
    });

    expect(agent).toBeInstanceOf(http.Agent);
    expect(agent.maxSockets).toBe(1);
    expect((agent as unknown as { keepAlive: boolean }).keepAlive).toBe(false);
  });

  it("createSsrfAgent configures https.Agent with servername SNI and pinned lookup", () => {
    const agent = createSsrfAgent({
      pinnedIp: "93.184.216.34",
      isHttps: true,
      originalHostname: "secure.example.com",
    });

    expect(agent).toBeInstanceOf(https.Agent);
    expect(agent.maxSockets).toBe(1);
    expect((agent as unknown as { servername: string }).servername).toBe("secure.example.com");
  });

  it("defines connection and headers timeout exceptions with CONNECTION_TIMEOUT category", () => {
    const connErr = new ConnectionTimeoutException();
    expect(connErr.category).toBe(FailureCategory.CONNECTION_TIMEOUT);
    expect(connErr.name).toBe("ConnectionTimeoutException");
    expect(CONNECT_TIMEOUT_MS).toBe(5000);

    const headersErr = new HeadersTimeoutException();
    expect(headersErr.category).toBe(FailureCategory.CONNECTION_TIMEOUT);
    expect(headersErr.name).toBe("HeadersTimeoutException");
    expect(HEADERS_TIMEOUT_MS).toBe(5000);
  });
});
