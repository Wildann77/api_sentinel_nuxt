<script setup lang="ts">
import type { MonitorResponseDto } from "@sentinel/contracts";
import { computed, onMounted, ref } from "vue";
import { useRecentChecksQuery } from "../../composables/use-checks.js";
import { useCompositeLatencyQuery, useGlobalMetricsQuery } from "../../composables/use-metrics.js";
import { useMonitorsQuery } from "../../composables/use-monitors.js";
import { useSentinelSocket } from "../../composables/use-sentinel-socket.js";

definePageMeta({
  layout: "default",
});

const socket = useSentinelSocket({ autoConnect: true });

onMounted(() => {
  socket.subscribe();
});

const isStale = computed<boolean>(() => socket.status.value !== "LIVE");

const {
  data: globalMetrics,
  isLoading: isMetricsLoading,
  error: metricsError,
  refetch: refetchMetrics,
} = useGlobalMetricsQuery();

const selectedTimeRange = ref<"24H" | "7D" | "30D">("24H");
const queryRange = computed<"24h" | "7d" | "30d">(() => {
  switch (selectedTimeRange.value) {
    case "7D":
      return "7d";
    case "30D":
      return "30d";
    default:
      return "24h";
  }
});

const {
  data: compositeLatency,
  isLoading: isLatencyLoading,
  error: latencyError,
  refetch: refetchLatency,
} = useCompositeLatencyQuery(queryRange);

const latencyChartData = computed(() => {
  const points = compositeLatency.value?.points ?? [];
  return points.map((p) => ({
    timestamp: p.timestamp,
    latency: p.avgLatencyMs ?? 0,
    success: (p.avgLatencyMs ?? 0) > 0,
  }));
});

const {
  data: recentChecksData,
  isLoading: isChecksLoading,
  error: checksError,
  refetch: refetchChecks,
} = useRecentChecksQuery(10);
const recentChecks = computed(() => recentChecksData.value?.data ?? []);

const { data: monitorsPage } = useMonitorsQuery({ limit: 100 });
const monitorsMap = computed(() => {
  const map = new Map<string, MonitorResponseDto>();
  for (const m of monitorsPage.value?.data ?? []) {
    map.set(m.id, m);
  }
  return map;
});

const queryError = computed(() => {
  const err = metricsError.value || latencyError.value || checksError.value;
  if (!err) return null;
  if (typeof err === "object" && "message" in err) {
    return {
      title: "GAGAL MEMUAT TELEMETRI OVERVIEW",
      detail: (err as Error).message,
    };
  }
  return String(err);
});

function handleRetryAll(): void {
  refetchMetrics();
  refetchLatency();
  refetchChecks();
}

const uptimeValue = computed<string | null>(() => {
  if (globalMetrics.value?.averageUptimePercentage == null) return null;
  return `${globalMetrics.value.averageUptimePercentage.toFixed(2)}%`;
});

const uptimeSubtext = computed<string>(() => {
  if (globalMetrics.value?.averageUptimePercentage == null) {
    return "ROLLUP 24H: NO TELEMETRY";
  }
  return "SYSTEM HEALTH SCORE (24H)";
});

const avgLatencyValue = computed<string | null>(() => {
  if (globalMetrics.value?.averageLatencyMs == null) return null;
  return `${Math.round(globalMetrics.value.averageLatencyMs)}ms`;
});

const activeIncidentsValue = computed<string | null>(() => {
  if (globalMetrics.value == null) return null;
  const count = globalMetrics.value.openIncidentsCount;
  return count === 0 ? "0 ACTIVE" : `${count} INCIDENT${count > 1 ? "S" : ""}`;
});

const activeIncidentsStatus = computed<"operational" | "down">(() => {
  return (globalMetrics.value?.openIncidentsCount ?? 0) > 0 ? "down" : "operational";
});

const activeIncidentsSubtext = computed<string>(() => {
  const count = globalMetrics.value?.openIncidentsCount ?? 0;
  return count > 0 ? "[!] REQUIRES IMMEDIATE TRIAGE" : "NO CRITICAL DOWNTIME DETECTED";
});

