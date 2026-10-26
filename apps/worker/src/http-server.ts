import http from "node:http";
import type { LoggerPort } from "@sentinel/application";
import { getSentinelMetrics } from "@sentinel/infra";

export interface WorkerHttpServerDeps {
  readonly port: number;
  readonly workerId: string;
  readonly getHeartbeatEpoch: () => number;
  readonly getRunningJobs: () => number;
  readonly getJobLagSeconds?: () => number;
  readonly checkHealth?: () => Promise<boolean>;
  readonly logger: LoggerPort;
}

export class WorkerHttpServer {
  private server: http.Server | null = null;
  private readonly startTime: number = Date.now();

  constructor(private readonly deps: WorkerHttpServerDeps) {}

  public get port(): number {
    if (this.server) {
      const addr = this.server.address();
      if (addr && typeof addr === "object") {
        return addr.port;
      }
    }
    return this.deps.port;
  }

  public async start(): Promise<void> {
    if (this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        const url = req.url?.split("?")[0];
        const method = req.method?.toUpperCase();

        if (method === "GET" && url === "/healthz") {
          await this.handleHealthz(res);
          return;
        }

        if (method === "GET" && url === "/metrics") {
          await this.handleMetrics(res);
          return;
        }

        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Not Found" }));
      });

      server.on("error", (err) => {
        this.deps.logger.error("Worker HTTP server error", {
          err: err.message,
          port: this.deps.port,
        });
        reject(err);
      });

      server.listen(this.deps.port, () => {
        this.server = server;
        this.deps.logger.info("Worker HTTP server listening for /healthz and /metrics", {
          port: this.deps.port,
          workerId: this.deps.workerId,
        });
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    const currentServer = this.server;
    this.server = null;

    return new Promise((resolve) => {
      currentServer.close(() => {
        resolve();
      });
    });
  }

  private async handleHealthz(res: http.ServerResponse): Promise<void> {
    try {
      const isHealthy = this.deps.checkHealth ? await this.deps.checkHealth() : true;

      if (!isHealthy) {
        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            status: "unhealthy",
            workerId: this.deps.workerId,
            timestamp: new Date().toISOString(),
          }),
        );
        return;
      }

      const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "ok",
          workerId: this.deps.workerId,
          uptimeSeconds,
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (error) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "error",
          workerId: this.deps.workerId,
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  private async handleMetrics(res: http.ServerResponse): Promise<void> {
    const metrics = getSentinelMetrics();
    const workerId = this.deps.workerId;
    const epoch = this.deps.getHeartbeatEpoch();
    const activeJobs = this.deps.getRunningJobs();
    const lagSeconds = this.deps.getJobLagSeconds ? this.deps.getJobLagSeconds() : 0;
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    metrics.setWorkerHeartbeat({
      workerId,
      timestampEpochSeconds: epoch,
    });
    metrics.setJobLag({
      queue: "probe:check",
      lagSeconds,
    });
    metrics.setWorkerActiveJobs(workerId, activeJobs);
    metrics.setWorkerUptime(workerId, uptimeSeconds);

    const body = await metrics.getMetrics();
    res.statusCode = 200;
    res.setHeader("Content-Type", metrics.getContentType());
    res.end(body);
  }
}
