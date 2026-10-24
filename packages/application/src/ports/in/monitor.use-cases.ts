import type {
  CheckDetailDto,
  CreateMonitorRequestDto,
  HealthStatus,
  MonitorResponseDto,
  TestMonitorConfigRequestDto,
  UpdateMonitorRequestDto,
} from "@sentinel/contracts";

export interface CreateMonitorCommand {
  readonly request: CreateMonitorRequestDto;
}

export interface CreateMonitorUseCase {
  execute(command: CreateMonitorCommand): Promise<MonitorResponseDto>;
}

export interface UpdateMonitorCommand {
  readonly id: string;
  readonly request: UpdateMonitorRequestDto;
}

export interface UpdateMonitorUseCase {
  execute(command: UpdateMonitorCommand): Promise<MonitorResponseDto>;
}

export interface PauseMonitorCommand {
  readonly id: string;
}

export interface PauseMonitorUseCase {
  execute(command: PauseMonitorCommand): Promise<MonitorResponseDto>;
}

export interface ResumeMonitorCommand {
  readonly id: string;
}

export interface ResumeMonitorUseCase {
  execute(command: ResumeMonitorCommand): Promise<MonitorResponseDto>;
}

export interface DeleteMonitorCommand {
  readonly id: string;
}

export interface DeleteMonitorUseCase {
  execute(command: DeleteMonitorCommand): Promise<void>;
}

export interface TestMonitorConfigCommand {
  readonly request: TestMonitorConfigRequestDto;
}

export interface TestMonitorConfigUseCase {
  execute(command: TestMonitorConfigCommand): Promise<CheckDetailDto>;
}

export interface ListMonitorsFilter {
  readonly search?: string;
  readonly status?: HealthStatus;
  readonly isActive?: boolean;
}

export interface ListMonitorsQuery {
  execute(filter?: ListMonitorsFilter): Promise<readonly MonitorResponseDto[]>;
}

export interface GetMonitorQuery {
  execute(id: string): Promise<MonitorResponseDto>;
}
