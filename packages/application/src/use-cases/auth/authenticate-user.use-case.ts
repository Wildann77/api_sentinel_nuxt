import crypto from "node:crypto";
import { LoginRequestSchema } from "@sentinel/contracts";
import {
  InvalidCredentialsException,
  RateLimitExceededException,
  ValidationException,
} from "@sentinel/domain";
import type {
  AuthenticateUserCommand,
  AuthenticateUserResult,
  AuthenticateUserUseCase,
} from "../../ports/in/auth.use-cases.js";
import type { ClockPort } from "../../ports/out/clock.port.js";
import type { PasswordHasherPort } from "../../ports/out/password-hasher.port.js";
import type { RateLimiterPort } from "../../ports/out/rate-limiter.port.js";
import type { SessionRepositoryPort } from "../../ports/out/session-repository.port.js";
import type { UserRepositoryPort } from "../../ports/out/user-repository.port.js";

const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW_SECONDS = 15 * 60;
const SESSION_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class AuthenticateUser implements AuthenticateUserUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly sessionRepository: SessionRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly rateLimiter: RateLimiterPort,
    private readonly clock: ClockPort,
    private readonly sessionSecret: string,
  ) {
    if (!sessionSecret || sessionSecret.length < 32) {
      throw new Error("SESSION_SECRET must be at least 32 characters long");
    }
  }

  public async execute(command: AuthenticateUserCommand): Promise<AuthenticateUserResult> {
    const parseResult = LoginRequestSchema.safeParse(command.credentials);
    if (!parseResult.success) {
      const invalidParams = parseResult.error.issues.map((issue) => ({
        name: issue.path.join("."),
        reason: issue.message,
      }));
      throw new ValidationException("Format kredensial tidak valid", invalidParams);
    }

    const { username, password } = parseResult.data;

    if (command.clientIp) {
      const ipResult = await this.rateLimiter.consume(
        `ip:login:${command.clientIp}`,
        LOGIN_RATE_LIMIT,
        LOGIN_RATE_WINDOW_SECONDS,
      );
      if (!ipResult.allowed) {
        throw new RateLimitExceededException(
          `Batas percobaan login untuk IP '${command.clientIp}' terlampaui. Coba lagi dalam ${ipResult.resetAfterSeconds} detik.`,
          ipResult.resetAfterSeconds,
        );
      }
    }

    const userResult = await this.rateLimiter.consume(
      `user:login:${username}`,
      LOGIN_RATE_LIMIT,
      LOGIN_RATE_WINDOW_SECONDS,
    );
    if (!userResult.allowed) {
      throw new RateLimitExceededException(
        `Batas percobaan login untuk pengguna '${username}' terlampaui. Coba lagi dalam ${userResult.resetAfterSeconds} detik.`,
        userResult.resetAfterSeconds,
      );
    }

    const user = await this.userRepository.findByUsername(username);

    if (!user) {
      await this.passwordHasher.verifyDummy();
      throw new InvalidCredentialsException("Kredensial tidak valid");
    }

    const isPasswordValid = await this.passwordHasher.verify(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new InvalidCredentialsException("Kredensial tidak valid");
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHmac("sha256", this.sessionSecret).update(token).digest("hex");

    const now = this.clock.now();
    const idleExpiresAt = new Date(now.getTime() + SESSION_IDLE_TTL_MS);
    const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS);

    await this.sessionRepository.create({
      tokenHash,
      userId: user.id,
      idleExpiresAt,
      absoluteExpiresAt,
      createdAt: now,
      lastActiveAt: now,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }
}
