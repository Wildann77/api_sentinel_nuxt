import type { CursorPageDto, IncidentDto } from "@sentinel/contracts";

export interface ListIncidentsFilter {
  readonly monitorId?: string;
  readonly isOpen?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface ListIncidentsQuery {
  execute(filter?: ListIncidentsFilter): Promise<CursorPageDto<IncidentDto>>;
}

export interface GetIncidentQuery {
  execute(id: string): Promise<IncidentDto>;
}

export interface DispatchNotificationCommand {
  readonly incidentId: string;
  readonly type: "OPENED" | "RECOVERED";
}

export interface DispatchNotificationUseCase {
  execute(command: DispatchNotificationCommand): Promise<void>;
}
