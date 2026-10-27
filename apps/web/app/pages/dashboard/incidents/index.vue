<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { IncidentDto, IncidentStatus } from "@sentinel/contracts";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useIncidentsQuery } from "../../../composables/use-incidents.js";
import { useMonitorsQuery } from "../../../composables/use-monitors.js";
import { useSentinelSocket } from "../../../composables/use-sentinel-socket.js";

definePageMeta({
  layout: "default",
});

const socket = useSentinelSocket({ autoConnect: true });

onMounted(() => {
  socket.subscribe();
});

// Stopwatch live timer
const now = ref(Date.now());
let stopwatchTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  stopwatchTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (stopwatchTimer) {
    clearInterval(stopwatchTimer);
    stopwatchTimer = null;
  }
});

// Filters
const selectedMonitorId = ref<string>("ALL");
const selectedStatus = ref<string>("ALL");

function extractSelectValue(val: unknown): string {
  if (!val) return "ALL";
  if (typeof val === "object" && val !== null && "value" in val) {
    return String((val as { value: unknown }).value || "ALL");
  }
  return String(val);
}

const monitorQuery = useMonitorsQuery({ limit: 100 });
const monitorsList = computed(() => monitorQuery.data.value?.data ?? []);

const monitorFilterOptions = computed(() => {
  const options = [{ label: "[SEMUA MONITOR]", value: "ALL" }];
  for (const m of monitorsList.value) {
    options.push({
      label: `[${m.name}]`,
      value: m.id,
    });
  }
  return options;
});

const statusOptions = [
  { label: "[STATUS: SEMUA]", value: "ALL" },
  { label: "[STATUS: OPEN]", value: "OPEN" },
  { label: "[STATUS: RECOVERING]", value: "RECOVERING" },
  { label: "[STATUS: RESOLVED]", value: "RESOLVED" },
];

// Query
const incidentFilters = computed(() => {
  const f: { monitorId?: string; isOpen?: boolean; limit: number } = { limit: 100 };
  const monId = extractSelectValue(selectedMonitorId.value);
  if (monId && monId !== "ALL") {
    f.monitorId = monId;
  }
  const status = extractSelectValue(selectedStatus.value);
  if (status === "OPEN" || status === "RECOVERING") {
    f.isOpen = true;
  } else if (status === "RESOLVED") {
    f.isOpen = false;
  }
  return f;
});

const {
  data: incidentsPage,
  isLoading,
  isFetching,
  error: incidentsError,
  refetch: refetchIncidents,
} = useIncidentsQuery(incidentFilters);

// Manual refresh state
const isRefreshing = ref(false);

async function handleManualRefresh(): Promise<void> {
  try {
    isRefreshing.value = true;
    await Promise.all([refetchIncidents(), monitorQuery.refetch()]);
  } finally {
    isRefreshing.value = false;
  }
}

const rawIncidents = computed<IncidentDto[]>(() => incidentsPage.value?.data ?? []);

// Filtered list (client-side refinement for monitor and status)
const filteredIncidents = computed<IncidentDto[]>(() => {
  let list = rawIncidents.value;
  const monId = extractSelectValue(selectedMonitorId.value);
  if (monId && monId !== "ALL") {
    list = list.filter((i) => i.monitorId === monId);
  }
  const status = extractSelectValue(selectedStatus.value);
  if (status === "RECOVERING") {
    list = list.filter((i) => resolveIncidentStatus(i) === "RECOVERING");
  } else if (status === "OPEN") {
    list = list.filter((i) => resolveIncidentStatus(i) === "OPEN");
  } else if (status === "RESOLVED") {
    list = list.filter((i) => resolveIncidentStatus(i) === "RESOLVED");
  }
  return list;
});

// Active Incidents for Banner (unresolved or status OPEN/RECOVERING)
const activeIncidents = computed<IncidentDto[]>(() => {
  return rawIncidents.value.filter((i) => {
    const s = resolveIncidentStatus(i);
    return s === "OPEN" || s === "RECOVERING" || !i.resolvedAt;
  });
});

// Slideover Inspection Drawer State
const isInspectionOpen = ref(false);
const selectedIncidentId = ref<string | null>(null);

