export { sql } from "drizzle-orm";
export * from "./connection.js";
export * from "./drizzle-unit-of-work.js";
export * from "./migrate.js";
export * from "./partitions.js";
export * from "./schema/index.js";

export interface DatabaseConnection {
  readonly isConnected: boolean;
}
