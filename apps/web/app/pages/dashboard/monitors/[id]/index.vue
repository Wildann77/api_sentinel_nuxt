<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { CheckResultDto } from "@sentinel/contracts";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMonitorChecksQuery } from "../../../../composables/use-checks.js";
import { useMonitorMetricsQuery } from "../../../../composables/use-metrics.js";
import {
  useDeleteMonitorMutation,
  useMonitorQuery,
  usePauseMonitorMutation,
  useResumeMonitorMutation,
  useTriggerCheckMutation,
} from "../../../../composables/use-monitors.js";
import { useSentinelSocket } from "../../../../composables/use-sentinel-socket.js";

definePageMeta({
  layout: "default",
});

const route = useRoute();
const router = useRouter();
const toast = useToast();
const socket = useSentinelSocket({ autoConnect: true });

const isStale = computed<boolean>(() => socket.status.value !== "LIVE");

const monitorId = computed<string>(() => String(route.params.id || ""));

// 1. Monitor Metadata Query
const {
  data: monitor,
  isLoading: isMonitorLoading,
  error: monitorError,
  refetch: refetchMonitor,
} = useMonitorQuery(monitorId);

// 2. Metrics Queries (24h, 7d, 30d)
const selectedChartRange = ref<"24H" | "7D" | "30D">("24H");

const metrics24hQuery = useMonitorMetricsQuery(monitorId, { range: "24h" });
const metrics7dQuery = useMonitorMetricsQuery(monitorId, { range: "7d" });
const metrics30dQuery = useMonitorMetricsQuery(monitorId, { range: "30d" });

// 3. Check History Query (Last 20 checks)
const checksQuery = useMonitorChecksQuery(monitorId, { limit: 20 });

const checksList = computed<CheckResultDto[]>(() => {
  return checksQuery.data.value?.data ?? [];
});

// 4. Mutations
const triggerCheckMutation = useTriggerCheckMutation();
const pauseMutation = usePauseMonitorMutation();
const resumeMutation = useResumeMonitorMutation();
const deleteMutation = useDeleteMonitorMutation();

const isTriggering = ref(false);
const isPauseModalOpen = ref(false);
const isDeleteModalOpen = ref(false);

// 5. Slideover Inspection Drawer State
const isInspectionOpen = ref(false);
const selectedCheckId = ref<string | null>(null);

function openInspection(checkId: string): void {
  selectedCheckId.value = checkId;
  isInspectionOpen.value = true;
}

// Action Handlers
async function handleTriggerCheck(): Promise<void> {
  if (!monitor.value) return;
  isTriggering.value = true;
  try {
    await triggerCheckMutation.mutateAsync(monitor.value.id);
    toast.add({
      title: "[PROBE MANUAL DIANTREKAN]",
      description: "Pemeriksaan jaringan manual telah dikirim ke pg-boss worker.",
      color: "success",
    });
    // Invalidate checks query
    void checksQuery.refetch();
    void refetchMonitor();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memicu probe manual.";
    toast.add({
      title: "[TRIGGER GAGAL]",
      description: msg,
      color: "error",
    });
  } finally {
    isTriggering.value = false;
  }
}

async function handleTogglePause(): Promise<void> {
  if (!monitor.value) return;
  const isPaused = !monitor.value.isActive || monitor.value.healthStatus === "PAUSED";

  try {
    if (isPaused) {
      await resumeMutation.mutateAsync(monitor.value.id);
      toast.add({
        title: "[MONITOR DIAKTIFKAN KEMBALI]",
        description: `Pemantauan untuk ${monitor.value.name} telah dilanjutkan.`,
        color: "success",
      });
    } else {
      await pauseMutation.mutateAsync(monitor.value.id);
      toast.add({
        title: "[MONITOR DIJEDA (PAUSED)]",
        description: `Pemeriksaan terjadwal untuk ${monitor.value.name} dinonaktifkan sementara.`,
        color: "neutral",
      });
    }
    void refetchMonitor();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal mengubah status aktif monitor.";
    toast.add({
      title: "[OPERASI GAGAL]",
      description: msg,
      color: "error",
    });
  }
}

