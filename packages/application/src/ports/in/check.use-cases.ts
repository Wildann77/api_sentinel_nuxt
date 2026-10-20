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
  readonly scheduledFor?: string | Date | null;
  readonly correlationId?: string | null;
  readonly traceparent?: string | null;
  readonly checkId?: string | null;
  readonly triggerType?: "SCHEDULED" | "MANUAL";
}

export interface ExecuteScheduledCheckResult {
  readonly status: "EXECUTED" | "SKIPPED";
  readonly checkResultId?: string;
  readonly isSuccess?: boolean;
  readonly healthStatus?: string;
  readonly reason?: string;
}

export interface ExecuteScheduledCheckUseCase {
  execute(command: ExecuteScheduledCheckCommand): Promise<ExecuteScheduledCheckResult>;
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
