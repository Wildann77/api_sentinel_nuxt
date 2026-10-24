export interface ValueObject<TProps> {
  readonly props: Readonly<TProps>;
}

export * from "./assertion-rule.js";
export * from "./auth-config.js";
export * from "./encrypted-secret.js";
export * from "./endpoint-url.js";
export * from "./uuid-v7.js";