async function handleDeleteConfirm(): Promise<void> {
  if (!monitor.value) return;
  try {
    await deleteMutation.mutateAsync(monitor.value.id);
    isDeleteModalOpen.value = false;
    toast.add({
      title: `[MONITOR DIHAPUS: ${monitor.value.name}]`,
      description: "Semua riwayat dan jadwal probe telah dibersihkan.",
      color: "success",
    });
    await router.push("/dashboard/monitors");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menghapus monitor.";
    toast.add({
      title: "[HAPUS GAGAL]",
      description: msg,
      color: "error",
    });
  }
}

// Chart Points derived from active metrics or checks
const latencyChartData = computed(() => {
  // If we have check results, plot them in chronological order
  if (checksList.value.length > 0) {
    const reversed = [...checksList.value].reverse();
    return reversed.map((c) => ({
      timestamp: c.executedAt || c.finishedAt,
      latency: c.latencyMs ?? 0,
      success: c.status === "UP",
      status: c.statusCode ?? undefined,
    }));
  }

  // Fallback to metric buckets for the selected range
  const activeMetrics =
    selectedChartRange.value === "24H"
      ? metrics24hQuery.data.value
      : selectedChartRange.value === "7D"
        ? metrics7dQuery.data.value
        : metrics30dQuery.data.value;

  if (activeMetrics?.buckets && activeMetrics.buckets.length > 0) {
    return activeMetrics.buckets.map((b) => ({
      timestamp: b.bucketStart,
      latency: b.avgLatencyMs ?? 0,
      success: b.failedChecks === 0,
      status: b.failedChecks > 0 ? 500 : 200,
    }));
  }

  return [];
});

// Computed Aggregates
const uptime24h = computed<string>(() => {
  const val = metrics24hQuery.data.value?.overallUptimePercentage;
  return val !== null && val !== undefined ? `${val.toFixed(2)}%` : "100.00%";
});

const avgLatency24h = computed<string>(() => {
  const val = metrics24hQuery.data.value?.overallAvgLatencyMs;
  return val !== null && val !== undefined ? `${Math.round(val)} ms` : "N/A";
});

const uptime7d = computed<string>(() => {
  const val = metrics7dQuery.data.value?.overallUptimePercentage;
  return val !== null && val !== undefined ? `${val.toFixed(2)}%` : "100.00%";
});

const p95Latency7d = computed<string>(() => {
  const buckets = metrics7dQuery.data.value?.buckets ?? [];
  const validP95 = buckets
    .map((b) => b.p95LatencyMs)
    .filter((v): v is number => v !== null && v !== undefined);
  if (validP95.length === 0) return avgLatency24h.value;
  const max = Math.max(...validP95);
  return `${Math.round(max)} ms`;
});

const uptime30d = computed<string>(() => {
  const val = metrics30dQuery.data.value?.overallUptimePercentage;
  return val !== null && val !== undefined ? `${val.toFixed(2)}%` : "100.00%";
});

const p99Latency30d = computed<string>(() => {
  const buckets = metrics30dQuery.data.value?.buckets ?? [];
  const validP99 = buckets
    .map((b) => b.p99LatencyMs ?? b.p95LatencyMs)
    .filter((v): v is number => v !== null && v !== undefined);
  if (validP99.length === 0) return p95Latency7d.value;
  const max = Math.max(...validP99);
  return `${Math.round(max)} ms`;
});

// Checks Table Columns
const tableColumns: TableColumn<CheckResultDto>[] = [
  {
    id: "time",
    header: "WAKTU (UTC)",
  },
  {
    id: "status",
    header: "STATUS RESPON",
  },
  {
    id: "latency",
    header: "LATENCY",
  },
  {
    id: "trigger",
    header: "TRIGGER",
  },
  {
    id: "actions",
    header: "AUDIT PROBE",
  },
];
</script>

