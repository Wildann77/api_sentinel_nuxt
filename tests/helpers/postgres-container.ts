import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

export interface PostgresContainerInstance {
  container: StartedPostgreSqlContainer;
  connectionUri: string;
  truncateAllTables: () => Promise<void>;
  executeSql: (sql: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  stop: () => Promise<void>;
}

export async function createTestPostgresContainer(
  image = "postgres:17-alpine",
): Promise<PostgresContainerInstance> {
  const container = await new PostgreSqlContainer(image)
    .withDatabase("api_sentinel_test")
    .withUsername("sentinel_user")
    .withPassword("sentinel_password")
    .start();

  const connectionUri = container.getConnectionUri();

  const executeSql = async (sql: string) => {
    return container.exec([
      "psql",
      "-U",
      container.getUsername(),
      "-d",
      container.getDatabase(),
      "-c",
      sql,
    ]);
  };

  const truncateAllTables = async () => {
    const truncateScript = `
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename NOT LIKE 'pg_%'
            AND tablename NOT LIKE '_drizzle%'
        ) LOOP
          EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" CASCADE;';
        END LOOP;
      END $$;
    `;
    await executeSql(truncateScript);
  };

  const stop = async () => {
    await container.stop();
  };

  return {
    container,
    connectionUri,
    truncateAllTables,
    executeSql,
    stop,
  };
}