const totalMonitorsValue = computed<string | null>(() => {
  if (globalMetrics.value == null) return null;
  return `${globalMetrics.value.totalMonitors} MONITORS`;
});

const totalMonitorsSubtext = computed<string>(() => {
  if (!globalMetrics.value) return "ENDPOINTS CONFIGURED";
  const { upCount, degradedCount, downCount, pausedCount } = globalMetrics.value;
  return `${upCount} UP · ${degradedCount} DEG · ${downCount} DOWN · ${pausedCount} PAUSED`;
});

function formatStatusCode(code: number | null, failureCategory: string | null): string {
  if (code != null) {
    if (code === 200) return "200 OK";
    if (code === 201) return "201 CREATED";
    if (code === 204) return "204 NO CONTENT";
    if (code === 400) return "400 BAD REQ";
    if (code === 401) return "401 UNAUTH";
    if (code === 403) return "403 FORBIDDEN";
    if (code === 404) return "404 NOT FOUND";
    if (code === 408) return "408 TIMEOUT";
    if (code === 500) return "500 SERVER ERR";
    if (code === 502) return "502 BAD GATEWAY";
    if (code === 503) return "503 UNAVAIL";
    if (code === 504) return "504 GATEWAY T/O";
    return String(code);
  }
  return failureCategory || "ERR";
}
</script>

