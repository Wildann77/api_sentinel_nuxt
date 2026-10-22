import type { IncomingMessage, ServerResponse } from "node:http";
import { MockHttpServer, type RecordedRequest } from "./mock-http-server";

export interface TelegramSentMessage {
  chatId: string | number;
  text: string;
  parseMode?: string;
  token: string;
  rawRequest: RecordedRequest;
}

export type TelegramBehaviorMode =
  | { type: "success"; messageId?: number }
  | { type: "rate_limit"; retryAfterSeconds: number }
  | { type: "error"; statusCode: number; description: string }
  | { type: "unauthorized" };

export class MockTelegramServer {
  private server = new MockHttpServer();
  private sentMessages: TelegramSentMessage[] = [];
  private currentMode: TelegramBehaviorMode = { type: "success", messageId: 1001 };
  private messageIdCounter = 1000;

  public async start(): Promise<string> {
    const baseUrl = await this.server.start();

    this.server.addHandler((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? "";
      const botMatch = url.match(/^\/bot([^/]+)\/sendMessage/);

      if (!botMatch) {
        return false;
      }

      const token = botMatch[1];
      const reqList = this.server.getRequests();
      const lastReq = reqList[reqList.length - 1];

      let parsedBody: Record<string, unknown> = {};
      try {
        parsedBody = JSON.parse(lastReq.body);
      } catch {
        parsedBody = {};
      }

      this.sentMessages.push({
        token,
        chatId: (parsedBody.chat_id as string | number) ?? "",
        text: (parsedBody.text as string) ?? "",
        parseMode: parsedBody.parse_mode as string | undefined,
        rawRequest: lastReq,
      });

      if (this.currentMode.type === "rate_limit") {
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": String(this.currentMode.retryAfterSeconds),
        });
        res.end(
          JSON.stringify({
            ok: false,
            error_code: 429,
            description: `Too Many Requests: retry after ${this.currentMode.retryAfterSeconds}`,
            parameters: {
              retry_after: this.currentMode.retryAfterSeconds,
            },
          }),
        );
        return true;
      }

      if (this.currentMode.type === "unauthorized") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error_code: 401,
            description: "Unauthorized",
          }),
        );
        return true;
      }

      if (this.currentMode.type === "error") {
        res.writeHead(this.currentMode.statusCode, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error_code: this.currentMode.statusCode,
            description: this.currentMode.description,
          }),
        );
        return true;
      }

      this.messageIdCounter += 1;
      const messageId = this.currentMode.messageId ?? this.messageIdCounter;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          result: {
            message_id: messageId,
            date: Math.floor(Date.now() / 1000),
            chat: { id: parsedBody.chat_id },
            text: parsedBody.text,
          },
        }),
      );
      return true;
    });

    return baseUrl;
  }

  public setMode(mode: TelegramBehaviorMode): void {
    this.currentMode = mode;
  }

  public getBaseUrl(): string {
    return this.server.getBaseUrl();
  }

  public getSentMessages(): readonly TelegramSentMessage[] {
    return this.sentMessages;
  }

  public clearSentMessages(): void {
    this.sentMessages = [];
  }

  public async stop(): Promise<void> {
    await this.server.stop();
  }
}
