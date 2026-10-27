<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useIncidentQuery } from "../composables/use-incidents.js";

const props = withDefaults(
  defineProps<{
    open: boolean;
    incidentId: string | null;
  }>(),
  {
    incidentId: null,
  },
);

const emit = defineEmits<(e: "update:open", value: boolean) => void>();

const incidentIdRef = computed(() => props.incidentId || "");
const { data: incident, isLoading, error } = useIncidentQuery(incidentIdRef);

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
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

const liveDowntimeSeconds = computed<number>(() => {
  if (!incident.value) return 0;
  if (incident.value.durationSeconds != null) {
    return incident.value.durationSeconds;
  }
  const opened = new Date(incident.value.openedAt).getTime();
  if (Number.isNaN(opened)) return 0;
  return Math.max(0, Math.floor((now.value - opened) / 1000));
});

const incidentStatus = computed<"OPEN" | "RECOVERING" | "RESOLVED">(() => {
  if (!incident.value) return "OPEN";
  if (incident.value.status) return incident.value.status;
  if (incident.value.resolvedAt) return "RESOLVED";
  return "OPEN";
});

const statusBadgeClass = computed<string>(() => {
  switch (incidentStatus.value) {
    case "RESOLVED":
      return "text-status-operational bg-status-operational-bg border-status-operational-border";
    case "RECOVERING":
      return "text-status-degraded bg-status-degraded-bg border-status-degraded-border";
    default:
      return "text-status-down bg-status-down-bg border-status-down-border";
  }
});

function handleClose(): void {
  emit("update:open", false);
}
</script>

