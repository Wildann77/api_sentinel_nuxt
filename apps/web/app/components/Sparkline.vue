<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    points?: number[];
    width?: number;
    height?: number;
    strokeWidth?: number;
    color?: string;
  }>(),
  {
    points: () => [],
    width: 80,
    height: 24,
    strokeWidth: 1.5,
    color: "var(--color-brand-accent, #10b981)",
  },
);

const svgPath = computed<string>(() => {
  const pts = props.points;
  if (!pts || pts.length === 0) return "";

  const w = props.width;
  const h = props.height;
  const padding = 2;

  const validPts = pts.map((p) => (Number.isFinite(p) && p >= 0 ? p : 0));
  const minVal = Math.min(...validPts);
  const maxVal = Math.max(...validPts);
  const range = maxVal - minVal || 1;

  if (validPts.length === 1) {
    const y = h / 2;
    return `M 0 ${y} L ${w} ${y}`;
  }

  const stepX = (w - padding * 2) / (validPts.length - 1);

  return validPts
    .map((val, idx) => {
      const x = padding + idx * stepX;
      // Invert Y so highest value is top
      const normalized = (val - minVal) / range;
      const y = h - padding - normalized * (h - padding * 2);
      return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
});

const lastPoint = computed<{ x: number; y: number } | null>(() => {
  const pts = props.points;
  if (!pts || pts.length === 0) return null;
  const w = props.width;
  const h = props.height;
  const padding = 2;
  const validPts = pts.map((p) => (Number.isFinite(p) && p >= 0 ? p : 0));
  const minVal = Math.min(...validPts);
  const maxVal = Math.max(...validPts);
  const range = maxVal - minVal || 1;
  const lastVal = validPts[validPts.length - 1] ?? 0;
  const normalized = (lastVal - minVal) / range;
  const y = h - padding - normalized * (h - padding * 2);
  return { x: w - padding, y };
});
</script>

<template>
  <div class="inline-flex items-center font-mono select-none" :style="{ width: `${width}px`, height: `${height}px` }">
    <svg
      v-if="points && points.length > 0"
      :width="width"
      :height="height"
      class="overflow-visible"
      :aria-label="`Sparkline representing last ${points.length} telemetry latency points`"
    >
      <path
        :d="svgPath"
        fill="none"
        :stroke="color"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle
        v-if="lastPoint"
        :cx="lastPoint.x"
        :cy="lastPoint.y"
        r="2"
        :fill="color"
      />
    </svg>
    <div
      v-else
      class="w-full h-full flex items-center justify-center border-b border-dashed border-hairline text-[9px] text-text-muted"
    >
      --
    </div>
  </div>
</template>
