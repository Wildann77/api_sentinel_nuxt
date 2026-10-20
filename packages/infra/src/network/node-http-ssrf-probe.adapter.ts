import type { NetworkProbePort, ProbeRequest, ProbeResult } from "@sentinel/application";
import type { DnsLookupFunctions } from "./dns-resolver.js";
import { executeSsrfProbe } from "./probe-executor.js";

export class NodeHttpSsrfProbeAdapter implements NetworkProbePort {
  readonly isSsrfSafe = true;

  constructor(private readonly lookup?: DnsLookupFunctions) {}

  public async probe(request: ProbeRequest): Promise<ProbeResult> {
    return executeSsrfProbe(request, { lookup: this.lookup });
  }
}
