<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    label: string;
    value?: string | number | null;
    unit?: string;
    subtext?: string;
    status?: "operational" | "degraded" | "down" | "neutral" | "accent";
    loading?: boolean;
  }>(),
  {
    value: undefined,
    unit: undefined,
    subtext: undefined,
    status: "neutral",
    loading: false,
  },
);

const displayValue = computed<string>(() => {
  if (props.value === null || props.value === undefined || props.value === "") {
    return "N/A";
  }
  return String(props.value);
});

const valueColorClass = computed<string>(() => {
  if (displayValue.value === "N/A") {
    return "text-text-muted";
  }
  switch (props.status) {
    case "operational":
      return "text-status-operational";
    case "degraded":
      return "text-status-degraded";
    case "down":
      return "text-status-down";
    case "accent":
      return "text-brand-accent";
    default:
      return "text-text-primary";
  }
});
</script>

<template>
  <div
    class="border border-hairline bg-surface p-4 font-mono select-none flex flex-col justify-between transition-colors"
  >
    <div class="flex items-center justify-between text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
      <span>{{ label }}</span>
      <slot name="extra" />
    </div>

    <div v-if="loading" class="py-1">
      <div class="h-8 w-24 bg-surface-elevated animate-pulse rounded-xs" />
      <div v-if="subtext" class="h-3 w-16 bg-surface-elevated animate-pulse rounded-xs mt-2" />
    </div>

    <div v-else class="flex flex-col">
      <div class="flex items-baseline gap-1">
        <span class="text-2xl sm:text-3xl font-bold tracking-tight font-mono" :class="valueColorClass">
          {{ displayValue }}
        </span>
        <span v-if="unit && displayValue !== 'N/A'" class="text-xs font-medium text-text-muted">
          {{ unit }}
        </span>
      </div>

      <div v-if="subtext" class="text-xs text-text-muted mt-1.5 font-mono truncate">
        {{ subtext }}
      </div>
    </div>
  </div>
</template>
