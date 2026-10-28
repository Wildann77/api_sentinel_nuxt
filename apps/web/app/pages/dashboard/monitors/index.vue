<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type {
  HealthStatus,
  ListMonitorsQueryDto,
  MonitorResponseDto,
  SparklinePointDto,
} from "@sentinel/contracts";
import { computed, onMounted, ref } from "vue";
import {
  useDeleteMonitorMutation,
  useMonitorsQuery,
  usePauseMonitorMutation,
  useResumeMonitorMutation,
  useTriggerCheckMutation,
} from "../../../composables/use-monitors.js";
import { useSentinelSocket } from "../../../composables/use-sentinel-socket.js";

definePageMeta({
  layout: "default",
});

const toast = useToast();
const socket = useSentinelSocket({ autoConnect: true });

onMounted(() => {
  socket.subscribe();
});

const searchTerm = ref("");
const selectedStatus = ref<string>("ALL");

const statusOptions = [
  { label: "[STATUS: SEMUA]", value: "ALL" },
  { label: "[STATUS: OPERATIONAL]", value: "UP" },
  { label: "[STATUS: DEGRADED]", value: "DEGRADED" },
  { label: "[STATUS: DOWN]", value: "DOWN" },
  { label: "[STATUS: PAUSED]", value: "PAUSED" },
  { label: "[STATUS: UNKNOWN]", value: "UNKNOWN" },
];

const queryFilters = computed<ListMonitorsQueryDto>(() => {
  const filters: ListMonitorsQueryDto = { limit: 100 };
  if (searchTerm.value.trim()) {
    filters.search = searchTerm.value.trim();
  }
  if (selectedStatus.value && selectedStatus.value !== "ALL") {
    filters.status = selectedStatus.value as HealthStatus;
  }
  return filters;
});

const {
  data: monitorsPage,
  isLoading,
  error: monitorsError,
  refetch: refetchMonitors,
} = useMonitorsQuery(queryFilters);

const isStale = computed<boolean>(() => socket.status.value !== "LIVE");

const monitorsList = computed<MonitorResponseDto[]>(() => {
  return monitorsPage.value?.data ?? [];
});

const triggerCheckMutation = useTriggerCheckMutation();
const pauseMutation = usePauseMonitorMutation();
const resumeMutation = useResumeMonitorMutation();
const deleteMutation = useDeleteMonitorMutation();

const isTriggeringCheck = ref<string | null>(null);

// Modal states
const isDeleteModalOpen = ref(false);
const deleteTargetMonitor = ref<MonitorResponseDto | null>(null);

const isPauseIncidentModalOpen = ref(false);
const pauseTargetMonitor = ref<MonitorResponseDto | null>(null);

const columns: TableColumn<MonitorResponseDto>[] = [
  {
    id: "status",
    header: "STATUS",
  },
  {
    id: "method",
    header: "METHOD",
  },
  {
    id: "target",
    header: "MONITOR / TARGET URL",
  },
  {
    id: "sparkline",
    header: "HISTORY (20 PTS)",
    class: "hidden lg:table-cell",
  },
  {
    id: "uptimeLatency",
    header: "UPTIME / AVG LATENCY",
  },
  {
    id: "lastChecked",
    header: "LAST CHECKED",
  },
  {
    id: "actions",
    header: "ACTIONS",
  },
];

function computeMonitorMetrics(sparkline: SparklinePointDto[] = []): {
  uptime: string;
  avgLatency: string;
} {
  if (!sparkline || sparkline.length === 0) {
    return { uptime: "N/A", avgLatency: "N/A" };
  }
  const validDurationPoints = sparkline.filter((p) => p.durationMs !== null);
  const upPercentage = (validDurationPoints.length / sparkline.length) * 100;
  const avgLatency =
    validDurationPoints.length > 0
      ? Math.round(
          validDurationPoints.reduce((acc, p) => acc + (p.durationMs ?? 0), 0) /
            validDurationPoints.length,
        )
      : null;

  return {
    uptime: `${upPercentage.toFixed(1)}%`,
    avgLatency: avgLatency !== null ? `${avgLatency}ms` : "N/A",
  };
}

function getSparklineColor(status: string): string {
  const s = status?.toUpperCase() ?? "UNKNOWN";
  switch (s) {
    case "UP":
    case "OPERATIONAL":
      return "var(--color-status-operational, #10b981)";
    case "DEGRADED":
      return "var(--color-status-degraded, #f59e0b)";
    case "DOWN":
      return "var(--color-status-down, #ef4444)";
    case "PAUSED":
      return "var(--color-status-paused, #a1a1aa)";
    default:
      return "var(--color-status-unknown, #71717a)";
  }
}

