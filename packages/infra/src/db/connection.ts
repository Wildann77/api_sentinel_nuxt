import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool, Client } = pg;

export type DrizzleDatabase = NodePgDatabase<typeof schema>;

export interface PgPoolConfig {
  readonly connectionString?: string;
  readonly applicationName?: string;
  readonly max?: number;
  readonly idleTimeoutMillis?: number;
  readonly connectionTimeoutMillis?: number;
  readonly statementTimeoutMillis?: number;
}

export function createPgPool(config: PgPoolConfig = {}): pg.Pool {
  const connectionString =
    config.connectionString ??
    process.env.DATABASE_URL ??
    "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel";

  return new Pool({
    connectionString,
    application_name: config.applicationName ?? "api_sentinel_pool",
    max: config.max ?? 10,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
    statement_timeout: config.statementTimeoutMillis ?? 30000,
  });
}

export function createDrizzleDb(pool: pg.Pool): DrizzleDatabase {
  return drizzle(pool, { schema });
}

export function createListenClient(config: PgPoolConfig = {}): pg.Client {
  const connectionString =
    config.connectionString ??
    process.env.DATABASE_URL ??
    "postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel";

  return new Client({
    connectionString,
    application_name: config.applicationName ?? "api_sentinel_listener",
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
  });
}

export async function closePgPool(pool: pg.Pool): Promise<void> {
  await pool.end();
}

export async function closePgClient(client: pg.Client): Promise<void> {
  await client.end();
}
