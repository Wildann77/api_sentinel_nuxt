import type { FailureCategory, TriggerType } from "../enums/index.js";
import { ValidationException } from "../errors/domain-exception.js";
import type { AssertionExecutionResult } from "../services/assertion-engine.js";
import { sanitizeDiagnostic } from "../services/diagnostic-sanitizer.js";
import type { UUIDv7 } from "../value-objects/uuid-v7.js";
import type { BaseEntity } from "./base-entity.js";

export interface CheckResultProps {
  readonly id: UUIDv7;
  readonly monitorId: UUIDv7;
  readonly incidentId: UUIDv7 | null;
  readonly triggerType: TriggerType;
  readonly scheduledFor: Date | null;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly durationMs: number | null;
  readonly isSuccess: boolean;
  readonly statusCode: number | null;
  readonly failureCategory: FailureCategory | null;
  readonly assertionResults: readonly AssertionExecutionResult[];
  readonly diagnostic?: string | null;
  readonly correlationId: string;
  readonly pinnedIp: string | null;
}

export class CheckResult implements BaseEntity<UUIDv7> {
  public static create(
    props: Omit<
      CheckResultProps,
      | "startedAt"
      | "finishedAt"
      | "assertionResults"
      | "correlationId"
      | "scheduledFor"
      | "incidentId"
      | "pinnedIp"
    > & {
      startedAt?: Date;
      finishedAt?: Date;
      assertionResults?: readonly AssertionExecutionResult[];
      correlationId?: string;
      scheduledFor?: Date | null;
      incidentId?: UUIDv7 | null;
      pinnedIp?: string | null;
    },
  ): CheckResult {
    const start = props.startedAt ?? new Date();
    return new CheckResult({
      ...props,
      incidentId: props.incidentId ?? null,
      scheduledFor: props.scheduledFor ?? null,
      startedAt: start,
      finishedAt: props.finishedAt ?? start,
      assertionResults: props.assertionResults ?? [],
      correlationId: props.correlationId ?? props.id.toString(),
      pinnedIp: props.pinnedIp ?? null,
    });
  }

  public readonly id: UUIDv7;
  public readonly monitorId: UUIDv7;
  public readonly incidentId: UUIDv7 | null;
  public readonly triggerType: TriggerType;
  public readonly scheduledFor: Date | null;
  public readonly startedAt: Date;
  public readonly finishedAt: Date;
  public readonly durationMs: number | null;
  public readonly isSuccess: boolean;
  public readonly statusCode: number | null;
  public readonly failureCategory: FailureCategory | null;
  public readonly assertionResults: readonly AssertionExecutionResult[];
  public readonly sanitizedDiagnostic: string | null;
  public readonly correlationId: string;
  public readonly pinnedIp: string | null;

  constructor(props: CheckResultProps) {
    if (!props.id || !props.monitorId) {
      throw new ValidationException("CheckResult memerlukan id dan monitorId yang valid", [
        { name: "id", reason: "Identitas CheckResult dan monitorId tidak boleh kosong." },
      ]);
    }

    if (props.startedAt > props.finishedAt) {
      throw new ValidationException(
        "Waktu mulai (startedAt) tidak boleh melebihi waktu selesai (finishedAt)",
        [{ name: "startedAt", reason: "Waktu mulai tidak boleh lebih baru dari waktu selesai." }],
      );
    }

    if (props.durationMs !== null) {
      if (typeof props.durationMs !== "number" || props.durationMs < 0) {
        throw new ValidationException(
          `Durasi request tidak valid: ${props.durationMs} (harus bilangan non-negatif atau null)`,
          [{ name: "durationMs", reason: "Durasi pemeriksaan harus >= 0 atau bernilai null." }],
        );
      }
    }

    if (props.isSuccess && props.failureCategory !== null) {
      throw new ValidationException(
        "CheckResult dengan status sukses tidak boleh memiliki failureCategory",
        [
          {
            name: "failureCategory",
            reason: "Status sukses tidak boleh disertai failureCategory.",
          },
        ],
      );
    }

    if (!props.correlationId || props.correlationId.trim().length === 0) {
      throw new ValidationException("CorrelationId tidak boleh kosong pada CheckResult", [
        { name: "correlationId", reason: "Correlation ID wajib ada untuk pelacakan diagnostik." },
      ]);
    }

    this.id = props.id;
    this.monitorId = props.monitorId;
    this.incidentId = props.incidentId;
    this.triggerType = props.triggerType;
    this.scheduledFor = props.scheduledFor;
    this.startedAt = props.startedAt;
    this.finishedAt = props.finishedAt;
    this.durationMs = props.durationMs;
    this.isSuccess = props.isSuccess;
    this.statusCode = props.statusCode;
    this.failureCategory = props.failureCategory;
    this.assertionResults = Object.freeze([...props.assertionResults]);
    this.sanitizedDiagnostic = sanitizeDiagnostic(props.diagnostic);
    this.correlationId = props.correlationId.trim();
    this.pinnedIp = props.pinnedIp ? props.pinnedIp.trim() : null;

    Object.freeze(this);
  }
}
