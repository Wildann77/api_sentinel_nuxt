<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

export interface ChartDataPoint {
  time?: string;
  latency?: number;
  success?: boolean;
  status?: number;
  fullTime?: string;
  [key: string]: unknown;
}

const props = withDefaults(
  defineProps<{
    data?: ChartDataPoint[];
    type?: string;
    index?: string;
    categories?: string[];
    colors?: string[];
    height?: number;
    curve?: string;
    grid?: boolean;
    tooltip?: boolean;
    xAxis?: boolean;
    yAxis?: boolean;
  }>(),
  {
    data: () => [],
    type: "line",
    index: "time",
    categories: () => ["latency"],
    colors: () => ["#10b981"],
    height: 240,
    curve: "monotone",
    grid: true,
    tooltip: true,
    xAxis: true,
    yAxis: true,
  },
);

const containerRef = ref<HTMLDivElement | null>(null);
const containerWidth = ref(600);

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (containerRef.value) {
    containerWidth.value = containerRef.value.clientWidth || 600;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0) {
            containerWidth.value = Math.round(entry.contentRect.width);
          }
        }
      });
      resizeObserver.observe(containerRef.value);
    }
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

const margin = {
  top: 14,
  right: 18,
  bottom: 26,
  left: 48,
};

const plotWidth = computed(() => {
  return Math.max(20, containerWidth.value - margin.left - margin.right);
});

const plotHeight = computed(() => {
  return Math.max(20, props.height - margin.top - margin.bottom);
});

// Max latency for scaling
const peakLatency = computed(() => {
  const points = props.data ?? [];
  if (points.length === 0) return 50;
  const values = points
    .map((p) => (typeof p.latency === "number" && !Number.isNaN(p.latency) ? p.latency : 0))
    .filter((v) => v >= 0);
  const max = values.length > 0 ? Math.max(...values) : 10;
  // Add 20% headroom
  const withHeadroom = Math.ceil(max * 1.2);
  return Math.max(withHeadroom, 20);
});

// Normalized points with SVG coordinates
interface SvgPoint {
  x: number;
  y: number;
  latency: number;
  time: string;
  fullTime: string;
  success: boolean;
  status?: number;
  raw: ChartDataPoint;
}

const svgPoints = computed<SvgPoint[]>(() => {
  const points = props.data ?? [];
  if (points.length === 0) return [];

  const count = points.length;
  const pWidth = plotWidth.value;
  const pHeight = plotHeight.value;
  const maxLat = peakLatency.value;

  return points.map((p, idx) => {
    const x = count === 1 ? margin.left + pWidth / 2 : margin.left + (idx / (count - 1)) * pWidth;

    const lat = typeof p.latency === "number" && !Number.isNaN(p.latency) ? p.latency : 0;
    const y = margin.top + pHeight - (Math.max(0, lat) / maxLat) * pHeight;

    const time = String(p.time ?? p[props.index] ?? `Point ${idx + 1}`);
    const fullTime = String(p.fullTime || time);
    const success = p.success !== false;
    const status = typeof p.status === "number" ? p.status : undefined;

    return {
      x,
      y,
      latency: Math.round(lat),
      time,
      fullTime,
      success,
      status,
      raw: p,
    };
  });
});

