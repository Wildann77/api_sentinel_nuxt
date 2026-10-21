import type { UserData, UserRepositoryPort } from "../ports/out/user-repository.port.js";

export class InMemoryUserRepository implements UserRepositoryPort {
  private users = new Map<string, UserData>();
  private ownerId: string | null = null;

  public async getOwner(): Promise<UserData | null> {
    if (!this.ownerId) {
      const first = this.users.values().next().value;
      return first ? { ...first } : null;
    }
    const user = this.users.get(this.ownerId);
    return user ? { ...user } : null;
  }

  public async findById(id: string): Promise<UserData | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  public async findByUsername(username: string): Promise<UserData | null> {
    const normalized = username.toLowerCase();
    for (const user of this.users.values()) {
      if (user.username.toLowerCase() === normalized) {
        return { ...user };
      }
    }
    return null;
  }

  public async createOwner(user: UserData, _tx?: unknown): Promise<void> {
    this.users.set(user.id, { ...user });
    this.ownerId = user.id;
  }

  public async updatePasswordHash(id: string, passwordHash: string, _tx?: unknown): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      this.users.set(id, {
        ...user,
        passwordHash,
        updatedAt: new Date(),
      });
    }
  }

  public clear(): void {
    this.users.clear();
    this.ownerId = null;
  }
}
