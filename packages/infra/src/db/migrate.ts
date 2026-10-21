import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closePgPool, createDrizzleDb, createPgPool } from "./connection.js";
import { ensureCheckResultsPartitions } from "./partitions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(
  migrationsFolder?: string,
  connectionString?: string,
): Promise<void> {
  const folder = migrationsFolder ?? path.resolve(__dirname, "../../drizzle");
  const pool = createPgPool({
    connectionString,
    applicationName: "api_sentinel_migrator",
    max: 1,
  });

  const db = createDrizzleDb(pool);

  try {
    await migrate(db, { migrationsFolder: folder });
    await ensureCheckResultsPartitions(pool, 2);
  } finally {
    await closePgPool(pool);
  }
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith("migrate.ts") || process.argv[1].endsWith("migrate.js"))
) {
  runMigrations()
    .then(() => {
      console.log("Migrations applied successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
