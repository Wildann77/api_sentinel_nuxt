import type { FailureCategory } from "../enums/index.js";
import type { UUIDv7 } from "../value-objects/uuid-v7.js";
import type { DomainEvent } from "./domain-event.js";

export class IncidentOpenedDomainEvent implements DomainEvent {
  public readonly eventName = "IncidentOpened" as const;

  constructor(
    public readonly monitorId: UUIDv7,
    public readonly incidentId: UUIDv7,
    public readonly causeCategory: FailureCategory,
    public readonly initialErrorMessage: string,
    public readonly occurredOn: Date,
  ) {}
}

export class IncidentRecoveredDomainEvent implements DomainEvent {
  public readonly eventName = "IncidentRecovered" as const;

  constructor(
    public readonly monitorId: UUIDv7,
    public readonly incidentId: UUIDv7,
    public readonly occurredOn: Date,
  ) {}
}

export class IncidentFailureCountIncrementedDomainEvent implements DomainEvent {
  public readonly eventName = "IncidentFailureCountIncremented" as const;

  constructor(
    public readonly monitorId: UUIDv7,
    public readonly incidentId: UUIDv7,
    public readonly failureCount: number,
    public readonly occurredOn: Date,
  ) {}
}
