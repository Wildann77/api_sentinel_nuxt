import type {
  ChangePasswordRequestDto,
  LoginRequestDto,
  MeResponseDto,
  UserSummaryDto,
} from "@sentinel/contracts";

export interface AuthenticateUserCommand {
  readonly credentials: LoginRequestDto;
  readonly clientIp?: string;
}

export interface AuthenticateUserResult {
  readonly token: string;
  readonly user: UserSummaryDto;
}

export interface AuthenticateUserUseCase {
  execute(command: AuthenticateUserCommand): Promise<AuthenticateUserResult>;
}

export interface RevokeSessionCommand {
  readonly token: string;
}

export interface RevokeSessionUseCase {
  execute(command: RevokeSessionCommand): Promise<void>;
}

export interface ValidateSessionQuery {
  readonly token: string;
}

export interface ValidateSessionUseCase {
  execute(query: ValidateSessionQuery): Promise<MeResponseDto>;
}

export interface ChangeOwnerPasswordCommand {
  readonly request: ChangePasswordRequestDto;
  readonly currentSessionToken: string;
}

export interface ChangeOwnerPasswordUseCase {
  execute(command: ChangeOwnerPasswordCommand): Promise<void>;
}