async function handleTriggerCheck(monitor: MonitorResponseDto): Promise<void> {
  try {
    isTriggeringCheck.value = monitor.id;
    const res = await triggerCheckMutation.mutateAsync(monitor.id);
    toast.add({
      title: `[PROBE TRIGGERED: ${monitor.name}]`,
      description: `Job ID ${res.jobId || res.checkId} antre di antrean prioritas worker.`,
      color: "success",
    });
  } catch (err: unknown) {
    toast.add({
      title: "[GAGAL TRIGGER PROBE]",
      description: err instanceof Error ? err.message : "Terjadi kesalahan sistem.",
      color: "error",
    });
  } finally {
    isTriggeringCheck.value = null;
  }
}

function handleTogglePause(monitor: MonitorResponseDto): void {
  const isPaused = !monitor.isActive || monitor.healthStatus === "PAUSED";
  if (isPaused) {
    resumeMutation.mutate(monitor.id, {
      onSuccess: () => {
        toast.add({
          title: `[MONITOR RESUMED: ${monitor.name}]`,
          description: "Penjadwalan probe diaktifkan kembali.",
          color: "success",
        });
      },
      onError: (err) => {
        toast.add({
          title: "[GAGAL MENGAKTIFKAN MONITOR]",
          description: err.message,
          color: "error",
        });
      },
    });
  } else {
    const hasOpenIncident =
      monitor.currentIncidentId !== null ||
      monitor.healthStatus === "DOWN" ||
      monitor.healthStatus === "DEGRADED";

    if (hasOpenIncident) {
      pauseTargetMonitor.value = monitor;
      isPauseIncidentModalOpen.value = true;
    } else {
      executePause(monitor.id, monitor.name);
    }
  }
}

function executePause(id: string, name: string): void {
  pauseMutation.mutate(id, {
    onSuccess: () => {
      toast.add({
        title: `[MONITOR PAUSED: ${name}]`,
        description: "Penjadwalan probe dinonaktifkan sementara.",
        color: "neutral",
      });
      isPauseIncidentModalOpen.value = false;
      pauseTargetMonitor.value = null;
    },
    onError: (err) => {
      toast.add({
        title: "[GAGAL PAUSE MONITOR]",
        description: err.message,
        color: "error",
      });
    },
  });
}

function openDeleteModal(monitor: MonitorResponseDto): void {
  deleteTargetMonitor.value = monitor;
  isDeleteModalOpen.value = true;
}

function handleConfirmDelete(): void {
  if (!deleteTargetMonitor.value) return;
  const target = deleteTargetMonitor.value;
  deleteMutation.mutate(target.id, {
    onSuccess: () => {
      toast.add({
        title: `[MONITOR DIHAPUS: ${target.name}]`,
        description: "Monitor dan riwayat terkait berhasil dihapus.",
        color: "success",
      });
      isDeleteModalOpen.value = false;
      deleteTargetMonitor.value = null;
    },
    onError: (err) => {
      toast.add({
        title: "[GAGAL MENGHAPUS MONITOR]",
        description: err.message,
        color: "error",
      });
    },
  });
}

function getActionItems(monitor: MonitorResponseDto) {
  const isPaused = !monitor.isActive || monitor.healthStatus === "PAUSED";
  return [
    [
      {
        label: isTriggeringCheck.value === monitor.id ? "PROBE ENQUEUED..." : "RUN PROBE NOW",
        icon: "i-lucide-play",
        disabled: isTriggeringCheck.value === monitor.id,
        onSelect: () => handleTriggerCheck(monitor),
      },
      {
        label: isPaused ? "RESUME MONITOR" : "PAUSE MONITOR",
        icon: isPaused ? "i-lucide-play-circle" : "i-lucide-pause-circle",
        onSelect: () => handleTogglePause(monitor),
      },
      {
        label: "EDIT CONFIGURATION",
        icon: "i-lucide-pencil",
        to: `/dashboard/monitors/${monitor.id}/edit`,
      },
    ],
    [
      {
        label: "DELETE MONITOR",
        icon: "i-lucide-trash-2",
        color: "error" as const,
        onSelect: () => openDeleteModal(monitor),
      },
    ],
  ];
}
</script>

