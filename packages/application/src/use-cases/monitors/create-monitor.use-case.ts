import {
  type CreateMonitorRequestDto,
  CreateMonitorRequestSchema,
  type MonitorResponseDto,
} from "@sentinel/contracts";
import {
  EncryptedSecret,
  EndpointUrl,
  type HttpMethod,
  Monitor,
  UUIDv7,
  ValidationException,
} from "@sentinel/domain";
import { toMonitorResponseDto } from "../../mappers/monitor.mapper.js";
import type {
  CreateMonitorCommand,
  CreateMonitorUseCase,
} from "../../ports/in/monitor.use-cases.js";
import { formatMonitorAad } from "../../ports/out/cipher.port.js";
import type {
  CipherPort,
  ClockPort,
  IdGeneratorPort,
  MonitorRepositoryPort,
} from "../../ports/out/index.js";
import { mapAssertionRuleInput } from "./monitor-helpers.js";

export type CreateMonitorInput = CreateMonitorCommand | CreateMonitorRequestDto;

export class CreateMonitor implements CreateMonitorUseCase {
  constructor(
    private readonly monitorRepo: MonitorRepositoryPort,
    private readonly cipher: CipherPort,
    private readonly clock: ClockPort,
    private readonly idGenerator: IdGeneratorPort,
  ) {}

  public async execute(command: CreateMonitorInput): Promise<MonitorResponseDto> {
    const rawInput = "request" in command && command.request ? command.request : command;
    const parseResult = CreateMonitorRequestSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      throw new ValidationException(
        issues[0]?.message ?? "Validasi pembuatan monitor gagal.",
        issues.map((i) => ({
          name: i.path.join("."),
          reason: i.message,
        })),
      );
    }

    const input = parseResult.data;
    const endpointUrl = EndpointUrl.create(input.url);

    const generatedId = this.idGenerator.generate();
    const monitorId = UUIDv7.fromString(generatedId);
    const idStr = monitorId.toString();

    let encryptedHeaders: EncryptedSecret | null = null;
    let headerKeys: readonly string[] = [];
    if (input.customHeaders && Object.keys(input.customHeaders).length > 0) {
      const aad = formatMonitorAad(idStr, "headers");
      const cipherText = await this.cipher.encrypt(JSON.stringify(input.customHeaders), aad);
      encryptedHeaders = new EncryptedSecret(cipherText);
      headerKeys = Object.freeze(Object.keys(input.customHeaders));
    }

    let encryptedBody: EncryptedSecret | null = null;
    if (input.body && input.body.trim().length > 0) {
      const aad = formatMonitorAad(idStr, "body");
      const cipherText = await this.cipher.encrypt(input.body, aad);
      encryptedBody = new EncryptedSecret(cipherText);
    }

    let encryptedAuthConfig: EncryptedSecret | null = null;
    let authType: "NONE" | "BEARER" | "BASIC" | "API_KEY" | "CUSTOM_HEADER" = "NONE";
    if (input.auth && input.auth.type !== "NONE") {
      const aad = formatMonitorAad(idStr, "authConfig");
      const cipherText = await this.cipher.encrypt(JSON.stringify(input.auth), aad);
      encryptedAuthConfig = new EncryptedSecret(cipherText);
      authType = input.auth.type;
    }

    const assertionRules = (input.assertions ?? []).map(mapAssertionRuleInput);
    const intervalSeconds = input.intervalSeconds ?? 60;
    const now = this.clock.now();
    const nextRunAt = new Date(now.getTime() + intervalSeconds * 1000);

    const monitor = new Monitor({
      id: monitorId,
      name: input.name,
      url: endpointUrl,
      method: (input.method ?? "GET") as HttpMethod,
      encryptedHeaders,
      headerKeys,
      encryptedBody,
      encryptedAuthConfig,
      authType,
      assertionRules,
      intervalSeconds,
      timeoutMs: input.timeoutMs ?? 10000,
      isActive: true,
      healthStatus: "UNKNOWN",
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      currentIncidentId: null,
      version: 1,
      lastCheckedAt: null,
      nextRunAt,
    });

    await this.monitorRepo.save(monitor);
    return toMonitorResponseDto(monitor, {
      createdAt: now,
      updatedAt: now,
    });
  }
}