<template>
  <div class="space-y-6 font-mono text-xs">
    <!-- RFC 9457 ProblemAlert for API Query Errors -->
    <ProblemAlert
      v-if="queryError"
      :error="queryError"
      retryable
      @retry="handleRetryAll"
    />

    <!-- Top Action Bar -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
      <div class="flex items-center gap-2">
        <span class="text-brand-accent font-bold">&gt;</span>
        <span class="font-bold text-sm tracking-wider text-text-primary uppercase">
          [01: OVERVIEW DASHBOARD]
        </span>
        <span class="text-text-muted text-[11px] hidden sm:inline">// EXECUTIVE TELEMETRY</span>
        <span
          v-if="isStale"
          class="text-[10px] text-ws-disconnected font-bold border border-ws-disconnected/40 px-1 py-0.5 bg-ws-disconnected/10 select-none"
        >
          (STALE DATA)
        </span>
      </div>

      <div class="flex items-center gap-2">
        <BracketButton
          label="+ TAMBAH MONITOR"
          to="/dashboard/monitors/new"
          variant="solid"
          size="sm"
        />
      </div>
    </div>

    <!-- 4 Metric Tiles (Grid 4 Kolom, 2x2 Tablet, 1 Kolom Mobile) DES §9 -->
    <SkeletonTiles v-if="isMetricsLoading" :count="4" />

    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      aria-live="polite"
    >
      <MetricTile
        label="UPTIME 24H"
        :value="uptimeValue"
        :subtext="uptimeSubtext"
        :status="globalMetrics?.averageUptimePercentage != null ? 'operational' : 'neutral'"
      >
        <template #extra>
          <span v-if="isStale" class="text-[9px] text-ws-disconnected font-bold tracking-tight">(STALE)</span>
        </template>
      </MetricTile>
      <MetricTile
        label="RATA-RATA LATENCY"
        :value="avgLatencyValue"
        subtext="GLOBAL RESPONSE TIME"
        status="neutral"
      >
        <template #extra>
          <span v-if="isStale" class="text-[9px] text-ws-disconnected font-bold tracking-tight">(STALE)</span>
        </template>
      </MetricTile>
      <MetricTile
        label="INSIDEN AKTIF"
        :value="activeIncidentsValue"
        :subtext="activeIncidentsSubtext"
        :status="activeIncidentsStatus"
      >
        <template #extra>
          <span v-if="isStale" class="text-[9px] text-ws-disconnected font-bold tracking-tight">(STALE)</span>
        </template>
      </MetricTile>
      <MetricTile
        label="TOTAL MONITOR"
        :value="totalMonitorsValue"
        :subtext="totalMonitorsSubtext"
        status="neutral"
      >
        <template #extra>
          <span v-if="isStale" class="text-[9px] text-ws-disconnected font-bold tracking-tight">(STALE)</span>
        </template>
      </MetricTile>
    </div>

    <!-- Latency Telemetry Chart -->
    <LatencyChart
      :data="latencyChartData"
      :time-range="selectedTimeRange"
      :loading="isLatencyLoading"
      @update:time-range="selectedTimeRange = $event"
    />

    <!-- Real-time Probe Stream Feed (10 Pemeriksaan Terakhir) -->
    <div class="border border-hairline bg-surface font-mono">
      <div class="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4 border-b border-hairline bg-canvas-subtle">
        <div class="flex items-center gap-2">
          <span class="font-bold text-xs uppercase tracking-wider text-text-primary">
            [LIVE PROBE FEED // 10 PEMERIKSAAN TERAKHIR]
          </span>
          <span class="text-[10px] text-text-muted hidden md:inline">
            // WEBSOCKET BROADCAST STREAM
          </span>
          <span
            v-if="isStale"
            class="text-[10px] text-ws-disconnected font-bold border border-ws-disconnected/40 px-1 py-0.5 bg-ws-disconnected/10 select-none"
          >
            (STALE DATA)
          </span>
        </div>

        <NuxtLink
          to="/dashboard/monitors"
          class="text-xs text-text-muted hover:text-brand-accent transition-colors flex items-center gap-1 min-h-[36px]"
          aria-label="Lihat semua monitor"
        >
          <span>LIHAT SEMUA MONITOR</span>
          <span>&gt;</span>
        </NuxtLink>
      </div>

      <!-- Loading State -->
      <div v-if="isChecksLoading" class="p-3">
        <SkeletonRows :rows="5" :columns="6" />
      </div>

      <!-- Empty State -->
      <div v-else-if="recentChecks.length === 0" class="p-6">
        <EmptyState
          title="TIDAK ADA DATA HASIL PROBE"
          description="Sistem sentinel belum mencatat hasil pemeriksaan jaringan. Daftarkan monitor baru untuk memulai pemantauan berkala."
          action-label="+ TAMBAH MONITOR PERTAMA"
          action-to="/dashboard/monitors/new"
        />
      </div>

      <!-- Probe Feed Container -->
      <div v-else>
        <!-- Desktop & Tablet Table View (>= 768px) DES §9 -->
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-hairline text-text-muted uppercase text-[11px] tracking-wider bg-canvas-subtle/50">
                <th scope="col" class="py-2.5 px-3 font-semibold">STATUS</th>
                <th scope="col" class="py-2.5 px-3 font-semibold">METHOD</th>
                <th scope="col" class="py-2.5 px-3 font-semibold">TARGET ENDPOINT / NAME</th>
                <th scope="col" class="py-2.5 px-3 font-semibold">STATUS CODE</th>
                <th scope="col" class="py-2.5 px-3 font-semibold">LATENCY</th>
                <th scope="col" class="py-2.5 px-3 font-semibold text-right">LAST CHECK (UTC)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-hairline/60">
              <tr
                v-for="check in recentChecks"
                :key="check.id"
                class="hover:bg-surface-hover/70 transition-colors"
                :class="{
                  'bg-surface-elevated ring-1 ring-brand-accent/50': socket.isFlashing(check.monitorId),
                }"
              >
                <!-- Health Status -->
                <td class="py-3 px-3 whitespace-nowrap">
                  <StatusBadge :status="check.status" />
                </td>

                <!-- HTTP Method -->
                <td class="py-3 px-3 whitespace-nowrap">
                  <HttpMethodBadge
                    :method="monitorsMap.get(check.monitorId)?.method || 'GET'"
                  />
                </td>

                <!-- Target Endpoint & Name -->
                <td class="py-3 px-3">
                  <div class="flex items-center gap-2 max-w-sm sm:max-w-md">
                    <NuxtLink
                      :to="`/dashboard/monitors/${check.monitorId}`"
                      class="font-semibold text-text-primary hover:text-brand-accent transition-colors truncate min-h-[36px] flex items-center"
                    >
                      {{ monitorsMap.get(check.monitorId)?.name || `MONITOR [${check.monitorId.slice(0, 8)}]` }}
                    </NuxtLink>
                    <CopyButton
                      v-if="monitorsMap.get(check.monitorId)?.url"
                      :text="monitorsMap.get(check.monitorId)?.url || ''"
                      size="xs"
                    />
                  </div>
                  <div
                    v-if="monitorsMap.get(check.monitorId)?.url"
                    class="text-[11px] text-text-muted truncate max-w-xs sm:max-w-sm mt-0.5"
                  >
                    {{ monitorsMap.get(check.monitorId)?.url }}
                  </div>
                </td>

                <!-- Status Code -->
                <td class="py-3 px-3 whitespace-nowrap font-medium">
                  <span
                    :class="[
                      check.statusCode && check.statusCode < 400
                        ? 'text-status-operational'
                        : 'text-status-down font-bold',
                    ]"
                  >
                    {{ formatStatusCode(check.statusCode, check.failureCategory) }}
                  </span>
                </td>

                <!-- Latency -->
                <td class="py-3 px-3 whitespace-nowrap">
                  <span v-if="check.latencyMs != null" class="font-medium text-text-primary">
                    {{ check.latencyMs }}ms
                  </span>
                  <span v-else class="text-text-muted">N/A</span>
                </td>

                <!-- Checked At (UTC & Relative) -->
                <td class="py-3 px-3 whitespace-nowrap text-right">
                  <div class="flex flex-col items-end">
                    <RelativeTime :value="check.executedAt" />
                    <span class="text-[10px] text-text-dim">
                      <UtcTime :value="check.executedAt" format="time-only" />
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Card List View (< 768px) DES §9 -->
        <div class="md:hidden divide-y divide-hairline" aria-label="Daftar Kartu Pemeriksaan Terbaru">
          <div
            v-for="check in recentChecks"
            :key="check.id"
            class="p-3 space-y-2 hover:bg-surface-hover/70 transition-colors"
            :class="{
              'bg-surface-elevated ring-1 ring-brand-accent/50': socket.isFlashing(check.monitorId),
            }"
          >
            <!-- Row Header: Status + Method + Code + Latency -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <StatusBadge :status="check.status" />
                <HttpMethodBadge
                  :method="monitorsMap.get(check.monitorId)?.method || 'GET'"
                />
              </div>
              <div class="flex items-center gap-2">
                <span
                  class="font-medium text-xs"
                  :class="[
                    check.statusCode && check.statusCode < 400
                      ? 'text-status-operational'
                      : 'text-status-down font-bold',
                  ]"
                >
                  {{ formatStatusCode(check.statusCode, check.failureCategory) }}
                </span>
                <span v-if="check.latencyMs != null" class="font-medium text-text-primary text-xs">
                  {{ check.latencyMs }}ms
                </span>
              </div>
            </div>

            <!-- Target Name & URL with Link -->
            <div>
              <div class="flex items-center justify-between gap-2">
                <NuxtLink
                  :to="`/dashboard/monitors/${check.monitorId}`"
                  class="font-semibold text-text-primary hover:text-brand-accent transition-colors truncate text-xs min-h-[44px] flex items-center"
                >
                  {{ monitorsMap.get(check.monitorId)?.name || `MONITOR [${check.monitorId.slice(0, 8)}]` }}
                </NuxtLink>
                <CopyButton
                  v-if="monitorsMap.get(check.monitorId)?.url"
                  :text="monitorsMap.get(check.monitorId)?.url || ''"
                  size="xs"
                />
              </div>
              <div
                v-if="monitorsMap.get(check.monitorId)?.url"
                class="text-[11px] text-text-muted truncate select-all"
              >
                {{ monitorsMap.get(check.monitorId)?.url }}
              </div>
            </div>

            <!-- Footer: Timestamp -->
            <div class="flex items-center justify-between text-[10px] text-text-dim pt-1 border-t border-hairline/40">
              <span>WAKTU: <UtcTime :value="check.executedAt" format="time-only" /></span>
              <RelativeTime :value="check.executedAt" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
