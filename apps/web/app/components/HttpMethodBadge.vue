<script setup lang="ts">
import type { HttpMethod } from "@sentinel/contracts";
import { computed } from "vue";

const props = defineProps<{
  method?: HttpMethod | string;
}>();

const normalizedMethod = computed<string>(() => {
  return (props.method ?? "GET").toUpperCase();
});

const methodClass = computed<string>(() => {
  switch (normalizedMethod.value) {
    case "GET":
      return "text-status-operational border-status-operational/40 bg-status-operational-bg";
    case "POST":
      return "text-status-degraded border-status-degraded/40 bg-status-degraded-bg";
    case "PUT":
      return "text-sky-400 border-sky-400/40 bg-sky-400/10";
    case "PATCH":
      return "text-violet-400 border-violet-400/40 bg-violet-400/10";
    case "DELETE":
      return "text-status-down border-status-down/40 bg-status-down-bg";
    case "HEAD":
      return "text-text-muted border-hairline bg-surface";
    default:
      return "text-text-secondary border-hairline bg-surface";
  }
});
</script>

<template>
  <span
    class="inline-flex items-center justify-center font-mono text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-xs border select-none transition-colors"
    :class="methodClass"
  >
    {{ normalizedMethod }}
  </span>
</template>
