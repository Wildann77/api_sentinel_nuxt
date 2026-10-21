import argon2, { type Algorithm } from "@node-rs/argon2";
import type { PasswordHasherPort } from "@sentinel/application";

export interface Argon2Options {
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
  outputLen?: number;
}

const ARGON2ID: Algorithm = 2;

// Precomputed Argon2id hash with RFC 9106 recommended parameters: m=65536, t=3, p=4
const CONSTANT_DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$MbB+sr0au3qcFeJhj3bgdQ$Y+dxP3a6ZdGfpsV//esCKyIJiw85HjsOzSbWzy4e93k";
const CONSTANT_DUMMY_PASSWORD = "wrong_dummy_password_for_constant_time";

/**
 * NodeArgon2HasherAdapter implements PasswordHasherPort using @node-rs/argon2 (native Rust NAPI).
 * Provides secure Argon2id password hashing and constant-time dummy verification against user enumeration.
 */
export class NodeArgon2HasherAdapter implements PasswordHasherPort {
  private readonly memoryCost: number;
  private readonly timeCost: number;
  private readonly parallelism: number;
  private readonly outputLen: number;

  constructor(options?: Argon2Options) {
    this.memoryCost = options?.memoryCost ?? 65536; // 64 MiB
    this.timeCost = options?.timeCost ?? 3; // 3 iterations
    this.parallelism = options?.parallelism ?? 4; // 4 threads
    this.outputLen = options?.outputLen ?? 32; // 32 bytes output
  }

  public async hash(password: string): Promise<string> {
    if (typeof password !== "string" || password.length === 0) {
      throw new Error("Password must be a non-empty string.");
    }

    return argon2.hash(password, {
      algorithm: ARGON2ID,
      memoryCost: this.memoryCost,
      timeCost: this.timeCost,
      parallelism: this.parallelism,
      outputLen: this.outputLen,
    });
  }

  public async verify(password: string, hash: string): Promise<boolean> {
    if (typeof password !== "string" || typeof hash !== "string") {
      return false;
    }
    if (password.length === 0 || hash.length === 0) {
      return false;
    }

    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  public async verifyDummy(): Promise<boolean> {
    try {
      await argon2.verify(CONSTANT_DUMMY_HASH, CONSTANT_DUMMY_PASSWORD);
    } catch {
      // Ignored for safety
    }
    return false;
  }
}
