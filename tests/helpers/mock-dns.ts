import type * as dns from "node:dns";

export interface MockDnsRecord {
  address: string;
  family: 4 | 6;
}

export class MockDnsResolver {
  private hostMap: Map<string, MockDnsRecord[]> = new Map();
  private queryCountMap: Map<string, number> = new Map();
  private rebindingMap: Map<string, MockDnsRecord[][]> = new Map();

  public setRecords(hostname: string, records: MockDnsRecord[]): void {
    this.hostMap.set(hostname.toLowerCase(), records);
  }

  public setRebinding(hostname: string, sequence: MockDnsRecord[][]): void {
    this.rebindingMap.set(hostname.toLowerCase(), sequence);
  }

  public resolve(hostname: string): MockDnsRecord[] {
    const key = hostname.toLowerCase();
    const count = this.queryCountMap.get(key) ?? 0;
    this.queryCountMap.set(key, count + 1);

    const rebindingSequence = this.rebindingMap.get(key);
    if (rebindingSequence && rebindingSequence.length > 0) {
      const idx = Math.min(count, rebindingSequence.length - 1);
      return rebindingSequence[idx];
    }

    const records = this.hostMap.get(key);
    if (records) {
      return records;
    }

    // Default fallback: loopback for localhost, otherwise empty
    if (key === "localhost") {
      return [{ address: "127.0.0.1", family: 4 }];
    }

    return [];
  }

  public createCustomLookup(): typeof dns.lookup {
    const customLookup = ((
      hostname: string,
      optionsOrCb: unknown,
      callbackOrUndefined?: unknown,
    ) => {
      let options: dns.LookupOptions = {};
      let cb: (err: NodeJS.ErrnoException | null, address: unknown, family?: unknown) => void;

      if (typeof optionsOrCb === "function") {
        cb = optionsOrCb as typeof cb;
      } else {
        options = (optionsOrCb as dns.LookupOptions) ?? {};
        cb = callbackOrUndefined as typeof cb;
      }

      const records = this.resolve(hostname);
      if (records.length === 0) {
        const error = new Error(`getaddrinfo ENOTFOUND ${hostname}`) as NodeJS.ErrnoException;
        error.code = "ENOTFOUND";
        cb(error, null);
        return;
      }

      if (options.all) {
        const result = records.map((r) => ({ address: r.address, family: r.family }));
        cb(null, result);
        return;
      }

      const first = records[0];
      cb(null, first.address, first.family);
    }) as unknown as typeof dns.lookup;

    return customLookup;
  }

  public getQueryCount(hostname: string): number {
    return this.queryCountMap.get(hostname.toLowerCase()) ?? 0;
  }

  public reset(): void {
    this.hostMap.clear();
    this.queryCountMap.clear();
    this.rebindingMap.clear();
  }
}
