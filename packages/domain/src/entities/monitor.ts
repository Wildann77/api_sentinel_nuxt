import {
  FailureCategory,
  type HealthStatus,
  type HttpMethod,
  TriggerType,
} from "../enums/index.js";
import { ValidationException } from "../errors/domain-exception.js";
import {
  IncidentFailureCountIncrementedDomainEvent,
  IncidentOpenedDomainEvent,
  IncidentRecoveredDomainEvent,
} from "../events/incident-events.js";
import type { DomainEvent } from "../events/index.js";
import { AssertionRule } from "../value-objects/assertion-rule.js";
import type { AuthType } from "../value-objects/auth-config.js";
import type { EncryptedSecret } from "../value-objects/encrypted-secret.js";
import type { EndpointUrl } from "../value-objects/endpoint-url.js";
import type { UUIDv7 } from "../value-objects/uuid-v7.js";
import type { BaseEntity } from "./base-entity.js";
import type { CheckResult } from "./check-result.js";

export interface MonitorProps {
  readonly id: UUIDv7;
  readonly name: string;
  readonly url: EndpointUrl;
  readonly method: HttpMethod;
  readonly encryptedHeaders?: EncryptedSecret | null;
  readonly headerKeys?: readonly string[];
  readonly encryptedBody?: EncryptedSecret | null;
  readonly encryptedAuthConfig?: EncryptedSecret | null;
  readonly authType?: AuthType;
  readonly assertionRules?: readonly AssertionRule[];
  readonly intervalSeconds: number;
  readonly timeoutMs: number;
  readonly isActive?: boolean;
  readonly healthStatus?: HealthStatus;
  readonly consecutiveFailures?: number;
  readonly consecutiveSuccesses?: number;
  readonly currentIncidentId?: UUIDv7 | null;
  readonly version?: number;
  readonly lastCheckedAt?: Date | null;
  readonly nextRunAt: Date;
}

export class Monitor implements BaseEntity<UUIDv7> {
  public static readonly MIN_INTERVAL_SECONDS = 60;
  public static readonly MAX_INTERVAL_SECONDS = 86400;
  public static readonly MIN_TIMEOUT_MS = 1000;
  public static readonly MAX_TIMEOUT_MS = 30000;
  public static readonly MAX_NAME_LENGTH = 100;

  public static create(props: Omit<MonitorProps, "nextRunAt"> & { nextRunAt?: Date }): Monitor {
    return new Monitor({
      ...props,
      nextRunAt: props.nextRunAt ?? new Date(),
    });
  }

  public readonly id: UUIDv7;
  public name: string;
  public url: EndpointUrl;
  public method: HttpMethod;
  public encryptedHeaders: EncryptedSecret | null;
  public headerKeys: readonly string[];
  public encryptedBody: EncryptedSecret | null;
  public encryptedAuthConfig: EncryptedSecret | null;
  public authType: "NONE" | "BEARER" | "BASIC" | "API_KEY" | "CUSTOM_HEADER";
  public assertionRules: readonly AssertionRule[];
  public intervalSeconds: number;
  public timeoutMs: number;
  public isActive: boolean;
  public healthStatus: HealthStatus;
  public consecutiveFailures: number;
  public consecutiveSuccesses: number;
  public currentIncidentId: UUIDv7 | null;
  public version: number;
  public lastCheckedAt: Date | null;
  public nextRunAt: Date;

