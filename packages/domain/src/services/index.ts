export interface DomainService {
  readonly serviceName: string;
}

export * from "./assertion-engine.js";
export * from "./diagnostic-sanitizer.js";
export * from "./header-policy.js";
export * from "./json-path.js";
export * from "./network-policy.js";
export * from "./uptime-calculator.js";
