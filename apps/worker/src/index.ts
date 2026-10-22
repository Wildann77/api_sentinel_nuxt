import { APPLICATION_VERSION } from "@sentinel/application";
import { CONTRACTS_VERSION } from "@sentinel/contracts";
import { DOMAIN_VERSION } from "@sentinel/domain";
import { INFRA_VERSION } from "@sentinel/infra";

export * from "./container.js";
export * from "./jobs/index.js";
export * from "./scheduler.js";

export const WORKER_APP_VERSION = "0.1.0";
export const WORKER_METADATA = {
  contractsVersion: CONTRACTS_VERSION,
  domainVersion: DOMAIN_VERSION,
  applicationVersion: APPLICATION_VERSION,
  infraVersion: INFRA_VERSION,
};
