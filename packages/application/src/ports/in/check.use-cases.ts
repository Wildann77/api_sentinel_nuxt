import type { CheckDetailDto, CheckResultDto, CursorPageDto } from "@sentinel/contracts";

export interface ExecuteManualCheckCommand {
  readonly monitorId: string;
  readonly correlationId?: string;
}

export interface ExecuteManualCheckUseCase {
  execute(command: ExecuteManualCheckCommand): Promise<CheckDetailDto>;
}

export interface ExecuteScheduledCheckCommand {
  readonly monitorId: string;
  readonly scheduledFor: string;
  readonly correlationId?: string;
}

export interface ExecuteScheduledCheckUseCase {
  execute(command: ExecuteScheduledCheckCommand): Promise<void>;
}

export interface ListChecksFilter {
  readonly monitorId: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface ListChecksQuery {
  execute(filter: ListChecksFilter): Promise<CursorPageDto<CheckResultDto>>;
}

export interface GetRecentChecksFilter {
  readonly limit?: number;
}

export interface GetRecentChecksQuery {
  execute(filter?: GetRecentChecksFilter): Promise<readonly CheckResultDto[]>;
}
