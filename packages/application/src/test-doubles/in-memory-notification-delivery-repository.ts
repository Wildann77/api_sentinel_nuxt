import type {
  NotificationDeliveryData,
  NotificationDeliveryRepositoryPort,
} from "../ports/out/notification-delivery-repository.port.js";

export class InMemoryNotificationDeliveryRepository implements NotificationDeliveryRepositoryPort {
  private deliveries = new Map<string, NotificationDeliveryData>();

  public async save(delivery: NotificationDeliveryData, _tx?: unknown): Promise<void> {
    this.deliveries.set(delivery.id, { ...delivery });
  }

  public async findByIncidentId(incidentId: string): Promise<NotificationDeliveryData[]> {
    return Array.from(this.deliveries.values())
      .filter((d) => d.incidentId === incidentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public clear(): void {
    this.deliveries.clear();
  }
}
