<script setup lang="ts">
import { computed } from "vue";

export interface LatencyDataPoint {
  timestamp: string | number;
  latency: number;
  success?: boolean;
  status?: number;
}

const props = withDefaults(
  defineProps<{
    data?: LatencyDataPoint[];
    timeRange?: "24H" | "7D" | "30D";
    height?: number;
    loading?: boolean;
  }>(),
  {
    data: () => [],
    timeRange: "24H",
    height: 240,
    loading: false,
  },
);

const emit = defineEmits<(e: "update:timeRange", value: "24H" | "7D" | "30D") => void>();

const ranges: Array<"24H" | "7D" | "30D"> = ["24H", "7D", "30D"];

const chartData = computed(() => {
  return (props.data ?? []).map((pt) => {
    const d = new Date(pt.timestamp);
    const timeLabel = Number.isNaN(d.getTime())
      ? String(pt.timestamp)
      : `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    const fullTimeLabel = Number.isNaN(d.getTime())
      ? String(pt.timestamp)
      : `${d.toISOString().replace("T", " ").substring(0, 19)} UTC`;

    return {
      time: timeLabel,
      fullTime: fullTimeLabel,
      latency: pt.latency,
      success: pt.success ?? true,
      status: pt.status,
    };
  });
});

const hasData = computed<boolean>(() => {
  return (props.data?.length ?? 0) > 0;
});

const averageLatency = computed<string>(() => {
  if (!hasData.value) return "N/A";
  const valid = (props.data ?? []).filter((d) => Number.isFinite(d.latency));
  if (valid.length === 0) return "N/A";
  const sum = valid.reduce((acc, curr) => acc + curr.latency, 0);
  return `${Math.round(sum / valid.length)}ms`;
});

const maxLatency = computed<string>(() => {
  if (!hasData.value) return "N/A";
  const valid = (props.data ?? []).map((d) => d.latency).filter(Number.isFinite);
  if (valid.length === 0) return "N/A";
  return `${Math.max(...valid)}ms`;
});
</script>

<template>
  <div class="border border-hairline bg-surface p-4 font-mono transition-colors">
    <!-- Chart Header & Time Range Bar -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3 mb-4">
      <div>
        <div class="text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2">
          <span>LATENCY TELEMETRY</span>
          <span class="text-text-muted text-[11px]">(RESPONSIVE SVG)</span>
        </div>
        <div class="text-[11px] text-text-muted mt-0.5">
          AVG: <span class="text-brand-accent font-medium">{{ averageLatency }}</span>
          <span class="mx-1 text-hairline-strong">|</span>
          PEAK: <span class="text-text-secondary font-medium">{{ maxLatency }}</span>
        </div>
      </div>

      <!-- Window Selector [24H] [7D] [30D] -->
      <div class="flex items-center gap-1 select-none">
        <button
          v-for="range in ranges"
          :key="range"
          type="button"
          class="font-mono text-xs px-2.5 py-1 rounded-xs border transition-colors cursor-pointer"
          :class="[
            timeRange === range
              ? 'border-brand-accent bg-brand-accent-dim text-brand-accent font-bold'
              : 'border-hairline bg-surface text-text-muted hover:text-text-primary hover:border-hairline-strong',
          ]"
          @click="emit('update:timeRange', range)"
        >
          [{{ range }}]
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" :style="{ height: `${height}px` }" class="flex items-center justify-center bg-canvas-subtle/50">
      <div class="h-full w-full bg-surface-elevated animate-pulse rounded-xs" />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="!hasData"
      :style="{ height: `${height}px` }"
      class="flex flex-col items-center justify-center border border-dashed border-hairline bg-canvas-subtle p-6 text-center"
    >
      <div class="text-xs text-text-muted uppercase font-semibold mb-1">
        [TIDAK ADA DATA TELEMETRI]
      </div>
      <div class="text-[11px] text-text-dim">
        Belum ada hasil probe yang terekam pada rentang waktu {{ timeRange }}.
      </div>
    </div>

    <!-- Active Chart Rendering -->
    <div v-else :style="{ height: `${height}px` }" class="w-full relative">
      <ClientOnly>
        <UChart
          type="line"
          :data="chartData"
          index="time"
          :categories="['latency']"
          :colors="['#10b981']"
          :height="height"
          :curve="'monotone'"
          :grid="true"
          :tooltip="true"
          :x-axis="true"
          :y-axis="true"
          class="w-full h-full font-mono text-xs"
        />
        <template #fallback>
          <div :style="{ height: `${height}px` }" class="flex items-center justify-center bg-canvas-subtle">
            <span class="text-xs text-text-muted animate-pulse">[MEMUAT GRAFIK TELEMETRI...]</span>
          </div>
        </template>
      </ClientOnly>
    </div>
  </div>
</template>
