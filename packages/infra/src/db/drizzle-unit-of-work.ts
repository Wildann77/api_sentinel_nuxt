import type { UnitOfWorkPort } from "@sentinel/application";
import { sql } from "drizzle-orm";
import type { DrizzleDatabase } from "./connection.js";

export class DrizzleUnitOfWorkAdapter implements UnitOfWorkPort {
  constructor(private readonly db: DrizzleDatabase) {}

  public async runInTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    return await this.db.transaction(async (tx) => {
      return await work(tx);
    });
  }

  public async notify(tx: unknown, channel: string, payload: string): Promise<void> {
    const target = tx as DrizzleDatabase;
    await target.execute(sql`SELECT pg_notify(${channel}, ${payload})`);
  }
}
