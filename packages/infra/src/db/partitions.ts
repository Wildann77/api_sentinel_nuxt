export interface PartitionEnsureResult {
  status: string;
  created: string[];
}

export interface PartitionPurgeResult {
  status: string;
  dropped_partitions: string[];
  default_rows_deleted: number;
  rollup_rows_deleted: number;
}

export interface Queryable {
  query: <T = unknown>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
}

/**
 * Ensures monthly range partitions exist for check_results table.
 * Creates current month partition plus `monthsAhead` partitions into the future.
 */
export async function ensureCheckResultsPartitions(
  clientOrPool: Queryable,
  monthsAhead = 2,
): Promise<PartitionEnsureResult> {
  const result = await clientOrPool.query<{
    ensure_check_results_partitions: PartitionEnsureResult;
  }>("SELECT ensure_check_results_partitions($1);", [monthsAhead]);

  return (
    result.rows[0]?.ensure_check_results_partitions ?? {
      status: "ok",
      created: [],
    }
  );
}

/**
 * Purges expired check_results partitions older than `retentionDays`,
 * deletes matching records from default partition, and clears hourly rollups
 * older than `rollupRetentionDays`.
 */
export async function purgeExpiredCheckResults(
  clientOrPool: Queryable,
  retentionDays = 90,
  rollupRetentionDays = 400,
): Promise<PartitionPurgeResult> {
  const result = await clientOrPool.query<{
    purge_expired_check_results: PartitionPurgeResult;
  }>("SELECT purge_expired_check_results($1, $2);", [retentionDays, rollupRetentionDays]);

  return (
    result.rows[0]?.purge_expired_check_results ?? {
      status: "ok",
      dropped_partitions: [],
      default_rows_deleted: 0,
      rollup_rows_deleted: 0,
    }
  );
}

/**
 * Queries current active child partitions of check_results table.
 */
export async function getExistingCheckResultsPartitions(
  clientOrPool: Queryable,
): Promise<string[]> {
  const result = await clientOrPool.query<{ relname: string }>(
    `SELECT c.relname
     FROM pg_inherits i
     JOIN pg_class c ON c.oid = i.inhrelid
     JOIN pg_class p ON p.oid = i.inhparent
     WHERE p.relname = 'check_results'
     ORDER BY c.relname ASC;`,
  );

  return result.rows.map((row) => row.relname);
}