function openInspection(id: string): void {
  selectedIncidentId.value = id;
  isInspectionOpen.value = true;
}

// Helpers
function resolveIncidentStatus(incident: IncidentDto): IncidentStatus {
  if (incident.status) return incident.status;
  if (incident.resolvedAt) return "RESOLVED";
  return "OPEN";
}

function getIncidentStatusBadgeClass(status: IncidentStatus): string {
  switch (status) {
    case "RESOLVED":
      return "text-status-operational bg-status-operational-bg border-status-operational-border";
    case "RECOVERING":
      return "text-status-degraded bg-status-degraded-bg border-status-degraded-border";
    default:
      return "text-status-down bg-status-down-bg border-status-down-border";
  }
}

function getLiveDowntimeSeconds(openedAt: string): number {
  const opened = new Date(openedAt).getTime();
  if (Number.isNaN(opened)) return 0;
  return Math.max(0, Math.floor((now.value - opened) / 1000));
}

function formatStopwatch(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null) return "N/A";
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatNotificationSummary(deliveries: IncidentDto["notificationDeliveries"]): string {
  if (!deliveries || deliveries.length === 0) {
    return "[NO TELEGRAM]";
  }
  const sentCount = deliveries.filter((d) => d.status === "SENT").length;
  const failedCount = deliveries.filter((d) => d.status === "FAILED").length;
  if (failedCount > 0) {
    return `[FAILED: ${failedCount}/${deliveries.length}]`;
  }
  return `[DISPATCHED: ${sentCount} MSG]`;
}

const columns: TableColumn<IncidentDto>[] = [
  { id: "id", header: "ID INSIDEN" },
  { id: "monitor", header: "MONITOR" },
  { id: "status", header: "STATUS" },
  { id: "openedAt", header: "MULAI GANGGUAN (UTC)" },
  { id: "resolvedAt", header: "WAKTU PULIH (UTC)" },
  { id: "duration", header: "DURASI" },
  { id: "cause", header: "PENYEBAB UTAMA" },
  { id: "notifications", header: "NOTIFIKASI" },
  { id: "actions", header: "AKSI" },
];
</script>

