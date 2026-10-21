import type { PasswordHasherPort } from "../ports/out/password-hasher.port.js";

export class FakePasswordHasher implements PasswordHasherPort {
  public async hash(password: string): Promise<string> {
    return `fake_hash:${password}`;
  }

  public async verify(password: string, hash: string): Promise<boolean> {
    return hash === `fake_hash:${password}`;
  }

  public async verifyDummy(): Promise<boolean> {
    return false;
  }
}