<template>
  <div class="space-y-6">
    <!-- RFC 9457 ProblemAlert for API Query Errors -->
    <ProblemAlert
      v-if="monitorsError"
      :error="monitorsError"
      retryable
      @retry="refetchMonitors"
    />

    <!-- Header Section -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-brand-accent font-bold">&gt;</span>
          <h1 class="text-sm sm:text-base font-bold tracking-wider text-text-primary uppercase">
            [02: MONITORS INVENTORY]
          </h1>
          <span
            v-if="isStale"
            class="text-[10px] text-ws-disconnected font-bold border border-ws-disconnected/40 px-1 py-0.5 bg-ws-disconnected/10 select-none"
          >
            (STALE DATA)
          </span>
        </div>
        <p class="text-xs text-text-secondary mt-1">
          Inventarisasi endpoint API terdaftar, status health, telemetri latency, dan kontrol operasional cepat.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <BracketButton
          label="+ TAMBAH MONITOR BARU"
          variant="solid"
          to="/dashboard/monitors/new"
        />
      </div>
    </div>

    <!-- Filter Control Bar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-surface border border-hairline rounded-none">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
        <!-- Search Input -->
        <div class="w-full sm:max-w-xs">
          <UInput
            v-model="searchTerm"
            placeholder="Cari nama monitor atau URL..."
            icon="i-lucide-search"
            class="w-full font-mono text-xs"
            :ui="{
              base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none focus:border-brand-accent min-h-[36px]',
            }"
          />
        </div>

        <!-- Status Filter Select -->
        <div class="w-full sm:w-56">
          <USelect
            v-model="selectedStatus"
            :items="statusOptions"
            class="w-full font-mono text-xs"
            :ui="{
              base: 'font-mono text-xs bg-canvas text-text-primary border border-hairline rounded-none min-h-[36px]',
            }"
          />
        </div>
      </div>

      <!-- Inventory Count Badge -->
      <div class="text-[11px] font-mono text-text-muted self-end sm:self-center select-none flex items-center gap-1.5">
        <span
          v-if="isStale"
          class="text-ws-disconnected font-bold border border-ws-disconnected/40 px-1 py-0.5 bg-ws-disconnected/10 text-[10px]"
        >
          (STALE DATA)
        </span>
        <span>TOTAL: <span class="font-bold text-text-primary">{{ monitorsList.length }}</span> ENDPOINT</span>
      </div>
    </div>

    <!-- Desktop & Tablet Table Card (>= 768px) DES §9 -->
    <div class="hidden md:block border border-hairline bg-surface overflow-hidden">
      <UTable
        :data="monitorsList"
        :columns="columns"
        :loading="isLoading"
        :ui="{
          th: 'font-mono text-[11px] font-semibold text-text-secondary border-b border-hairline uppercase bg-canvas-subtle py-2.5 px-3',
          td: 'font-mono text-xs text-text-primary border-b border-hairline py-3 px-3 align-middle',
          tr: 'hover:bg-surface-hover/70 transition-colors',
        }"
      >
        <!-- Custom Status Badge Cell -->
        <template #status-cell="{ row }">
          <StatusBadge
            :status="row.original.healthStatus"
            :pulse="socket.isFlashing(row.original.id)"
          />
        </template>

        <!-- Custom HTTP Method Cell -->
        <template #method-cell="{ row }">
          <HttpMethodBadge :method="row.original.method" />
        </template>

        <!-- Custom Target Name & URL Cell -->
        <template #target-cell="{ row }">
          <div class="flex flex-col gap-1 min-w-[200px] max-w-[340px]">
            <NuxtLink
              :to="`/dashboard/monitors/${row.original.id}`"
              class="font-bold text-text-primary hover:text-brand-accent transition-colors truncate min-h-[36px] flex items-center"
              :title="row.original.name"
            >
              {{ row.original.name }}
            </NuxtLink>
            <div class="flex items-center gap-2">
              <span class="text-[11px] text-text-muted truncate select-all" :title="row.original.url">
                {{ row.original.url }}
              </span>
              <CopyButton :text="row.original.url" size="xs" label="COPY" />
            </div>
          </div>
        </template>

        <!-- Custom Sparkline History Cell (hidden on tablet via column.class) -->
        <template #sparkline-cell="{ row }">
          <div class="hidden lg:flex items-center gap-2">
            <Sparkline
              :points="row.original.sparkline.map((p) => p.durationMs ?? 0)"
              :color="getSparklineColor(row.original.healthStatus)"
              :width="90"
              :height="22"
            />
          </div>
        </template>

        <!-- Custom Uptime & Avg Latency Cell -->
        <template #uptimeLatency-cell="{ row }">
          <div class="flex flex-col text-xs font-mono">
            <span class="font-semibold text-text-primary">
              {{ computeMonitorMetrics(row.original.sparkline).uptime }}
            </span>
            <span class="text-[11px] text-text-muted">
              avg {{ computeMonitorMetrics(row.original.sparkline).avgLatency }}
            </span>
          </div>
        </template>

        <!-- Custom Last Checked Cell -->
        <template #lastChecked-cell="{ row }">
          <div class="flex flex-col text-xs font-mono">
            <RelativeTime :value="row.original.lastCheckedAt" />
            <span v-if="row.original.lastCheckedAt" class="text-[10px] text-text-muted">
              <UtcTime :value="row.original.lastCheckedAt" format="time-only" />
            </span>
          </div>
        </template>

        <!-- Custom Actions Dropdown Cell -->
        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end">
            <UDropdownMenu
              :items="getActionItems(row.original)"
              :ui="{
                content: 'font-mono text-xs bg-surface border border-hairline rounded-none shadow-xl min-w-48 py-1',
                item: 'font-mono text-xs hover:bg-surface-hover rounded-none px-3 py-1.5 cursor-pointer',
              }"
            >
              <button
                type="button"
                class="font-mono text-xs px-2.5 py-1 min-h-[36px] rounded-none border border-hairline bg-surface hover:bg-surface-hover hover:border-hairline-strong transition-colors cursor-pointer select-none flex items-center"
                aria-label="Aksi Cepat Monitor"
              >
                <span class="text-text-muted">[</span>
                <span class="text-text-secondary font-bold">OPS</span>
                <span class="text-text-muted">]</span>
              </button>
            </UDropdownMenu>
          </div>
        </template>

        <!-- Empty State Slot -->
        <template #empty>
          <EmptyState
            title="TIDAK ADA MONITOR DITEMUKAN"
            description="Tidak ada monitor yang cocok dengan kriteria pencarian atau status filter saat ini."
            action-label="+ TAMBAH MONITOR BARU"
            action-to="/dashboard/monitors/new"
          />
        </template>

        <!-- Loading Slot -->
        <template #loading>
          <SkeletonRows :rows="6" :columns="7" />
        </template>
      </UTable>
    </div>

    <!-- Mobile Card List View (< 768px) DES §9 -->
    <div class="md:hidden space-y-3" aria-label="Daftar Kartu Monitor">
      <!-- Loading Skeleton on Mobile -->
      <div v-if="isLoading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="border border-hairline bg-surface p-3 space-y-3 animate-pulse">
          <div class="h-6 bg-surface-elevated w-1/3"></div>
          <div class="h-4 bg-surface-elevated w-2/3"></div>
          <div class="h-10 bg-surface-elevated w-full"></div>
        </div>
      </div>

      <!-- Empty State on Mobile -->
      <div v-else-if="monitorsList.length === 0" class="border border-hairline bg-surface p-6">
        <EmptyState
          title="TIDAK ADA MONITOR DITEMUKAN"
          description="Tidak ada monitor yang cocok dengan kriteria pencarian atau status filter saat ini."
          action-label="+ TAMBAH MONITOR BARU"
          action-to="/dashboard/monitors/new"
        />
      </div>

      <!-- Card Items -->
      <div
        v-else
        v-for="monitor in monitorsList"
        :key="monitor.id"
        class="border border-hairline bg-surface p-3 space-y-3 font-mono transition-colors"
        :class="{
          'bg-surface-elevated ring-1 ring-brand-accent/50': socket.isFlashing(monitor.id),
        }"
      >
        <!-- Card Header: Status, Method, Quick Ops Button -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <StatusBadge :status="monitor.healthStatus" :pulse="socket.isFlashing(monitor.id)" />
            <HttpMethodBadge :method="monitor.method" />
          </div>
          <UDropdownMenu
            :items="getActionItems(monitor)"
            :ui="{
              content: 'font-mono text-xs bg-surface border border-hairline rounded-none shadow-xl min-w-48 py-1 z-50',
              item: 'font-mono text-xs hover:bg-surface-hover rounded-none px-3 py-2.5 cursor-pointer min-h-[44px]',
            }"
          >
            <button
              type="button"
              class="font-mono text-xs px-2.5 py-1 min-h-[44px] rounded-none border border-hairline bg-surface hover:bg-surface-hover hover:border-hairline-strong transition-colors cursor-pointer select-none flex items-center"
              aria-label="Aksi Cepat Monitor"
            >
              <span class="text-text-muted">[</span>
              <span class="text-text-secondary font-bold">OPS</span>
              <span class="text-text-muted">]</span>
            </button>
          </UDropdownMenu>
        </div>

        <!-- Monitor Name & URL -->
        <div>
          <NuxtLink
            :to="`/dashboard/monitors/${monitor.id}`"
            class="font-bold text-sm text-text-primary hover:text-brand-accent transition-colors truncate block min-h-[44px] flex items-center"
          >
            {{ monitor.name }}
          </NuxtLink>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-[11px] text-text-muted truncate select-all flex-1">
              {{ monitor.url }}
            </span>
            <CopyButton :text="monitor.url" size="xs" label="COPY" />
          </div>
        </div>

        <!-- Telemetry Row: Uptime, Latency, Last Checked -->
        <div class="grid grid-cols-2 gap-2 pt-2 border-t border-hairline text-xs">
          <div>
            <span class="text-[10px] text-text-muted block">UPTIME / LATENCY:</span>
            <span class="font-semibold text-text-primary">{{ computeMonitorMetrics(monitor.sparkline).uptime }}</span>
            <span class="text-[11px] text-text-secondary ml-1">avg {{ computeMonitorMetrics(monitor.sparkline).avgLatency }}</span>
          </div>
          <div class="text-right">
            <span class="text-[10px] text-text-muted block">LAST CHECKED:</span>
            <RelativeTime :value="monitor.lastCheckedAt" />
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Konfirmasi Hapus Destruktif -->
    <DestructiveConfirmModal
      v-model:open="isDeleteModalOpen"
      :target-name="deleteTargetMonitor?.name ?? ''"
      title="KONFIRMASI PENGHAPUSAN MONITOR"
      description="Tindakan ini permanen dan tidak dapat dibatalkan. Seluruh riwayat check, konfigurasi assertion, dan insiden terkait akan dihapus secara kaskade."
      :loading="deleteMutation.isPending.value"
      @confirm="handleConfirmDelete"
      @cancel="deleteTargetMonitor = null"
    />

    <!-- Modal Peringatan Pause dengan Insiden Terbuka (PRD §4.12) -->
    <UModal
      v-model:open="isPauseIncidentModalOpen"
      title="[PERINGATAN: PAUSE DENGAN INSIDEN TERBUKA]"
      :ui="{
        content: 'font-mono bg-surface border border-status-degraded-border max-w-lg rounded-none',
        header: 'border-b border-hairline px-4 py-3 bg-canvas-subtle',
        body: 'p-4',
        footer: 'border-t border-hairline px-4 py-3 bg-canvas-subtle flex justify-end gap-2',
      }"
    >
      <template #body>
        <div class="space-y-3 font-mono text-xs">
          <div class="p-3 border border-status-degraded-border/50 bg-status-degraded-bg text-status-degraded leading-relaxed">
            <div class="font-bold uppercase tracking-wider mb-1">[INVARIANT ATURAN BISNIS: PRD §4.12]</div>
            <div>
              Monitor <span class="font-bold text-text-primary">{{ pauseTargetMonitor?.name }}</span> saat ini memiliki status insiden terbuka.
            </div>
          </div>
          <p class="text-text-secondary leading-relaxed">
            Sesuai invariant sistem, menonaktifkan (*pause*) monitor tidak akan menyelesaikan (*resolve*) insiden secara otomatis. Status insiden akan <strong>TETAP BERSTATUS UNRESOLVED</strong> hingga pemeriksaan berhasil dieksekusi atau ditangani manual.
          </p>
          <p class="text-text-muted">
            Apakah Anda yakin ingin menonaktifkan pemantauan target ini sekarang?
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex items-center justify-end gap-2 w-full">
          <BracketButton
            label="BATAL"
            variant="outline"
            @click="isPauseIncidentModalOpen = false"
          />
          <BracketButton
            label="LANJUTKAN PAUSE"
            variant="solid"
            :loading="pauseMutation.isPending.value"
            @click="pauseTargetMonitor && executePause(pauseTargetMonitor.id, pauseTargetMonitor.name)"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
