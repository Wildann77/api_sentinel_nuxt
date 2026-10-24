import type { FailureCategory } from "../enums/index.js";
import { ConflictException, ValidationException } from "../errors/domain-exception.js";
import type { UUIDv7 } from "../value-objects/uuid-v7.js";
import type { BaseEntity } from "./base-entity.js";

export interface IncidentProps {
  readonly id: UUIDv7;
  readonly monitorId: UUIDv7;
  readonly startedAt: Date;
  readonly recoveredAt?: Date | null;
  readonly durationSeconds?: number | null;
  readonly causeCategory: FailureCategory;
  readonly initialErrorMessage: string;
  readonly failureCount?: number;
  readonly isResolved?: boolean;
}

export class Incident implements BaseEntity<UUIDv7> {
  public readonly id: UUIDv7;
  public readonly monitorId: UUIDv7;
  public readonly startedAt: Date;
  public recoveredAt: Date | null;
  public durationSeconds: number | null;
  public readonly causeCategory: FailureCategory;
  public readonly initialErrorMessage: string;
  public failureCount: number;
  public isResolved: boolean;

  constructor(props: IncidentProps) {
    if (!props.id || !props.monitorId) {
      throw new ValidationException("Incident memerlukan id dan monitorId yang valid", [
        { name: "id", reason: "Identitas incident dan monitorId tidak boleh kosong." },
      ]);
    }

    if (!props.initialErrorMessage || props.initialErrorMessage.trim().length === 0) {
      throw new ValidationException("Pesan kesalahan awal insiden tidak boleh kosong", [
        { name: "initialErrorMessage", reason: "Pesan kesalahan awal wajib disertakan." },
      ]);
    }

    this.id = props.id;
    this.monitorId = props.monitorId;
    this.startedAt = props.startedAt;
    this.recoveredAt = props.recoveredAt ?? null;
    this.durationSeconds = props.durationSeconds ?? null;
    this.causeCategory = props.causeCategory;
    this.initialErrorMessage = props.initialErrorMessage.trim();
    this.failureCount = Math.max(1, props.failureCount ?? 1);
    this.isResolved = props.isResolved ?? false;

    if (this.isResolved && this.recoveredAt && this.durationSeconds === null) {
      this.durationSeconds = Math.max(
        0,
        Math.floor((this.recoveredAt.getTime() - this.startedAt.getTime()) / 1000),
      );
    }
  }

  public static open(
    id: UUIDv7,
    monitorId: UUIDv7,
    causeCategory: FailureCategory,
    initialErrorMessage: string,
    startedAt: Date,
  ): Incident {
    return new Incident({
      id,
      monitorId,
      causeCategory,
      initialErrorMessage,
      startedAt,
      failureCount: 1,
      isResolved: false,
    });
  }

  public registerFailure(): void {
    if (this.isResolved) {
      throw new ConflictException(
        "Tidak dapat menambahkan kegagalan pada insiden yang telah diselesaikan",
      );
    }
    this.failureCount += 1;
  }

  public resolve(recoveredAt: Date): void {
    if (this.isResolved) {
      throw new ConflictException("Insiden sudah diselesaikan sebelumnya");
    }

    if (recoveredAt < this.startedAt) {
      throw new ValidationException(
        "Waktu pemulihan (recoveredAt) tidak boleh mendahului waktu insiden dimulai (startedAt)",
        [
          {
            name: "recoveredAt",
            reason: "Timestamp pemulihan tidak boleh sebelum timestamp pembukaan insiden.",
          },
        ],
      );
    }

    this.isResolved = true;
    this.recoveredAt = recoveredAt;
    this.durationSeconds = Math.max(
      0,
      Math.floor((recoveredAt.getTime() - this.startedAt.getTime()) / 1000),
    );
  }
}
