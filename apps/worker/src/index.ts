import path from "node:path";
import { fileURLToPath } from "node:url";
import { APPLICATION_VERSION } from "@sentinel/application";
import { CONTRACTS_VERSION } from "@sentinel/contracts";
import { DOMAIN_VERSION } from "@sentinel/domain";
import { INFRA_VERSION, initTelemetry, shutdownTelemetry } from "@sentinel/infra";
import { buildWorkerContainer, type WorkerContainer } from "./container.js";

export * from "./container.js";
export * from "./heartbeat.js";
export * from "./http-server.js";
export * from "./jobs/index.js";
export * from "./scheduler.js";

export const WORKER_APP_VERSION = "0.1.0";
export const WORKER_METADATA = {
  contractsVersion: CONTRACTS_VERSION,
  domainVersion: DOMAIN_VERSION,
  applicationVersion: APPLICATION_VERSION,
  infraVersion: INFRA_VERSION,
};

export interface BootstrapResult {
  readonly container: WorkerContainer;
  readonly shutdown: () => Promise<void>;
}

export async function bootstrapWorker(
  rawEnv: Record<string, unknown> = process.env,
): Promise<BootstrapResult> {
  await initTelemetry({ serviceName: "api-sentinel-worker" });

  const container = buildWorkerContainer(rawEnv);
  await container.start();

  let isShuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    container.logger.info("Graceful shutdown triggered");
    await container.dispose();
    await shutdownTelemetry();
  };

  const onSignal = async (signal: string): Promise<void> => {
    container.logger.info(`Received ${signal}, shutting down gracefully...`, { signal });
    await shutdown();
    process.exit(0);
  };

  process.once("SIGTERM", () => void onSignal("SIGTERM"));
  process.once("SIGINT", () => void onSignal("SIGINT"));

  return {
    container,
    shutdown,
  };
}

const isDirectRun = (): boolean => {
  if (!process.argv[1]) {
    return false;
  }
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    const entryFilePath = path.resolve(process.argv[1]);
    return currentFilePath === entryFilePath;
  } catch {
    return false;
  }
};

if (isDirectRun()) {
  bootstrapWorker().catch((error) => {
    console.error("Worker fatal error on bootstrap:", error);
    process.exit(1);
  });
}