  constructor(props: MonitorProps) {
    if (!props.id) {
      throw new ValidationException("ID monitor tidak boleh kosong", [
        { name: "id", reason: "Identitas UUIDv7 wajib disertakan." },
      ]);
    }

    if (!props.name || props.name.trim().length === 0) {
      throw new ValidationException("Nama monitor tidak boleh kosong", [
        { name: "name", reason: "Nama monitor wajib diisi." },
      ]);
    }

    const trimmedName = props.name.trim();
    if (trimmedName.length > Monitor.MAX_NAME_LENGTH) {
      throw new ValidationException(
        `Nama monitor melampaui batas maksimum ${Monitor.MAX_NAME_LENGTH} karakter`,
        [{ name: "name", reason: `Nama monitor maksimal ${Monitor.MAX_NAME_LENGTH} karakter.` }],
      );
    }

    if (
      typeof props.intervalSeconds !== "number" ||
      props.intervalSeconds < Monitor.MIN_INTERVAL_SECONDS ||
      props.intervalSeconds > Monitor.MAX_INTERVAL_SECONDS
    ) {
      throw new ValidationException(
        `Interval pemeriksaan harus antara ${Monitor.MIN_INTERVAL_SECONDS} dan ${Monitor.MAX_INTERVAL_SECONDS} detik`,
        [
          {
            name: "intervalSeconds",
            reason: `Interval harus antara ${Monitor.MIN_INTERVAL_SECONDS} - ${Monitor.MAX_INTERVAL_SECONDS} detik.`,
          },
        ],
      );
    }

    if (
      typeof props.timeoutMs !== "number" ||
      props.timeoutMs < Monitor.MIN_TIMEOUT_MS ||
      props.timeoutMs > Monitor.MAX_TIMEOUT_MS
    ) {
      throw new ValidationException(
        `Timeout pemeriksaan harus antara ${Monitor.MIN_TIMEOUT_MS} dan ${Monitor.MAX_TIMEOUT_MS} ms`,
        [
          {
            name: "timeoutMs",
            reason: `Timeout harus antara ${Monitor.MIN_TIMEOUT_MS} - ${Monitor.MAX_TIMEOUT_MS} milidetik.`,
          },
        ],
      );
    }

    const rules = props.assertionRules ?? [];
    if (rules.length > AssertionRule.MAX_RULES_PER_MONITOR) {
      throw new ValidationException(
        `Jumlah assertion (${rules.length}) melebihi batas maksimum ${AssertionRule.MAX_RULES_PER_MONITOR}`,
        [
          {
            name: "assertionRules",
            reason: `Maksimum ${AssertionRule.MAX_RULES_PER_MONITOR} aturan validasi per monitor.`,
          },
        ],
      );
    }

    this.id = props.id;
    this.name = trimmedName;
    this.url = props.url;
    this.method = props.method;
    this.encryptedHeaders = props.encryptedHeaders ?? null;
    this.headerKeys = Object.freeze([...(props.headerKeys ?? [])]);
    this.encryptedBody = props.encryptedBody ?? null;
    this.encryptedAuthConfig = props.encryptedAuthConfig ?? null;
    this.authType = (props.authType ? props.authType.toUpperCase() : "NONE") as
      | "NONE"
      | "BEARER"
      | "BASIC"
      | "API_KEY"
      | "CUSTOM_HEADER";
    this.assertionRules = Object.freeze([...rules]);
    this.intervalSeconds = props.intervalSeconds;
    this.timeoutMs = props.timeoutMs;
    this.isActive = props.isActive ?? true;
    this.healthStatus = props.healthStatus ?? "UNKNOWN";
    this.consecutiveFailures = Math.max(0, props.consecutiveFailures ?? 0);
    this.consecutiveSuccesses = Math.max(0, props.consecutiveSuccesses ?? 0);
    this.currentIncidentId = props.currentIncidentId ?? null;
    this.version = Math.max(1, props.version ?? 1);
    this.lastCheckedAt = props.lastCheckedAt ?? null;
    this.nextRunAt = props.nextRunAt;
  }

  public recordCheckFailure(result: CheckResult, newIncidentId: UUIDv7): DomainEvent[] {
    if (result.triggerType === TriggerType.MANUAL) {
      throw new ValidationException(
        "Pemeriksaan manual tidak boleh memicu transisi state kesehatan agregat Monitor (D-13)",
        [
          {
            name: "triggerType",
            reason: "Hasil pemeriksaan MANUAL terisolasi dari state agregat.",
          },
        ],
      );
    }

    this.consecutiveFailures += 1;
    this.consecutiveSuccesses = 0;
    this.lastCheckedAt = result.finishedAt;

    if (this.healthStatus !== "DOWN") {
      if (this.consecutiveFailures < 3) {
        this.healthStatus = "DEGRADED";
        return [];
      }

      this.healthStatus = "DOWN";
      this.currentIncidentId = newIncidentId;
      const category = result.failureCategory ?? FailureCategory.HTTP_STATUS_MISMATCH;
      const message = result.sanitizedDiagnostic ?? "Pemeriksaan monitor gagal";
      return [
        new IncidentOpenedDomainEvent(this.id, newIncidentId, category, message, result.finishedAt),
      ];
    }

    return [
      new IncidentFailureCountIncrementedDomainEvent(
        this.id,
        this.currentIncidentId ?? newIncidentId,
        this.consecutiveFailures,
        result.finishedAt,
      ),
    ];
  }

  public recordCheckSuccess(result: CheckResult): DomainEvent[] {
    if (result.triggerType === TriggerType.MANUAL) {
      throw new ValidationException(
        "Pemeriksaan manual tidak boleh memicu transisi state kesehatan agregat Monitor (D-13)",
        [
          {
            name: "triggerType",
            reason: "Hasil pemeriksaan MANUAL terisolasi dari state agregat.",
          },
        ],
      );
    }

    this.consecutiveSuccesses += 1;
    this.consecutiveFailures = 0;
    this.lastCheckedAt = result.finishedAt;

    if (this.healthStatus === "DOWN") {
      if (this.consecutiveSuccesses < 2) {
        return [];
      }

      this.healthStatus = "UP";
      const resolvedIncidentId = this.currentIncidentId;
      this.currentIncidentId = null;

      if (resolvedIncidentId) {
        return [new IncidentRecoveredDomainEvent(this.id, resolvedIncidentId, result.finishedAt)];
      }
      return [];
    }

    this.healthStatus = "UP";
    return [];
  }

  public pause(): void {
    this.isActive = false;
    this.healthStatus = "PAUSED";
    this.version += 1;
  }

  public resume(now: Date): void {
    this.isActive = true;
    this.healthStatus = "UNKNOWN";
    this.nextRunAt = now;
    this.version += 1;
  }

  public computeNextRun(
    baseDate: Date,
    intervalSeconds: number = this.intervalSeconds,
    jitterPercent?: number,
  ): Date {
    const clampedJitter =
      jitterPercent !== undefined
        ? Math.max(-0.05, Math.min(0.05, jitterPercent))
        : Math.random() * 0.1 - 0.05;

    const deltaSeconds = Math.round(intervalSeconds * (1 + clampedJitter));
    return new Date(baseDate.getTime() + deltaSeconds * 1000);
  }
}