// Smooth line path
const linePath = computed(() => {
  const pts = svgPoints.value;
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    return `M ${pts[0].x - 5} ${pts[0].y} L ${pts[0].x + 5} ${pts[0].y}`;
  }

  // Build monotone smooth curve or line
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    // Smooth Catmull-Rom or Bezier control points
    const cpX1 = (prev.x + (curr.x - prev.x) / 3).toFixed(1);
    const cpX2 = (prev.x + ((curr.x - prev.x) * 2) / 3).toFixed(1);
    d += ` C ${cpX1} ${prev.y.toFixed(1)}, ${cpX2} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }
  return d;
});

// Area gradient path below the line
const areaPath = computed(() => {
  const pts = svgPoints.value;
  if (pts.length === 0) return "";
  const baseLine = (margin.top + plotHeight.value).toFixed(1);
  const first = pts[0];
  const last = pts[pts.length - 1];

  let d = linePath.value;
  d += ` L ${last.x.toFixed(1)} ${baseLine}`;
  d += ` L ${first.x.toFixed(1)} ${baseLine} Z`;
  return d;
});

// Y-axis grid ticks (0%, 50%, 100%)
const yTicks = computed(() => {
  const max = peakLatency.value;
  const pHeight = plotHeight.value;
  return [
    { label: `${max}ms`, y: margin.top },
    { label: `${Math.round(max / 2)}ms`, y: margin.top + pHeight / 2 },
    { label: "0ms", y: margin.top + pHeight },
  ];
});

// X-axis ticks (distributed evenly)
const xTicks = computed(() => {
  const pts = svgPoints.value;
  if (pts.length === 0) return [];
  if (pts.length <= 6) {
    return pts;
  }
  // Sample 5 evenly spaced points
  const step = Math.floor((pts.length - 1) / 4);
  const selected: SvgPoint[] = [];
  for (let i = 0; i < pts.length; i += step) {
    selected.push(pts[i]);
    if (selected.length === 5) break;
  }
  if (!selected.includes(pts[pts.length - 1])) {
    selected.push(pts[pts.length - 1]);
  }
  return selected;
});

// Tooltip State
const hoveredIndex = ref<number | null>(null);

const hoveredPoint = computed<SvgPoint | null>(() => {
  if (hoveredIndex.value === null) return null;
  return svgPoints.value[hoveredIndex.value] ?? null;
});

function handleMouseMove(e: MouseEvent): void {
  if (!containerRef.value || svgPoints.value.length === 0) return;
  const rect = containerRef.value.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;

  let closestIdx = 0;
  let minDiff = Number.POSITIVE_INFINITY;

  svgPoints.value.forEach((pt, i) => {
    const diff = Math.abs(pt.x - mouseX);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  });

  hoveredIndex.value = closestIdx;
}

function handleMouseLeave(): void {
  hoveredIndex.value = null;
}

const tooltipPosition = computed(() => {
  if (!hoveredPoint.value) return {};
  const pt = hoveredPoint.value;
  const width = containerWidth.value;

  let transform = "translate(-50%, -120%)";
  if (pt.x < 120) {
    transform = "translate(10px, -120%)";
  } else if (pt.x > width - 120) {
    transform = "translate(-100%, -120%)";
  }

  return {
    left: `${pt.x}px`,
    top: `${pt.y}px`,
    transform,
  };
});
</script>

<template>
  <div
    ref="containerRef"
    class="w-full relative select-none font-mono"
    :style="{ height: `${height}px` }"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <!-- Responsive SVG Surface -->
    <svg
      :width="containerWidth"
      :height="height"
      class="w-full h-full overflow-visible block"
    >
      <defs>
        <!-- Gradient fill under line -->
        <linearGradient id="latencyAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.25" />
          <stop offset="80%" stop-color="#10b981" stop-opacity="0.02" />
          <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- Background Grid -->
      <g v-if="grid" class="chart-grid">
        <line
          v-for="(tick, idx) in yTicks"
          :key="`grid-${idx}`"
          :x1="margin.left"
          :x2="margin.left + plotWidth"
          :y1="tick.y"
          :y2="tick.y"
          stroke="currentColor"
          class="text-hairline"
          stroke-dasharray="3,3"
          stroke-width="1"
        />
      </g>

      <!-- Y-Axis Labels -->
      <g v-if="yAxis" class="chart-y-axis">
        <text
          v-for="(tick, idx) in yTicks"
          :key="`y-label-${idx}`"
          :x="margin.left - 8"
          :y="tick.y + 3"
          text-anchor="end"
          class="fill-text-dim text-[10px] select-none"
        >
          {{ tick.label }}
        </text>
      </g>

      <!-- X-Axis Labels -->
      <g v-if="xAxis" class="chart-x-axis">
        <text
          v-for="(pt, idx) in xTicks"
          :key="`x-label-${idx}`"
          :x="pt.x"
          :y="height - 6"
          text-anchor="middle"
          class="fill-text-dim text-[10px] select-none"
        >
          {{ pt.time }}
        </text>
      </g>

      <!-- Area Path -->
      <path
        v-if="areaPath"
        :d="areaPath"
        fill="url(#latencyAreaGrad)"
      />

      <!-- Main Line Path -->
      <path
        v-if="linePath"
        :d="linePath"
        fill="none"
        stroke="#10b981"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <!-- Hover Crosshair Tracker -->
      <g v-if="hoveredPoint" class="chart-crosshair">
        <line
          :x1="hoveredPoint.x"
          :x2="hoveredPoint.x"
          :y1="margin.top"
          :y2="margin.top + plotHeight"
          stroke="#10b981"
          stroke-opacity="0.4"
          stroke-dasharray="3,3"
          stroke-width="1.5"
        />
      </g>

      <!-- Data Dots (Hijau untuk sukses, Titik Merah untuk gagal) -->
      <g class="chart-dots">
        <g v-for="(pt, idx) in svgPoints" :key="`pt-${idx}`">
          <!-- Titik Gagal / DOWN (Merah dengan pulsing ring) -->
          <template v-if="!pt.success">
            <circle
              :cx="pt.x"
              :cy="pt.y"
              r="7"
              fill="#f43f5e"
              fill-opacity="0.25"
            />
            <circle
              :cx="pt.x"
              :cy="pt.y"
              r="4.5"
              fill="#f43f5e"
              stroke="#09090b"
              stroke-width="1.5"
            />
          </template>

          <!-- Titik Sukses / UP (Hijau) -->
          <template v-else>
            <circle
              :cx="pt.x"
              :cy="pt.y"
              :r="hoveredIndex === idx ? 5 : 3.5"
              fill="#10b981"
              stroke="#09090b"
              stroke-width="1.5"
              class="transition-all duration-100"
            />
          </template>
        </g>
      </g>

      <!-- Active Point Highlight Ring on Hover -->
      <g v-if="hoveredPoint">
        <circle
          :cx="hoveredPoint.x"
          :cy="hoveredPoint.y"
          r="8"
          fill="none"
          :stroke="hoveredPoint.success ? '#10b981' : '#f43f5e'"
          stroke-width="2"
          stroke-opacity="0.9"
        />
      </g>
    </svg>

    <!-- Interactive Monospaced Tooltip Card -->
    <div
      v-if="tooltip && hoveredPoint"
      class="absolute border border-hairline bg-surface-elevated/95 p-2.5 font-mono text-xs shadow-xl backdrop-blur-xs select-none pointer-events-none z-30 transition-all duration-75"
      :style="tooltipPosition"
    >
      <div class="text-[10px] text-text-muted uppercase border-b border-hairline pb-1 mb-1.5 flex items-center justify-between gap-3">
        <span>TIMESTAMP</span>
        <span class="text-text-primary">{{ hoveredPoint.fullTime }}</span>
      </div>

      <div class="flex items-center justify-between gap-4 py-0.5 text-[11px]">
        <span class="text-text-secondary">LATENCY:</span>
        <span class="font-bold text-brand-accent">{{ hoveredPoint.latency }} ms</span>
      </div>

      <div class="flex items-center justify-between gap-4 py-0.5 text-[11px]">
        <span class="text-text-secondary">STATUS:</span>
        <span
          :class="hoveredPoint.success ? 'text-status-operational' : 'text-status-down'"
          class="font-bold uppercase"
        >
          HTTP {{ hoveredPoint.status ?? (hoveredPoint.success ? 200 : 'ERR') }} [{{ hoveredPoint.success ? 'UP' : 'DOWN' }}]
        </span>
      </div>
    </div>
  </div>
</template>
