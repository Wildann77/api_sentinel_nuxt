<script setup lang="ts">
import type { HealthStatus } from "@sentinel/contracts";
import { computed } from "vue";

export type StatusBadgeInput = HealthStatus | "OPERATIONAL";

const props = withDefaults(
  defineProps<{
    status: StatusBadgeInput;
    pulse?: boolean;
  }>(),
  {
    pulse: false,
  },
);

interface StatusConfig {
  label: string;
  ariaLabel: string;
  badgeClass: string;
}

const config = computed<StatusConfig>(() => {
  const s = props.status?.toUpperCase() ?? "UNKNOWN";
  switch (s) {
    case "UP":
    case "OPERATIONAL":
      return {
        label: "[OPERATIONAL]",
        ariaLabel: "Status Monitor: Operational, semua assertion lolos",
        badgeClass:
          "text-status-operational bg-status-operational-bg border-status-operational-border",
      };
    case "DEGRADED":
      return {
        label: "[DEGRADED]",
        ariaLabel: "Status Monitor: Degraded, kegagalan beruntun terdeteksi",
        badgeClass: "text-status-degraded bg-status-degraded-bg border-status-degraded-border",
      };
    case "DOWN":
      return {
        label: "[DOWN]",
        ariaLabel: "Status Monitor: Down, ambang batas kegagalan terlampaui",
        badgeClass: "text-status-down bg-status-down-bg border-status-down-border",
      };
    case "PAUSED":
      return {
        label: "[PAUSED]",
        ariaLabel: "Status Monitor: Paused, pemantauan dinonaktifkan sementara",
        badgeClass: "text-status-paused bg-status-paused-bg border-status-paused-border",
      };
    default:
      return {
        label: "[UNKNOWN]",
        ariaLabel: "Status Monitor: Unknown, status belum terverifikasi",
        badgeClass: "text-status-unknown bg-status-unknown-bg border-status-unknown-border",
      };
  }
});
</script>

<template>
  <span
    class="inline-flex items-center px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider rounded-xs border select-none transition-colors"
    :class="[config.badgeClass, { 'animate-pulse': pulse }]"
    :aria-label="config.ariaLabel"
    role="status"
  >
    {{ config.label }}
  </span>
</template>