<template>
  <USlideover
    :open="open"
    title="[INSPEKSI DETAIL INSIDEN GANGGUAN]"
    description="Audit downtime, status pemulihan otomatis, failure streak, dan pengiriman notifikasi."
    side="right"
    :ui="{
      content: 'font-mono bg-canvas-subtle border-l border-hairline w-full sm:max-w-[480px] rounded-none shadow-none',
      header: 'border-b border-hairline px-4 py-3 bg-surface text-text-primary',
      body: 'p-4 overflow-y-auto space-y-5 text-xs',
      footer: 'border-t border-hairline px-4 py-3 bg-surface flex justify-end gap-2',
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <!-- Loading State -->
      <div v-if="isLoading" class="p-4 space-y-3">
        <div class="text-xs text-text-muted animate-pulse font-mono">
          [MEMUAT DATA DETAIL INSIDEN...]
        </div>
        <SkeletonRows :count="6" />
      </div>

      <!-- Error State -->
      <div
        v-else-if="error"
        class="p-3 border border-status-down-border bg-status-down-bg text-status-down text-xs"
      >
        [GAGAL MEMUAT INSIDEN]: {{ error.message || 'Tidak dapat mengambil detail insiden.' }}
      </div>

      <!-- Detail Content -->
      <div v-else-if="incident" class="space-y-5">
        <!-- Status & Identification Header Card -->
        <div class="p-3 border border-hairline bg-surface space-y-3">
          <div class="flex items-center justify-between">
            <span
              class="inline-flex items-center px-2 py-0.5 text-xs font-bold uppercase rounded-xs border select-none"
              :class="statusBadgeClass"
            >
              [{{ incidentStatus }}]
            </span>
            <span v-if="incidentStatus !== 'RESOLVED'" class="text-xs font-bold text-status-down animate-pulse">
              DOWNTIME: {{ formatStopwatch(liveDowntimeSeconds) }}
            </span>
            <span v-else class="text-xs text-text-muted">
              PULIH
            </span>
          </div>

          <div class="space-y-1">
            <div class="text-[10px] text-text-muted uppercase">ID INSIDEN</div>
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-text-primary select-all break-all text-xs">{{ incident.id }}</span>
              <CopyButton :text="incident.id" />
            </div>
          </div>

          <div class="space-y-1 pt-1 border-t border-hairline">
            <div class="text-[10px] text-text-muted uppercase">MONITOR TERKAIT</div>
            <div class="flex items-center justify-between gap-2">
              <NuxtLink
                :to="`/dashboard/monitors/${incident.monitorId}`"
                class="font-semibold text-text-primary hover:text-brand-accent transition-colors truncate"
              >
                {{ incident.monitorName || incident.monitorId }}
              </NuxtLink>
              <BracketButton
                :to="`/dashboard/monitors/${incident.monitorId}`"
                label="BUKA MONITOR"
                size="xs"
              />
            </div>
          </div>
        </div>

        <!-- Telemetry & Timing Metrics -->
        <div class="p-3 border border-hairline bg-surface space-y-3">
          <div class="text-[10px] text-text-muted uppercase font-semibold">
            TELEMETRI GANGGUAN & DURASI
          </div>

          <div class="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div class="text-[10px] text-text-muted uppercase">MULAI GANGGUAN (UTC)</div>
              <div class="text-text-primary font-semibold mt-0.5">
                <UtcTime :value="incident.openedAt" />
              </div>
              <div class="text-[10px] text-text-muted mt-0.5">
                <RelativeTime :value="incident.openedAt" />
              </div>
            </div>

            <div>
              <div class="text-[10px] text-text-muted uppercase">WAKTU PEMULIHAN (UTC)</div>
              <div class="text-text-primary font-semibold mt-0.5">
                <template v-if="incident.resolvedAt">
                  <UtcTime :value="incident.resolvedAt" />
                </template>
                <span v-else class="text-status-down font-bold">
                  [GANGGUAN AKTIF]
                </span>
              </div>
              <div v-if="incident.resolvedAt" class="text-[10px] text-text-muted mt-0.5">
                <RelativeTime :value="incident.resolvedAt" />
              </div>
            </div>

            <div>
              <div class="text-[10px] text-text-muted uppercase">TOTAL DURASI</div>
              <div class="text-text-primary font-bold mt-0.5">
                {{ formatDuration(incident.durationSeconds ?? liveDowntimeSeconds) }}
              </div>
            </div>

            <div>
              <div class="text-[10px] text-text-muted uppercase">KEGAGALAN BERUNTUN</div>
              <div class="text-status-down font-bold mt-0.5">
                {{ incident.failureCount }}x berturut-turut
              </div>
            </div>
          </div>
        </div>

        <!-- Root Cause & Diagnostics -->
        <div class="p-3 border border-hairline bg-surface space-y-2">
          <div class="text-[10px] text-text-muted uppercase font-semibold">
            PENYEBAB UTAMA (ROOT CAUSE)
          </div>

          <div class="flex items-center gap-2">
            <span class="text-[10px] uppercase px-1.5 py-0.5 rounded-xs border border-status-down-border bg-status-down-bg text-status-down font-bold">
              {{ incident.lastFailureCategory }}
            </span>
          </div>

          <div class="p-2 border border-hairline bg-canvas font-mono text-[11px] text-text-primary break-words whitespace-pre-wrap">
            {{ incident.lastFailureReason || 'Pemeriksaan gagal memenuhi kriteria assertion atau koneksi terputus.' }}
          </div>
        </div>

        <!-- Telegram Notification Dispatch Section -->
        <div class="p-3 border border-hairline bg-surface space-y-3">
          <div class="flex items-center justify-between">
            <div class="text-[10px] text-text-muted uppercase font-semibold">
              DISPATCH NOTIFIKASI TELEGRAM
            </div>
            <span class="text-[10px] text-brand-accent">
              [ZERO-SPAM POLICY]
            </span>
          </div>

          <p class="text-[11px] text-text-muted leading-relaxed">
            Bot hanya mengirimkan notifikasi saat insiden dibuka dan setelah pemulihan 2x berhasil terverifikasi. Tidak ada spam pada kegagalan berulang.
          </p>

          <div v-if="incident.notificationDeliveries && incident.notificationDeliveries.length > 0" class="space-y-2">
            <div
              v-for="del in incident.notificationDeliveries"
              :key="del.id"
              class="p-2.5 border border-hairline bg-canvas-subtle space-y-1.5 rounded-xs"
            >
              <div class="flex items-center justify-between">
                <span class="font-bold text-text-primary">[{{ del.channel }}]</span>
                <span
                  class="px-1.5 py-0.5 text-[10px] font-bold rounded-xs border uppercase"
                  :class="[
                    del.status === 'SENT'
                      ? 'text-status-operational bg-status-operational-bg border-status-operational-border'
                      : del.status === 'FAILED'
                        ? 'text-status-down bg-status-down-bg border-status-down-border'
                        : 'text-status-degraded bg-status-degraded-bg border-status-degraded-border',
                  ]"
                >
                  {{ del.status }}
                </span>
              </div>

              <div class="flex items-center justify-between text-[10px] text-text-muted">
                <span>Percobaan: {{ del.attemptCount }}x</span>
                <span v-if="del.lastAttemptAt">
                  <UtcTime :value="del.lastAttemptAt" />
                </span>
              </div>

              <div v-if="del.lastError" class="text-[10px] text-status-down border-t border-hairline pt-1">
                Error: {{ del.lastError }}
              </div>
            </div>
          </div>

          <div v-else class="text-[11px] text-text-muted italic p-2 border border-dashed border-hairline text-center">
            [TIDAK ADA PENGIRIMAN NOTIFIKASI / TELEGRAM TIDAK TERHUBUNG]
          </div>
        </div>

        <!-- Linked Check Results Trace -->
        <div v-if="incident.checks && incident.checks.length > 0" class="p-3 border border-hairline bg-surface space-y-2">
          <div class="text-[10px] text-text-muted uppercase font-semibold">
            JEJAK PEMERIKSAAN PROBE TERKAIT ({{ incident.checks.length }})
          </div>

          <div class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            <div
              v-for="chk in incident.checks"
              :key="chk.id"
              class="p-2 border border-hairline bg-canvas text-[11px] flex items-center justify-between gap-2"
            >
              <div class="flex items-center gap-2 truncate">
                <span
                  class="font-bold text-[10px] px-1 py-0.2 rounded-xs border uppercase"
                  :class="[
                    chk.status === 'UP'
                      ? 'text-status-operational border-status-operational-border'
                      : 'text-status-down border-status-down-border',
                  ]"
                >
                  {{ chk.status }}
                </span>
                <span class="text-text-muted">
                  <UtcTime :value="chk.executedAt" />
                </span>
              </div>
              <span class="text-text-secondary whitespace-nowrap">
                {{ chk.durationMs ?? 0 }} ms
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <BracketButton label="TUTUP" variant="outline" @click="handleClose" />
    </template>
  </USlideover>
</template>