<template>
  <div class="space-y-6 font-mono">
    <!-- Header Section -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-brand-accent font-bold">&gt;</span>
          <h1 class="text-sm sm:text-base font-bold tracking-wider text-text-primary uppercase">
            [03: INCIDENTS MANAGEMENT]
          </h1>
        </div>
        <p class="text-xs text-text-secondary mt-1">
          Pelacakan insiden aktif secara real-time, stopwatch downtime detik-demi-detik, dan riwayat arsip gangguan.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <BracketButton
          label="REFRESH"
          icon="i-lucide-refresh-cw"
          variant="outline"
          size="sm"
          :loading="isRefreshing"
          @click="handleManualRefresh"
        />
      </div>
    </div>

    <!-- Active Incident Banner (DES §5.6 & TASK P15.6) -->
    <div v-if="activeIncidents.length > 0" class="space-y-3">
      <div
        v-for="incident in activeIncidents"
        :key="incident.id"
        class="border-2 border-status-down bg-status-down-bg/20 rounded-xs p-4 space-y-3 relative overflow-hidden transition-all duration-300"
      >
        <!-- Top Row: Badge, Monitor, Counter, Stopwatch -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <!-- Pulsing Rose Indicator -->
            <span class="relative flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-down opacity-75" />
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-status-down" />
            </span>

            <span
              class="px-2 py-0.5 text-xs font-bold uppercase rounded-xs border"
              :class="getIncidentStatusBadgeClass(resolveIncidentStatus(incident))"
            >
              [{{ resolveIncidentStatus(incident) === 'RECOVERING' ? 'RECOVERING (1/2 SUKSES)' : 'INSIDEN AKTIF' }}]
            </span>

            <NuxtLink
              :to="`/dashboard/monitors/${incident.monitorId}`"
              class="text-xs sm:text-sm font-bold text-text-primary hover:text-brand-accent transition-colors"
            >
              {{ incident.monitorName || incident.monitorId }}
            </NuxtLink>

            <span class="text-xs font-bold text-status-down bg-status-down-bg px-2 py-0.5 rounded-xs border border-status-down-border">
              [{{ incident.failureCount }}x KEGAGALAN BERTURUT-TURUT]
            </span>
          </div>

          <!-- Live Stopwatch -->
          <div class="flex items-center gap-2 self-start sm:self-auto">
            <span class="text-xs sm:text-sm font-bold text-status-down tracking-wider font-mono">
              DOWNTIME: {{ formatStopwatch(getLiveDowntimeSeconds(incident.openedAt)) }}
            </span>
          </div>
        </div>

        <!-- Bottom Row: Root Cause & Action -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-status-down-border/40 text-xs">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-[10px] uppercase font-bold text-status-down bg-status-down-bg px-1.5 py-0.5 rounded-xs border border-status-down-border">
              {{ incident.lastFailureCategory }}
            </span>
            <span class="text-text-secondary truncate text-xs">
              {{ incident.lastFailureReason || 'Pemeriksaan gagal memenuhi kriteria assertion.' }}
            </span>
          </div>

          <BracketButton
            label="INSPEKSI DETAIL"
            icon="i-lucide-external-link"
            size="xs"
            variant="danger"
            @click="openInspection(incident.id)"
          />
        </div>
      </div>
    </div>

    <!-- Filter Control Bar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-surface border border-hairline rounded-none">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
        <!-- Monitor Filter -->
        <div class="w-full sm:w-64">
          <USelect
            v-model="selectedMonitorId"
            :items="monitorFilterOptions"
            value-key="value"
            label-key="label"
            class="w-full font-mono text-xs"
            :ui="{
              base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none',
            }"
          />
        </div>

        <!-- Status Filter -->
        <div class="w-full sm:w-56">
          <USelect
            v-model="selectedStatus"
            :items="statusOptions"
            value-key="value"
            label-key="label"
            class="w-full font-mono text-xs"
            :ui="{
              base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none',
            }"
          />
        </div>
      </div>

      <!-- Counters -->
      <div class="text-[11px] font-mono text-text-muted self-end sm:self-center select-none">
        TOTAL: <span class="font-bold text-text-primary">{{ filteredIncidents.length }}</span> INSIDEN
        <span v-if="activeIncidents.length > 0" class="text-status-down font-bold ml-1">
          ({{ activeIncidents.length }} AKTIF)
        </span>
      </div>
    </div>

    <!-- Error State -->
    <ProblemAlert
      v-if="incidentsError"
      title="[GAGAL MEMUAT ARSIP INSIDEN]"
      :description="incidentsError.message"
      class="rounded-none"
    />

    <!-- Archive Table Card -->
    <div class="border border-hairline bg-surface overflow-x-auto">
      <!-- Loading Skeleton -->
      <div v-if="isLoading" class="p-4 space-y-3">
        <div class="text-xs text-text-muted animate-pulse">
          [MEMUAT DAFTAR RIWAYAT INSIDEN...]
        </div>
        <SkeletonRows :count="6" />
      </div>

      <!-- Empty State -->
      <EmptyState
        v-else-if="filteredIncidents.length === 0"
        title="[SEMUA SISTEM BEROPERASI NORMAL]"
        description="Tidak ada insiden aktif atau riwayat gangguan tercatat pada kriteria pencarian ini."
        icon="i-lucide-shield-check"
      />

      <!-- Table View -->
      <UTable
        v-else
        :data="filteredIncidents"
        :columns="columns"
        :ui="{
          th: 'font-mono text-[11px] font-semibold text-text-secondary border-b border-hairline uppercase bg-canvas-subtle py-2.5 px-3 whitespace-nowrap',
          td: 'font-mono text-xs text-text-primary border-b border-hairline py-3 px-3 align-middle',
          tr: 'hover:bg-surface-hover/70 transition-colors',
        }"
      >
        <!-- Custom ID Cell -->
        <template #id-cell="{ row }">
          <div class="flex items-center gap-1.5 max-w-[130px]">
            <span class="text-text-secondary truncate text-xs" :title="row.original.id">
              {{ row.original.id.slice(0, 8) }}...
            </span>
            <CopyButton :text="row.original.id" size="xs" />
          </div>
        </template>

        <!-- Custom Monitor Cell -->
        <template #monitor-cell="{ row }">
          <div class="flex flex-col min-w-[140px] max-w-[220px]">
            <NuxtLink
              :to="`/dashboard/monitors/${row.original.monitorId}`"
              class="font-semibold text-text-primary hover:text-brand-accent transition-colors truncate"
            >
              {{ row.original.monitorName || row.original.monitorId.slice(0, 8) }}
            </NuxtLink>
            <span class="text-[10px] text-text-muted truncate">
              ID: {{ row.original.monitorId.slice(0, 8) }}
            </span>
          </div>
        </template>

        <!-- Custom Status Cell -->
        <template #status-cell="{ row }">
          <span
            class="inline-flex items-center px-2 py-0.5 text-[11px] font-bold uppercase rounded-xs border select-none whitespace-nowrap"
            :class="getIncidentStatusBadgeClass(resolveIncidentStatus(row.original))"
          >
            [{{ resolveIncidentStatus(row.original) }}]
          </span>
        </template>

        <!-- Custom OpenedAt Cell -->
        <template #openedAt-cell="{ row }">
          <div class="flex flex-col text-xs min-w-[130px]">
            <UtcTime :value="row.original.openedAt" />
            <div class="text-[10px] text-text-muted mt-0.5">
              <RelativeTime :value="row.original.openedAt" />
            </div>
          </div>
        </template>

        <!-- Custom ResolvedAt Cell -->
        <template #resolvedAt-cell="{ row }">
          <div class="flex flex-col text-xs min-w-[130px]">
            <template v-if="row.original.resolvedAt">
              <UtcTime :value="row.original.resolvedAt" />
              <div class="text-[10px] text-text-muted mt-0.5">
                <RelativeTime :value="row.original.resolvedAt" />
              </div>
            </template>
            <span v-else class="text-status-down font-bold text-xs">
              [AKTIF]
            </span>
          </div>
        </template>

        <!-- Custom Duration Cell -->
        <template #duration-cell="{ row }">
          <span v-if="row.original.resolvedAt" class="text-text-primary font-bold text-xs whitespace-nowrap">
            {{ formatDuration(row.original.durationSeconds) }}
          </span>
          <span v-else class="text-status-down font-bold text-xs whitespace-nowrap">
            {{ formatStopwatch(getLiveDowntimeSeconds(row.original.openedAt)) }}
          </span>
        </template>

        <!-- Custom Root Cause Cell -->
        <template #cause-cell="{ row }">
          <div class="flex flex-col gap-0.5 min-w-[180px] max-w-[280px]">
            <span class="text-[10px] uppercase font-bold text-status-down">
              {{ row.original.lastFailureCategory }}
            </span>
            <span class="text-xs text-text-secondary truncate" :title="row.original.lastFailureReason || ''">
              {{ row.original.lastFailureReason || 'Pemeriksaan gagal memenuhi assertion' }}
            </span>
          </div>
        </template>

        <!-- Custom Notifications Cell -->
        <template #notifications-cell="{ row }">
          <span
            class="text-[11px] font-mono px-1.5 py-0.5 rounded-xs border select-none whitespace-nowrap"
            :class="[
              row.original.notificationDeliveries && row.original.notificationDeliveries.some((d) => d.status === 'SENT')
                ? 'text-status-operational bg-status-operational-bg border-status-operational-border'
                : 'text-text-muted bg-surface border-hairline',
            ]"
          >
            {{ formatNotificationSummary(row.original.notificationDeliveries) }}
          </span>
        </template>

        <!-- Custom Actions Cell -->
        <template #actions-cell="{ row }">
          <BracketButton
            label="INSPECT"
            size="xs"
            variant="outline"
            @click="openInspection(row.original.id)"
          />
        </template>
      </UTable>
    </div>

    <!-- Incident Detail Inspection Slideover Drawer -->
    <IncidentInspectionDrawer
      v-model:open="isInspectionOpen"
      :incident-id="selectedIncidentId"
    />
  </div>
</template>
