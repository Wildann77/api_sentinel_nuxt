import crypto from "node:crypto";
import { ChangePasswordRequestSchema } from "@sentinel/contracts";
import { InvalidCredentialsException, ValidationException } from "@sentinel/domain";
import type {
  ChangeOwnerPasswordCommand,
  ChangeOwnerPasswordUseCase,
} from "../../ports/in/auth.use-cases.js";
import type { ClockPort } from "../../ports/out/clock.port.js";
import type { PasswordHasherPort } from "../../ports/out/password-hasher.port.js";
import type { SessionRepositoryPort } from "../../ports/out/session-repository.port.js";
import type { UnitOfWorkPort } from "../../ports/out/unit-of-work.port.js";
import type { UserRepositoryPort } from "../../ports/out/user-repository.port.js";

export class ChangeOwnerPassword implements ChangeOwnerPasswordUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly sessionRepository: SessionRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly clock: ClockPort,
    private readonly sessionSecret: string,
    private readonly unitOfWork?: UnitOfWorkPort,
  ) {
    if (!sessionSecret || sessionSecret.length < 32) {
      throw new Error("SESSION_SECRET must be at least 32 characters long");
    }
  }

  public async execute(command: ChangeOwnerPasswordCommand): Promise<void> {
    const parseResult = ChangePasswordRequestSchema.safeParse(command.request);
    if (!parseResult.success) {
      const invalidParams = parseResult.error.issues.map((issue) => ({
        name: issue.path.join("."),
        reason: issue.message,
      }));
      throw new ValidationException("Format ubah password tidak valid", invalidParams);
    }

    if (
      !command.currentSessionToken ||
      typeof command.currentSessionToken !== "string" ||
      command.currentSessionToken.trim().length === 0
    ) {
      throw new InvalidCredentialsException("Sesi tidak valid");
    }

    const currentTokenHash = crypto
      .createHmac("sha256", this.sessionSecret)
      .update(command.currentSessionToken)
      .digest("hex");

    const session = await this.sessionRepository.findByTokenHash(currentTokenHash);
    if (!session) {
      throw new InvalidCredentialsException("Sesi tidak valid");
    }

    const now = this.clock.now();
    if (session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) {
      await this.sessionRepository.revoke(currentTokenHash);
      throw new InvalidCredentialsException("Sesi kedaluwarsa");
    }

    const user = await this.userRepository.findById(session.userId);
    if (!user) {
      throw new InvalidCredentialsException("Pengguna tidak ditemukan");
    }

    const isCurrentPasswordValid = await this.passwordHasher.verify(
      command.request.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      throw new InvalidCredentialsException("Password saat ini tidak valid");
    }

    const newPasswordHash = await this.passwordHasher.hash(command.request.newPassword);

    const executeUpdate = async (tx?: unknown) => {
      await this.userRepository.updatePasswordHash(user.id, newPasswordHash, tx);
      await this.sessionRepository.revokeAllForUser(user.id, currentTokenHash, tx);
    };

    if (this.unitOfWork) {
      await this.unitOfWork.runInTransaction(executeUpdate);
    } else {
      await executeUpdate();
    }
  }
}
