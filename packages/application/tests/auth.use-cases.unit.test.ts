import {
  InvalidCredentialsException,
  RateLimitExceededException,
  ValidationException,
} from "@sentinel/domain";
import { beforeEach, describe, expect, it } from "vitest";
import {
  FakeClock,
  FakePasswordHasher,
  FakeRateLimiter,
  FakeUnitOfWork,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from "../src/test-doubles/index.js";
import {
  AuthenticateUser,
  ChangeOwnerPassword,
  RevokeSession,
  ValidateSession,
} from "../src/use-cases/auth/index.js";

const TEST_SECRET = "super-secret-key-that-is-at-least-32-chars-long";

describe("P7.3 — Use Cases Autentikasi Unit Tests", () => {
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let passwordHasher: FakePasswordHasher;
  let rateLimiter: FakeRateLimiter;
  let clock: FakeClock;
  let uow: FakeUnitOfWork;

  let authenticateUseCase: AuthenticateUser;
  let validateSessionUseCase: ValidateSession;
  let revokeSessionUseCase: RevokeSession;
  let changePasswordUseCase: ChangeOwnerPassword;

  const mockUser = {
    id: "018f2d5e-4c7b-7e89-a012-3456789abcde",
    username: "sentinel_admin",
    passwordHash: "fake_hash:CorrectPassword123",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    passwordHasher = new FakePasswordHasher();
    rateLimiter = new FakeRateLimiter();
    clock = new FakeClock(new Date("2026-01-01T12:00:00Z"));
    uow = new FakeUnitOfWork();

    await userRepo.createOwner(mockUser);

    authenticateUseCase = new AuthenticateUser(
      userRepo,
      sessionRepo,
      passwordHasher,
      rateLimiter,
      clock,
      TEST_SECRET,
    );

    validateSessionUseCase = new ValidateSession(userRepo, sessionRepo, clock, TEST_SECRET);

    revokeSessionUseCase = new RevokeSession(sessionRepo, TEST_SECRET);

    changePasswordUseCase = new ChangeOwnerPassword(
      userRepo,
      sessionRepo,
      passwordHasher,
      clock,
      TEST_SECRET,
      uow,
    );
  });

  describe("AuthenticateUser", () => {
    it("successfully authenticates valid owner and creates session with 24h idle and 7d absolute TTL", async () => {
      const result = await authenticateUseCase.execute({
        credentials: {
          username: "sentinel_admin",
          password: "CorrectPassword123",
        },
        clientIp: "127.0.0.1",
      });

      expect(result.token).toBeDefined();
      expect(result.token.length).toBe(64); // 32 bytes hex
      expect(result.user).toEqual({
        id: mockUser.id,
        username: mockUser.username,
      });

      // Session should be valid
      const me = await validateSessionUseCase.execute({ token: result.token });
      expect(me.authenticated).toBe(true);
      expect(me.user?.username).toBe("sentinel_admin");
    });

    it("rejects invalid input schema with ValidationException", async () => {
      await expect(
        authenticateUseCase.execute({
          credentials: {
            username: "",
            password: "123",
          },
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("rejects unknown username and executes dummy verification without leaking user existence", async () => {
      await expect(
        authenticateUseCase.execute({
          credentials: {
            username: "non_existent_user",
            password: "SomePassword123",
          },
        }),
      ).rejects.toThrow(InvalidCredentialsException);
    });

    it("rejects incorrect password with generic message", async () => {
      await expect(
        authenticateUseCase.execute({
          credentials: {
            username: "sentinel_admin",
            password: "WrongPassword123",
          },
        }),
      ).rejects.toThrow(InvalidCredentialsException);
    });

    it("enforces rate limit Tier 1 by IP", async () => {
      // Simulate 5 attempts for IP
      for (let i = 0; i < 5; i++) {
        await rateLimiter.consume("ip:login:10.0.0.1", 5, 900);
      }

      await expect(
        authenticateUseCase.execute({
          credentials: {
            username: "sentinel_admin",
            password: "CorrectPassword123",
          },
          clientIp: "10.0.0.1",
        }),
      ).rejects.toThrow(RateLimitExceededException);
    });

    it("enforces rate limit Tier 1 by username", async () => {
      for (let i = 0; i < 5; i++) {
        await rateLimiter.consume("user:login:sentinel_admin", 5, 900);
      }

      await expect(
        authenticateUseCase.execute({
          credentials: {
            username: "sentinel_admin",
            password: "CorrectPassword123",
          },
        }),
      ).rejects.toThrow(RateLimitExceededException);
    });
  });

  describe("ValidateSession", () => {
    it("returns authenticated false for non-existent token", async () => {
      const me = await validateSessionUseCase.execute({ token: "invalid-token" });
      expect(me.authenticated).toBe(false);
      expect(me.user).toBeNull();
    });

    it("slides idle window when session is valid and active", async () => {
      const login = await authenticateUseCase.execute({
        credentials: {
          username: "sentinel_admin",
          password: "CorrectPassword123",
        },
      });

      // Advance clock by 10 hours
      clock.advanceMs(10 * 60 * 60 * 1000);

      const me = await validateSessionUseCase.execute({ token: login.token });
      expect(me.authenticated).toBe(true);
      expect(me.user?.username).toBe("sentinel_admin");
    });

    it("expires and revokes session when idle window exceeds 24 hours without activity", async () => {
      const login = await authenticateUseCase.execute({
        credentials: {
          username: "sentinel_admin",
          password: "CorrectPassword123",
        },
      });

      // Advance clock past 24 hours (25 hours)
      clock.advanceMs(25 * 60 * 60 * 1000);

      const me = await validateSessionUseCase.execute({ token: login.token });
      expect(me.authenticated).toBe(false);
      expect(me.user).toBeNull();

      // Ensure session is actually revoked
      const retry = await validateSessionUseCase.execute({ token: login.token });
      expect(retry.authenticated).toBe(false);
    });

    it("expires session when absolute TTL of 7 days is reached even with continuous activity", async () => {
      const login = await authenticateUseCase.execute({
        credentials: {
          username: "sentinel_admin",
          password: "CorrectPassword123",
        },
      });

      // Touch session every 12 hours across 6 days (12 steps * 12h = 144h)
      for (let step = 0; step < 12; step++) {
        clock.advanceMs(12 * 60 * 60 * 1000);
        const me = await validateSessionUseCase.execute({ token: login.token });
        expect(me.authenticated).toBe(true);
      }

      // Now at 144 hours, advance another 25 hours (total 169 hours > 168 hours = 7 days absolute TTL)
      clock.advanceMs(25 * 60 * 60 * 1000);

      const me = await validateSessionUseCase.execute({ token: login.token });
      expect(me.authenticated).toBe(false);
      expect(me.user).toBeNull();
    });
  });

  describe("RevokeSession", () => {
    it("revokes active session token immediately", async () => {
      const login = await authenticateUseCase.execute({
        credentials: {
          username: "sentinel_admin",
          password: "CorrectPassword123",
        },
      });

      await revokeSessionUseCase.execute({ token: login.token });

      const me = await validateSessionUseCase.execute({ token: login.token });
      expect(me.authenticated).toBe(false);
      expect(me.user).toBeNull();
    });

    it("handles empty or blank token gracefully without throwing", async () => {
      await revokeSessionUseCase.execute({ token: "" });
      await revokeSessionUseCase.execute({ token: "   " });
    });
  });

  describe("ChangeOwnerPassword", () => {
    it("successfully changes owner password, updates hash, and revokes all other sessions except current (D-09)", async () => {
      // Create session 1 (current session)
      const session1 = await authenticateUseCase.execute({
        credentials: {
          username: "sentinel_admin",
          password: "CorrectPassword123",
        },
      });

      // Create session 2 (other device session)
      const session2 = await authenticateUseCase.execute({
        credentials: {
          username: "sentinel_admin",
          password: "CorrectPassword123",
        },
      });

      // Change password from session 1
      await changePasswordUseCase.execute({
        request: {
          currentPassword: "CorrectPassword123",
          newPassword: "NewSecretPassword456!",
        },
        currentSessionToken: session1.token,
      });

      // Current session 1 should still be valid
      const me1 = await validateSessionUseCase.execute({ token: session1.token });
      expect(me1.authenticated).toBe(true);

      // Other session 2 MUST be revoked
      const me2 = await validateSessionUseCase.execute({ token: session2.token });
      expect(me2.authenticated).toBe(false);

      // Login with old password fails
      await expect(
        authenticateUseCase.execute({
          credentials: {
            username: "sentinel_admin",
            password: "CorrectPassword123",
          },
        }),
      ).rejects.toThrow(InvalidCredentialsException);

      // Login with new password succeeds
      const newLogin = await authenticateUseCase.execute({
        credentials: {
          username: "sentinel_admin",
          password: "NewSecretPassword456!",
        },
      });
      expect(newLogin.user.username).toBe("sentinel_admin");
    });

    it("rejects change password when current password is wrong", async () => {
      const login = await authenticateUseCase.execute({
        credentials: {
          username: "sentinel_admin",
          password: "CorrectPassword123",
        },
      });

      await expect(
        changePasswordUseCase.execute({
          request: {
            currentPassword: "IncorrectOldPassword",
            newPassword: "NewSecretPassword456!",
          },
          currentSessionToken: login.token,
        }),
      ).rejects.toThrow(InvalidCredentialsException);
    });

    it("rejects change password when session token is invalid or expired", async () => {
      await expect(
        changePasswordUseCase.execute({
          request: {
            currentPassword: "CorrectPassword123",
            newPassword: "NewSecretPassword456!",
          },
          currentSessionToken: "invalid_token",
        }),
      ).rejects.toThrow(InvalidCredentialsException);

      await expect(
        changePasswordUseCase.execute({
          request: {
            currentPassword: "CorrectPassword123",
            newPassword: "NewSecretPassword456!",
          },
          currentSessionToken: "",
        }),
      ).rejects.toThrow(InvalidCredentialsException);
    });

    it("rejects change password when request format is invalid (too short password)", async () => {
      await expect(
        changePasswordUseCase.execute({
          request: {
            currentPassword: "short",
            newPassword: "short",
          },
          currentSessionToken: "some_token",
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("rejects change password when session is idle expired or absolute expired", async () => {
      const login = await authenticateUseCase.execute({
        credentials: {
          username: "sentinel_admin",
          password: "CorrectPassword123",
        },
      });

      // Advance clock past idle expiration (24h)
      clock.advance(25 * 3600 * 1000);

      await expect(
        changePasswordUseCase.execute({
          request: {
            currentPassword: "CorrectPassword123",
            newPassword: "NewSecretPassword456!",
          },
          currentSessionToken: login.token,
        }),
      ).rejects.toThrow(InvalidCredentialsException);
    });

    it("supports ChangeOwnerPassword without unitOfWork parameter", async () => {
      const changePasswordNoUow = new ChangeOwnerPassword(
        userRepo,
        sessionRepo,
        passwordHasher,
        clock,
        TEST_SECRET,
      );

      const login = await authenticateUseCase.execute({
        credentials: {
          username: "sentinel_admin",
          password: "CorrectPassword123",
        },
      });

      await changePasswordNoUow.execute({
        request: {
          currentPassword: "CorrectPassword123",
          newPassword: "BrandNewPassword789!",
        },
        currentSessionToken: login.token,
      });

      const updatedUser = await userRepo.findById(mockUser.id);
      expect(updatedUser?.passwordHash).toBe("fake_hash:BrandNewPassword789!");
    });

    it("throws error when sessionSecret length is less than 32 characters", () => {
      expect(
        () => new ChangeOwnerPassword(userRepo, sessionRepo, passwordHasher, clock, "short-secret"),
      ).toThrow("SESSION_SECRET must be at least 32 characters long");
    });
  });
});