<template>
  <div class="space-y-6 pb-20">
    <!-- Top Breadcrumb & Navigation -->
    <div class="flex items-center justify-between border-b border-hairline pb-3">
      <NuxtLink
        to="/dashboard/monitors"
        class="text-xs font-mono text-text-secondary hover:text-text-primary flex items-center gap-1 transition-colors"
      >
        <span>&lt; KEMBALI KE INVENTARIS</span>
      </NuxtLink>

      <div class="text-[11px] font-mono text-text-muted flex items-center gap-2">
        <span>ID: <code class="text-brand-accent">{{ monitorId.slice(0, 8) }}...</code></span>
      </div>
    </div>

    <!-- Error State -->
    <ProblemAlert
      v-if="monitorError"
      :error="monitorError.message || 'Gagal memuat konfigurasi monitor.'"
      retryable
      @retry="() => refetchMonitor()"
    />

    <!-- Loading Skeleton -->
    <div v-else-if="isMonitorLoading" class="p-6 bg-surface border border-hairline space-y-4">
      <div class="text-xs font-mono text-text-muted animate-pulse">
        [MEMUAT DATA DETAIL MONITOR...]
      </div>
      <SkeletonRows :count="6" />
    </div>

    <!-- Main Content when Monitor is Loaded -->
    <div v-else-if="monitor" class="space-y-6">
      <!-- 1. Header Banner -->
      <div class="p-5 border border-hairline bg-surface flex flex-col lg:flex-row lg:items-center justify-between gap-5 font-mono">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2.5">
            <StatusBadge :status="monitor.healthStatus" />
            <HttpMethodBadge :method="monitor.method" />
            <h1 class="text-sm sm:text-base font-bold tracking-wider text-text-primary uppercase truncate">
              {{ monitor.name }}
            </h1>
            <span
              v-if="isStale"
              class="text-[10px] text-ws-disconnected font-bold border border-ws-disconnected/40 px-1 py-0.5 bg-ws-disconnected/10 select-none"
            >
              (STALE DATA)
            </span>
          </div>

          <!-- URL with copy button -->
          <div class="flex items-center gap-2 text-xs text-text-secondary pt-0.5">
            <span class="text-text-muted">&gt;</span>
            <span class="font-mono text-text-primary select-all truncate max-w-lg sm:max-w-xl">
              {{ monitor.url }}
            </span>
            <CopyButton :text="monitor.url" size="xs" label="COPY" />
          </div>

          <!-- Quick Parameters Line -->
          <div class="flex flex-wrap items-center gap-3 text-[11px] text-text-muted pt-1">
            <span>Interval: <strong class="text-text-secondary">{{ monitor.intervalSeconds }}s</strong></span>
            <span class="text-hairline-strong">|</span>
            <span>Timeout: <strong class="text-text-secondary">{{ monitor.timeoutMs }}ms</strong></span>
            <span class="text-hairline-strong">|</span>
            <span>Auth: <strong class="text-text-secondary">{{ monitor.authType }}</strong></span>
            <span class="text-hairline-strong">|</span>
            <span>Versi OCC: <strong class="text-brand-accent">v{{ monitor.version }}</strong></span>
          </div>
        </div>

        <!-- Action Buttons Bar -->
        <div class="flex flex-wrap items-center gap-2 self-start lg:self-center">
          <BracketButton
            :label="isTriggering ? 'PROBE ENQUEUED...' : 'TRIGGER CHECK'"
            variant="solid"
            size="xs"
            class="min-h-[36px]"
            :disabled="isTriggering"
            @click="handleTriggerCheck"
          />

          <BracketButton
            :label="(!monitor.isActive || monitor.healthStatus === 'PAUSED') ? 'RESUME' : 'PAUSE'"
            variant="outline"
            size="xs"
            class="min-h-[36px]"
            @click="handleTogglePause"
          />

          <BracketButton
            label="EDIT"
            variant="outline"
            size="xs"
            class="min-h-[36px]"
            :to="`/dashboard/monitors/${monitor.id}/edit`"
          />

          <BracketButton
            label="HAPUS"
            variant="danger"
            size="xs"
            class="min-h-[36px]"
            @click="isDeleteModalOpen = true"
          />
        </div>
      </div>

      <!-- 2. Three Aggregation Cards (24h, 7d, 30d) -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
        <!-- Card 1: 24 Jam -->
        <div class="p-4 border border-hairline bg-surface space-y-2 relative overflow-hidden">
          <div class="flex items-center justify-between text-xs text-text-muted">
            <span class="font-bold uppercase tracking-wider">[24 JAM TERAKHIR]</span>
            <span class="text-brand-accent font-semibold">1D WINDOW</span>
          </div>
          <div class="flex items-baseline justify-between pt-1">
            <div class="text-2xl font-bold tracking-tight text-status-operational">
              {{ uptime24h }}
            </div>
            <div class="text-xs text-text-secondary">
              Uptime
            </div>
          </div>
          <div class="pt-2 border-t border-hairline flex items-center justify-between text-[11px] text-text-muted">
            <span>Rata-rata Latency:</span>
            <span class="text-text-primary font-bold">{{ avgLatency24h }}</span>
          </div>
        </div>

        <!-- Card 2: 7 Hari -->
        <div class="p-4 border border-hairline bg-surface space-y-2 relative overflow-hidden">
          <div class="flex items-center justify-between text-xs text-text-muted">
            <span class="font-bold uppercase tracking-wider">[7 HARI TERAKHIR]</span>
            <span class="text-text-secondary font-semibold">7D WINDOW</span>
          </div>
          <div class="flex items-baseline justify-between pt-1">
            <div class="text-2xl font-bold tracking-tight text-text-primary">
              {{ uptime7d }}
            </div>
            <div class="text-xs text-text-secondary">
              Uptime
            </div>
          </div>
          <div class="pt-2 border-t border-hairline flex items-center justify-between text-[11px] text-text-muted">
            <span>P95 Latency Peak:</span>
            <span class="text-text-primary font-bold">{{ p95Latency7d }}</span>
          </div>
        </div>

        <!-- Card 3: 30 Hari -->
        <div class="p-4 border border-hairline bg-surface space-y-2 relative overflow-hidden">
          <div class="flex items-center justify-between text-xs text-text-muted">
            <span class="font-bold uppercase tracking-wider">[30 HARI TERAKHIR]</span>
            <span class="text-text-secondary font-semibold">30D WINDOW</span>
          </div>
          <div class="flex items-baseline justify-between pt-1">
            <div class="text-2xl font-bold tracking-tight text-text-primary">
              {{ uptime30d }}
            </div>
            <div class="text-xs text-text-secondary">
              Uptime
            </div>
          </div>
          <div class="pt-2 border-t border-hairline flex items-center justify-between text-[11px] text-text-muted">
            <span>P99 Latency Peak:</span>
            <span class="text-text-primary font-bold">{{ p99Latency30d }}</span>
          </div>
        </div>
      </div>

      <!-- 3. Responsive Latency Chart (<UChart>) -->
      <LatencyChart
        :data="latencyChartData"
        :loading="checksQuery.isLoading.value && checksList.length === 0"
        v-model:time-range="selectedChartRange"
        :height="260"
      />

      <!-- 4. Riwayat Pemeriksaan Terakhir (UTable) -->
      <div class="space-y-3 font-mono">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-brand-accent font-bold">&gt;</span>
            <h2 class="text-xs font-bold text-text-primary uppercase tracking-wider">
              [RIWAYAT 20 PEMERIKSAAN TERAKHIR]
            </h2>
          </div>

          <div class="flex items-center gap-2 text-xs">
            <button
              type="button"
              class="text-[11px] text-text-muted hover:text-brand-accent transition-colors cursor-pointer"
              @click="() => checksQuery.refetch()"
            >
              [MUAT ULANG RIWAYAT]
            </button>
          </div>
        </div>

        <!-- Desktop & Tablet Table (>= 768px) -->
        <div class="hidden md:block border border-hairline bg-surface overflow-hidden">
          <UTable
            :data="checksList"
            :columns="tableColumns"
            :loading="checksQuery.isLoading.value"
            :ui="{
              root: 'w-full',
              base: 'font-mono text-xs w-full',
              th: 'bg-canvas-subtle text-text-secondary font-mono text-[11px] uppercase tracking-wider py-2.5 px-3 border-b border-hairline text-left',
              td: 'py-2.5 px-3 border-b border-hairline/60 text-text-primary font-mono align-middle',
            }"
          >
            <!-- Waktu UTC Column -->
            <template #time-cell="{ row }">
              <div class="flex flex-col text-xs">
                <span class="font-semibold text-text-primary">
                  <UtcTime :value="row.original.executedAt || row.original.finishedAt" />
                </span>
                <span class="text-[10px] text-text-muted">
                  <RelativeTime :value="row.original.executedAt || row.original.finishedAt" />
                </span>
              </div>
            </template>

            <!-- Status Column -->
            <template #status-cell="{ row }">
              <div class="flex items-center gap-2">
                <span
                  class="px-1.5 py-0.5 text-[11px] font-bold border rounded-none uppercase"
                  :class="[
                    row.original.status === 'UP'
                      ? 'border-status-operational-border bg-status-operational-bg text-status-operational'
                      : 'border-status-down-border bg-status-down-bg text-status-down',
                  ]"
                >
                  {{ row.original.status === 'UP' ? 'PASS' : 'FAIL' }}
                </span>

                <span v-if="row.original.statusCode" class="text-xs text-text-secondary font-semibold">
                  HTTP {{ row.original.statusCode }}
                </span>
              </div>
            </template>

            <!-- Latency Column -->
            <template #latency-cell="{ row }">
              <span class="font-semibold" :class="row.original.latencyMs !== null ? 'text-brand-accent' : 'text-text-muted'">
                {{ row.original.latencyMs !== null ? `${row.original.latencyMs} ms` : '-' }}
              </span>
            </template>

            <!-- Trigger Column -->
            <template #trigger-cell="{ row }">
              <span class="text-[11px] text-text-secondary">
                {{ row.original.triggerType }}
              </span>
            </template>

            <!-- Action [INSPECT] Column -->
            <template #actions-cell="{ row }">
              <BracketButton
                label="[INSPECT]"
                variant="outline"
                size="xs"
                @click="openInspection(row.original.id)"
              />
            </template>

            <!-- Empty State -->
            <template #empty>
              <div class="p-8 text-center text-text-muted text-xs font-mono space-y-1">
                <div>[BELUM ADA RIWAYAT PEMERIKSAAN]</div>
                <div class="text-[11px] text-text-dim">
                  Pemeriksaan terjadwal akan dieksekusi oleh worker secara berkala, atau klik [TRIGGER CHECK] sekarang.
                </div>
              </div>
            </template>
          </UTable>
        </div>

        <!-- Mobile Card List View (< 768px) DES §9 -->
        <div class="md:hidden space-y-2.5" aria-label="Riwayat Pemeriksaan Mobile">
          <div
            v-if="checksQuery.isLoading.value"
            class="space-y-2"
          >
            <div v-for="i in 3" :key="i" class="border border-hairline bg-surface p-3 space-y-2 animate-pulse">
              <div class="h-4 bg-surface-elevated w-1/3"></div>
              <div class="h-4 bg-surface-elevated w-2/3"></div>
            </div>
          </div>
          <div
            v-else-if="checksList.length === 0"
            class="p-6 border border-hairline bg-surface text-center text-text-muted text-xs font-mono"
          >
            [BELUM ADA RIWAYAT PEMERIKSAAN]
          </div>
          <div
            v-else
            v-for="check in checksList"
            :key="check.id"
            class="border border-hairline bg-surface p-3 space-y-2 font-mono text-xs"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span
                  class="px-1.5 py-0.5 text-[11px] font-bold border rounded-none uppercase"
                  :class="[
                    check.status === 'UP'
                      ? 'border-status-operational-border bg-status-operational-bg text-status-operational'
                      : 'border-status-down-border bg-status-down-bg text-status-down',
                  ]"
                >
                  {{ check.status === 'UP' ? 'PASS' : 'FAIL' }}
                </span>
                <span v-if="check.statusCode" class="text-xs text-text-secondary font-semibold">
                  HTTP {{ check.statusCode }}
                </span>
              </div>
              <BracketButton
                label="[INSPECT]"
                variant="outline"
                size="xs"
                class="min-h-[44px]"
                @click="openInspection(check.id)"
              />
            </div>
            <div class="flex items-center justify-between pt-1 border-t border-hairline/50 text-[11px]">
              <div>
                <span class="text-text-muted">LATENCY: </span>
                <span class="font-semibold text-brand-accent">{{ check.latencyMs !== null ? `${check.latencyMs} ms` : '-' }}</span>
              </div>
              <div class="text-right">
                <RelativeTime :value="check.executedAt || check.finishedAt" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 5. Slideover Inspection Drawer -->
    <CheckInspectionDrawer
      :open="isInspectionOpen"
      :check-id="selectedCheckId"
      @update:open="isInspectionOpen = $event"
    />

    <!-- Delete Confirmation Modal -->
    <DestructiveConfirmModal
      :open="isDeleteModalOpen"
      :target-name="monitor?.name ?? ''"
      title="HAPUS MONITOR DEFINITIF"
      :description="`Apakah Anda yakin ingin menghapus monitor '${monitor?.name}' secara permanen? Seluruh riwayat probe dan metrik terkait akan dihapus.`"
      @update:open="isDeleteModalOpen = $event"
      @confirm="handleDeleteConfirm"
    />
  </div>
</template>
