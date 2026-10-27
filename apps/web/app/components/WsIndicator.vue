<script setup lang="ts">
import { computed } from "vue";
import { type SocketStatus, useSentinelSocket } from "../composables/use-sentinel-socket.js";

const props = defineProps<{
  status?: SocketStatus;
}>();

const socket = useSentinelSocket({ autoConnect: true });

const currentStatus = computed<SocketStatus>(() => {
  if (props.status) return props.status;
  return socket.status.value;
});

const config = computed(() => {
  switch (currentStatus.value) {
    case "LIVE":
      return {
        text: "● LIVE",
        ariaLabel: "WebSocket connection: Live and receiving real-time events",
        colorClass: "text-ws-live border-ws-live/30 bg-ws-live/10",
        dotClass: "bg-ws-live animate-ping",
      };
    case "SYNCING":
      return {
        text: "○ SYNCING...",
        ariaLabel: "WebSocket connection: Reconnecting or synchronizing state",
        colorClass: "text-ws-connecting border-ws-connecting/30 bg-ws-connecting/10",
        dotClass: "bg-ws-connecting animate-pulse",
      };
    default:
      return {
        text: "✕ DISCONNECTED",
        ariaLabel: "WebSocket connection: Disconnected from live telemetry stream",
        colorClass: "text-ws-disconnected border-ws-disconnected/30 bg-ws-disconnected/10",
        dotClass: "bg-ws-disconnected",
      };
  }
});
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 px-2 py-0.5 font-mono text-xs font-semibold rounded-xs border select-none transition-colors"
    :class="config.colorClass"
    role="status"
    :aria-label="config.ariaLabel"
  >
    <span class="text-text-muted">[</span>
    <span>{{ config.text }}</span>
    <span class="text-text-muted">]</span>
  </span>
</template>
