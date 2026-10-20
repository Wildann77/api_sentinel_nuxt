import crypto from "node:crypto";
import type { MeResponseDto } from "@sentinel/contracts";
import type {
  ValidateSessionQuery,
  ValidateSessionUseCase,
} from "../../ports/in/auth.use-cases.js";
import type { ClockPort } from "../../ports/out/clock.port.js";
import type { SessionRepositoryPort } from "../../ports/out/session-repository.port.js";
import type { UserRepositoryPort } from "../../ports/out/user-repository.port.js";

const SESSION_IDLE_TTL_MS = 24 * 60 * 60 * 1000;

export class ValidateSession implements ValidateSessionUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly sessionRepository: SessionRepositoryPort,
    private readonly clock: ClockPort,
    private readonly sessionSecret: string,
  ) {
    if (!sessionSecret || sessionSecret.length < 32) {
      throw new Error("SESSION_SECRET must be at least 32 characters long");
    }
  }

  public async execute(query: ValidateSessionQuery): Promise<MeResponseDto> {
    if (!query.token || typeof query.token !== "string" || query.token.trim().length === 0) {
      return { authenticated: false, user: null };
    }

    const tokenHash = crypto
      .createHmac("sha256", this.sessionSecret)
      .update(query.token)
      .digest("hex");

    const session = await this.sessionRepository.findByTokenHash(tokenHash);
    if (!session) {
      return { authenticated: false, user: null };
    }

    const now = this.clock.now();

    if (session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) {
      await this.sessionRepository.revoke(tokenHash);
      return { authenticated: false, user: null };
    }

    const user = await this.userRepository.findById(session.userId);
    if (!user) {
      await this.sessionRepository.revoke(tokenHash);
      return { authenticated: false, user: null };
    }

    const candidateIdle = new Date(now.getTime() + SESSION_IDLE_TTL_MS);
    const newIdleExpiresAt =
      candidateIdle > session.absoluteExpiresAt ? session.absoluteExpiresAt : candidateIdle;

    await this.sessionRepository.touch(tokenHash, newIdleExpiresAt);

    return {
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }
}
