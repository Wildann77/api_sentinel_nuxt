import {
  type MonitorResponseDto,
  type UpdateMonitorRequestDto,
  UpdateMonitorRequestSchema,
} from "@sentinel/contracts";
import {
  ConflictException,
  EncryptedSecret,
  EndpointUrl,
  EntityNotFoundException,
  type HttpMethod,
  Monitor,
  ValidationException,
} from "@sentinel/domain";
import { toMonitorResponseDto } from "../../mappers/monitor.mapper.js";
import type {
  UpdateMonitorCommand,
  UpdateMonitorUseCase,
} from "../../ports/in/monitor.use-cases.js";
import { formatMonitorAad } from "../../ports/out/cipher.port.js";
import type { CipherPort, ClockPort, MonitorRepositoryPort } from "../../ports/out/index.js";
import { isMaskedSecret, mapAssertionRuleInput } from "./monitor-helpers.js";

export type UpdateMonitorInput = UpdateMonitorCommand | ({ id: string } & UpdateMonitorRequestDto);

export class UpdateMonitor implements UpdateMonitorUseCase {
  constructor(
    private readonly monitorRepo: MonitorRepositoryPort,
    private readonly cipher: CipherPort,
    private readonly clock: ClockPort,
  ) {}

  public async execute(command: UpdateMonitorInput): Promise<MonitorResponseDto> {
    const id = command.id;
    if (!id || typeof id !== "string") {
      throw new ValidationException("ID monitor wajib disertakan.", [
        { name: "id", reason: "Identitas monitor wajib diisi." },
      ]);
    }

    const rawInput = "request" in command && command.request ? command.request : command;
    const parseResult = UpdateMonitorRequestSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      throw new ValidationException(
        issues[0]?.message ?? "Validasi pembaruan monitor gagal.",
        issues.map((i) => ({
          name: i.path.join("."),
          reason: i.message,
        })),
      );
    }

    const input = parseResult.data;
    const existing = await this.monitorRepo.findById(id);
    if (!existing) {
      throw new EntityNotFoundException(`Monitor dengan ID "${id}" tidak ditemukan.`);
    }

    if (input.version !== undefined && input.version !== existing.version) {
      throw new ConflictException(
        `Monitor ${id} mengalami konflik konkurensi versi (OCC mismatch). Versi client (${input.version}) tidak sesuai versi database (${existing.version}).`,
      );
    }

    const monitorIdStr = existing.id.toString();
    const endpointUrl = input.url ? EndpointUrl.create(input.url) : existing.url;

    // Headers & secrets re-encryption logic
    let encryptedHeaders = existing.encryptedHeaders;
    let headerKeys = existing.headerKeys;

    if (input.customHeaders !== undefined) {
      if (input.customHeaders === null || Object.keys(input.customHeaders).length === 0) {
        encryptedHeaders = null;
        headerKeys = [];
      } else {
        const values = Object.values(input.customHeaders);
        const allMasked = values.length > 0 && values.every(isMaskedSecret);
        if (!allMasked || !existing.encryptedHeaders) {
          const aad = formatMonitorAad(monitorIdStr, "headers");
          const cipherText = await this.cipher.encrypt(JSON.stringify(input.customHeaders), aad);
          encryptedHeaders = new EncryptedSecret(cipherText);
          headerKeys = Object.freeze(Object.keys(input.customHeaders));
        }
      }
    }

    // Body re-encryption logic
    let encryptedBody = existing.encryptedBody;
    if (input.body !== undefined) {
      if (input.body === null || input.body.trim().length === 0) {
        encryptedBody = null;
      } else if (!isMaskedSecret(input.body) || !existing.encryptedBody) {
        const aad = formatMonitorAad(monitorIdStr, "body");
        const cipherText = await this.cipher.encrypt(input.body, aad);
        encryptedBody = new EncryptedSecret(cipherText);
      }
    }

    // AuthConfig re-encryption logic
    let encryptedAuthConfig = existing.encryptedAuthConfig;
    let authType = existing.authType;

    if (input.auth !== undefined) {
      if (input.auth.type === "NONE") {
        encryptedAuthConfig = null;
        authType = "NONE";
      } else {
        let hasMasked = false;
        if (input.auth.type === "BEARER") {
          hasMasked = isMaskedSecret(input.auth.token);
        } else if (input.auth.type === "BASIC") {
          hasMasked = isMaskedSecret(input.auth.password);
        } else if (input.auth.type === "API_KEY") {
          hasMasked = isMaskedSecret(input.auth.apiKey);
        } else if (input.auth.type === "CUSTOM_HEADER") {
          hasMasked = Object.values(input.auth.headers).some(isMaskedSecret);
        }

        if (hasMasked && existing.encryptedAuthConfig && existing.authType === input.auth.type) {
          // Retain existing encrypted secret without re-encrypting
        } else {
          const aad = formatMonitorAad(monitorIdStr, "authConfig");
          const cipherText = await this.cipher.encrypt(JSON.stringify(input.auth), aad);
          encryptedAuthConfig = new EncryptedSecret(cipherText);
          authType = input.auth.type;
        }
      }
    }

    const assertionRules =
      input.assertions !== undefined
        ? Object.freeze(input.assertions.map(mapAssertionRuleInput))
        : existing.assertionRules;

    const intervalSeconds = input.intervalSeconds ?? existing.intervalSeconds;
    const now = this.clock.now();
    const nextRunAt =
      input.intervalSeconds !== undefined && input.intervalSeconds !== existing.intervalSeconds
        ? new Date(now.getTime() + intervalSeconds * 1000)
        : existing.nextRunAt;

    const updated = new Monitor({
      id: existing.id,
      name: input.name ?? existing.name,
      url: endpointUrl,
      method: (input.method ?? existing.method) as HttpMethod,
      encryptedHeaders,
      headerKeys,
      encryptedBody,
      encryptedAuthConfig,
      authType,
      assertionRules,
      intervalSeconds,
      timeoutMs: input.timeoutMs ?? existing.timeoutMs,
      isActive: input.isActive ?? existing.isActive,
      healthStatus: existing.healthStatus,
      consecutiveFailures: existing.consecutiveFailures,
      consecutiveSuccesses: existing.consecutiveSuccesses,
      currentIncidentId: existing.currentIncidentId,
      version: existing.version + 1,
      lastCheckedAt: existing.lastCheckedAt,
      nextRunAt,
    });

    await this.monitorRepo.update(updated);
    return toMonitorResponseDto(updated, {
      updatedAt: now,
    });
  }
}
