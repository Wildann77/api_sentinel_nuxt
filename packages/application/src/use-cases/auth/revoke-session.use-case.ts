import crypto from "node:crypto";
import type { RevokeSessionCommand, RevokeSessionUseCase } from "../../ports/in/auth.use-cases.js";
import type { SessionRepositoryPort } from "../../ports/out/session-repository.port.js";

export class RevokeSession implements RevokeSessionUseCase {
  constructor(
    private readonly sessionRepository: SessionRepositoryPort,
    private readonly sessionSecret: string,
  ) {
    if (!sessionSecret || sessionSecret.length < 32) {
      throw new Error("SESSION_SECRET must be at least 32 characters long");
    }
  }

  public async execute(command: RevokeSessionCommand): Promise<void> {
    if (!command.token || typeof command.token !== "string" || command.token.trim().length === 0) {
      return;
    }

    const tokenHash = crypto
      .createHmac("sha256", this.sessionSecret)
      .update(command.token)
      .digest("hex");

    await this.sessionRepository.revoke(tokenHash);
  }
}
