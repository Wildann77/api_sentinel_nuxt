<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{
  value?: string | number | Date | null;
}>();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 10000);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});

const isoUtcString = computed<string>(() => {
  if (!props.value) return "";
  const d = new Date(props.value);
  if (Number.isNaN(d.getTime())) return "";
  const utc = d.toISOString().replace("T", " ").replace("Z", " UTC");
  return `Waktu Lokal: ${d.toLocaleString()} | UTC: ${utc}`;
});

const relativeText = computed<string>(() => {
  if (!props.value) return "N/A";
  const date = new Date(props.value);
  const time = date.getTime();
  if (Number.isNaN(time)) return "N/A";

  const diffSec = Math.floor((now.value - time) / 1000);

  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  const diffDays = Math.floor(diffHour / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toISOString().slice(0, 10);
});
</script>

<template>
  <span
    class="font-mono text-xs text-text-muted hover:text-text-secondary select-text whitespace-nowrap cursor-help"
    :title="isoUtcString"
  >
    {{ relativeText }}
  </span>
</template>
