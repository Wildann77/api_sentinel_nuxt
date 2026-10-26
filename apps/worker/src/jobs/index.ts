export interface JobHandler {
  readonly jobName: string;
}

export * from "./maintenance.job.js";
export * from "./notification.job.js";
export * from "./probe-check.job.js";
