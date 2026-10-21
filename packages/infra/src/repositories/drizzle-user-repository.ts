import type { UserData, UserRepositoryPort } from "@sentinel/application";
import { eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../db/connection.js";
import { users } from "../db/schema/index.js";
import { UserMapper } from "./mappers/user.mapper.js";

export class DrizzleUserRepository implements UserRepositoryPort {
  constructor(private readonly db: DrizzleDatabase) {}

  private getDb(tx?: unknown): DrizzleDatabase {
    return (tx as DrizzleDatabase) ?? this.db;
  }

  public async getOwner(): Promise<UserData | null> {
    const [row] = await this.db.select().from(users).limit(1);
    return row ? UserMapper.toDomain(row) : null;
  }

  public async findById(id: string): Promise<UserData | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? UserMapper.toDomain(row) : null;
  }

  public async findByUsername(username: string): Promise<UserData | null> {
    const [row] = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return row ? UserMapper.toDomain(row) : null;
  }

  public async createOwner(user: UserData, tx?: unknown): Promise<void> {
    const targetDb = this.getDb(tx);
    await targetDb.insert(users).values(UserMapper.toInsert(user));
  }

  public async updatePasswordHash(id: string, passwordHash: string, tx?: unknown): Promise<void> {
    const targetDb = this.getDb(tx);
    await targetDb
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  }
}
