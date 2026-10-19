export interface UseCase<TCommand, TResult> {
  execute(command: TCommand): Promise<TResult>;
}

export * from "./auth/index.js";
export * from "./checks/index.js";
export * from "./incidents/index.js";
export * from "./metrics/index.js";
export * from "./monitors/index.js";
export * from "./reports/index.js";
export * from "./settings/index.js";
