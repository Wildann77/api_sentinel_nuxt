import type * as dns from "node:dns";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import { FailureCategory } from "@sentinel/domain";

export const CONNECT_TIMEOUT_MS = 5_000;
export const HEADERS_TIMEOUT_MS = 5_000;

export class ConnectionTimeoutException extends Error {
  readonly category = FailureCategory.CONNECTION_TIMEOUT;

  constructor(message = "Koneksi jaringan TCP timeout melebihi batas 5.000 ms.") {
    super(message);
    this.name = "ConnectionTimeoutException";
  }
}

export class HeadersTimeoutException extends Error {
  readonly category = FailureCategory.CONNECTION_TIMEOUT;

  constructor(message = "Penerimaan header respons HTTP timeout melebihi batas 5.000 ms.") {
    super(message);
    this.name = "HeadersTimeoutException";
  }
}

export interface CreateSsrfAgentOptions {
  readonly pinnedIp: string;
  readonly isHttps: boolean;
  readonly originalHostname: string;
  readonly keepAlive?: boolean;
}

export type PinnedLookupFunction = (
  hostname: string,
  options: dns.LookupOptions | undefined,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number,
  ) => void,
) => void;

export function createPinnedLookup(pinnedIp: string): PinnedLookupFunction {
  const family = net.isIP(pinnedIp);
  if (family === 0) {
    throw new Error(`Pinned IP "${pinnedIp}" bukan alamat IP numerik IPv4/IPv6 valid.`);
  }

  return (
    _hostname: string,
    options: dns.LookupOptions | undefined,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | dns.LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    if (options && typeof options === "object" && (options as { all?: boolean }).all) {
      callback(null, [{ address: pinnedIp, family }]);
    } else {
      callback(null, pinnedIp, family);
    }
  };
}

export function createSsrfAgent(options: CreateSsrfAgentOptions): http.Agent | https.Agent {
  const lookup = createPinnedLookup(options.pinnedIp);
  const keepAlive = options.keepAlive ?? false;

  if (options.isHttps) {
    const agent = new https.Agent({
      keepAlive,
      maxSockets: 1,
      servername: options.originalHostname,
      lookup,
    });
    (agent as unknown as { servername?: string }).servername = options.originalHostname;
    return agent;
  }

  return new http.Agent({
    keepAlive,
    maxSockets: 1,
    lookup,
  });
}
