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
        ariaLabel:
          "WebSocket connection: Disconnected from live telemetry stream. Click to reconnect.",
        colorClass:
          "text-ws-disconnected border-ws-disconnected/30 bg-ws-disconnected/10 hover:bg-ws-disconnected/20 cursor-pointer",
        dotClass: "bg-ws-disconnected",
      };
  }
});

function handleAction(): void {
  if (currentStatus.value !== "LIVE") {
    socket.reconnect();
  }
}
</script>

<template>
  <button
    v-if="currentStatus !== 'LIVE'"
    type="button"
    class="inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-xs font-semibold rounded-xs border select-none transition-colors cursor-pointer min-h-[36px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-text-muted focus-visible:outline-offset-2"
    :class="config.colorClass"
    role="status"
    :aria-label="config.ariaLabel"
    @click="handleAction"
  >
    <span class="text-text-muted">[</span>
    <span>{{ config.text }}</span>
    <span class="text-text-muted">]</span>
  </button>
  <span
    v-else
    class="inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-xs font-semibold rounded-xs border select-none transition-colors min-h-[36px]"
    :class="config.colorClass"
    role="status"
    :aria-label="config.ariaLabel"
  >
    <span class="text-text-muted">[</span>
    <span>{{ config.text }}</span>
    <span class="text-text-muted">]</span>
  </span>
</template>
