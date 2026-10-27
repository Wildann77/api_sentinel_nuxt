<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    value?: string | number | Date | null;
    format?: "full" | "date-only" | "time-only";
  }>(),
  {
    value: undefined,
    format: "full",
  },
);

const isMounted = ref(false);
onMounted(() => {
  isMounted.value = true;
});

const timeData = computed(() => {
  if (!props.value) return null;
  const d = new Date(props.value);
  if (Number.isNaN(d.getTime())) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  const utcFormatted = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;

  const localHours = pad(d.getHours());
  const localMinutes = pad(d.getMinutes());
  const localSeconds = pad(d.getSeconds());
  const localFormatted = `${localHours}:${localMinutes}:${localSeconds}`;

  return {
    year,
    month,
    day,
    hours,
    minutes,
    seconds,
    utcFormatted,
    localFormatted,
    fullLocal: isMounted.value ? d.toLocaleString() : utcFormatted,
  };
});

const formatted = computed<string>(() => {
  if (!timeData.value) return "N/A";
  const { year, month, day, hours, minutes, seconds, localFormatted } = timeData.value;

  if (props.format === "date-only") {
    return `${year}-${month}-${day}`;
  }
  if (props.format === "time-only") {
    if (isMounted.value) {
      return `${localFormatted} (${hours}:${minutes} UTC)`;
    }
    return `${hours}:${minutes}:${seconds} UTC`;
  }
  if (isMounted.value) {
    return `${localFormatted} [${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC]`;
  }
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
});

const tooltip = computed<string>(() => {
  if (!timeData.value) return "";
  return `Waktu Lokal: ${timeData.value.fullLocal} | UTC: ${timeData.value.utcFormatted}`;
});
</script>

<template>
  <span
    class="font-mono text-xs text-text-secondary select-text whitespace-nowrap cursor-help"
    :title="tooltip"
  >
    {{ formatted }}
  </span>
</template>
