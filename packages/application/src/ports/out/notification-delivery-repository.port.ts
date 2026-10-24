import type { NotificationDeliveryStatus } from "@sentinel/contracts";

export interface NotificationDeliveryData {
  readonly id: string;
  readonly incidentId: string;
  readonly channel: string;
  readonly status: NotificationDeliveryStatus;
  readonly attemptCount: number;
  readonly lastAttemptAt: Date | null;
  readonly lastError: string | null;
  readonly createdAt: Date;
}

export interface NotificationDeliveryRepositoryPort {
  save(delivery: NotificationDeliveryData, tx?: unknown): Promise<void>;
  findByIncidentId(incidentId: string): Promise<NotificationDeliveryData[]>;
}
