import { ValidationException } from "../errors/domain-exception.js";

export interface MetricBucket {
  readonly total: number;
  readonly success: number;
  readonly avgLatencyMs: number | null;
}

export interface AggregatedMetrics {
  readonly totalChecks: number;
  readonly successChecks: number;
  readonly failedChecks: number;
  readonly uptimePercentage: number | null;
  readonly avgLatencyMs: number | null;
}

/**
 * Kalkulator Uptime & Agregasi Metrik Domain (PRD §4.11 / §4.12)
 *
 * Aturan Bisnis Definitif:
 * 1. Hanya pemeriksaan yang berstatus `SCHEDULED` dan benar-benar dieksekusi yang dihitung.
 * 2. Pemeriksaan manual (`MANUAL`) tidak memengaruhi metrik ketersediaan SLA/uptime monitor (D-13).
 * 3. Periode di mana monitor berstatus `PAUSED` atau jadwal terlewat tidak dihitung sebagai kegagalan.
 * 4. Bila total pemeriksaan = 0, uptime bernilai `null` (N/A), tidak pernah menghasilkan nilai 100% palsu.
 */
export function calculateUptime(successCount: number, totalCount: number): number | null {
  if (totalCount <= 0) {
    return null;
  }

  if (successCount < 0 || successCount > totalCount) {
    throw new ValidationException(
      `Jumlah sukses (${successCount}) tidak valid terhadap total (${totalCount})`,
      [{ name: "successCount", reason: "Jumlah sukses harus antara 0 dan totalCount." }],
    );
  }

  const rawPercent = (successCount / totalCount) * 100;
  return Number(rawPercent.toFixed(2));
}

export function aggregateMetricBuckets(buckets: readonly MetricBucket[]): AggregatedMetrics {
  let totalChecks = 0;
  let successChecks = 0;
  let weightedLatencySum = 0;
  let latencyMeasurableChecks = 0;

  for (const bucket of buckets) {
    if (bucket.total < 0 || bucket.success < 0 || bucket.success > bucket.total) {
      throw new ValidationException("Data bucket metrik tidak valid", [
        {
          name: "bucket",
          reason: "Nilai total dan success pada bucket harus konsisten non-negatif.",
        },
      ]);
    }

    totalChecks += bucket.total;
    successChecks += bucket.success;

    if (bucket.avgLatencyMs !== null && bucket.avgLatencyMs >= 0 && bucket.total > 0) {
      weightedLatencySum += bucket.avgLatencyMs * bucket.total;
      latencyMeasurableChecks += bucket.total;
    }
  }

  const failedChecks = totalChecks - successChecks;
  const uptimePercentage = calculateUptime(successChecks, totalChecks);
  const avgLatencyMs =
    latencyMeasurableChecks > 0
      ? Number((weightedLatencySum / latencyMeasurableChecks).toFixed(2))
      : null;

  return {
    totalChecks,
    successChecks,
    failedChecks,
    uptimePercentage,
    avgLatencyMs,
  };
}

export const UptimeCalculator = {
  calculateUptime,
  aggregateMetricBuckets,
} as const;
export type UptimeCalculator = typeof UptimeCalculator;
