import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import zlib from "node:zlib";

export interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export interface MockHttpServerOptions {
  port?: number;
}

export class MockHttpServer {
  private server: Server | null = null;
  private requests: RecordedRequest[] = [];
  private customHandlers: Array<
    (req: IncomingMessage, res: ServerResponse) => Promise<boolean> | boolean
  > = [];
  private baseUrl = "";

  public async start(options: MockHttpServerOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", async () => {
          this.requests.push({
            method: req.method ?? "GET",
            url: req.url ?? "/",
            headers: req.headers,
            body,
          });

          for (const handler of this.customHandlers) {
            const handled = await handler(req, res);
            if (handled) return;
          }

          const parsedUrl = new URL(req.url ?? "/", "http://127.0.0.1");

          if (parsedUrl.pathname === "/slow") {
            const delay = Number.parseInt(parsedUrl.searchParams.get("ms") ?? "1000", 10);
            setTimeout(() => {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ delayed: delay }));
            }, delay);
            return;
          }

          if (parsedUrl.pathname === "/large") {
            const sizeBytes = Number.parseInt(parsedUrl.searchParams.get("bytes") ?? "1048576", 10);
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("A".repeat(sizeBytes));
            return;
          }

          if (parsedUrl.pathname === "/gzip") {
            const payload = JSON.stringify({ compressed: true, timestamp: Date.now() });
            zlib.gzip(payload, (_err, buffer) => {
              res.writeHead(200, {
                "Content-Type": "application/json",
                "Content-Encoding": "gzip",
              });
              res.end(buffer);
            });
            return;
          }

          if (parsedUrl.pathname === "/redirect") {
            const target = parsedUrl.searchParams.get("target") ?? "/status/200";
            const status = Number.parseInt(parsedUrl.searchParams.get("status") ?? "302", 10);
            res.writeHead(status, { Location: target });
            res.end();
            return;
          }

          if (parsedUrl.pathname.startsWith("/status/")) {
            const statusCode = Number.parseInt(parsedUrl.pathname.replace("/status/", ""), 10);
            res.writeHead(Number.isNaN(statusCode) ? 200 : statusCode, {
              "Content-Type": "application/json",
            });
            res.end(JSON.stringify({ status: statusCode }));
            return;
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, url: req.url }));
        });
      });

      this.server.listen(options.port ?? 0, "127.0.0.1", () => {
        const addr = this.server?.address();
        if (typeof addr === "object" && addr !== null) {
          this.baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve(this.baseUrl);
        } else {
          reject(new Error("Failed to resolve server address"));
        }
      });

      this.server.on("error", reject);
    });
  }

  public addHandler(
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean> | boolean,
  ): void {
    this.customHandlers.unshift(handler);
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getRequests(): readonly RecordedRequest[] {
    return this.requests;
  }

  public clearRequests(): void {
    this.requests = [];
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) reject(err);
        else {
          this.server = null;
          resolve();
        }
      });
    });
  }
}
