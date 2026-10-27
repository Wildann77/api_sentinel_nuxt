<script setup lang="ts">
import { computed } from "vue";

export interface ProblemDetailsError {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  invalidParams?: Array<{ name: string; reason: string }>;
}

const props = withDefaults(
  defineProps<{
    error?: ProblemDetailsError | string | null;
    retryable?: boolean;
    showInstance?: boolean;
  }>(),
  {
    error: null,
    retryable: false,
    showInstance: false,
  },
);

const emit = defineEmits<{
  (e: "retry"): void;
  (e: "dismiss"): void;
}>();

const parsedError = computed<ProblemDetailsError | null>(() => {
  if (!props.error) return null;
  if (typeof props.error === "string") {
    return {
      title: "Operation Failed",
      detail: props.error,
    };
  }
  return props.error;
});
</script>

<template>
  <div
    v-if="parsedError"
    class="border border-status-down-border bg-status-down-bg text-status-down p-2.5 sm:p-3 font-mono text-xs rounded-none transition-colors select-none"
    role="alert"
    aria-live="assertive"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="font-bold uppercase tracking-wider text-status-down flex-1 text-xs leading-snug">
        <span>[! ERROR<span v-if="parsedError.status"> {{ parsedError.status }}</span>: {{ (parsedError.title || 'UNEXPECTED_FAILURE').toUpperCase() }}]</span>
      </div>

      <button
        type="button"
        class="text-status-down/70 hover:text-status-down cursor-pointer select-none font-bold text-xs shrink-0 leading-none"
        aria-label="Dismiss error notification"
        @click="emit('dismiss')"
      >
        [✕]
      </button>
    </div>

    <div v-if="parsedError.detail" class="text-text-primary text-[11px] mt-1.5 leading-relaxed font-normal">
      {{ parsedError.detail }}
    </div>

    <div v-if="parsedError.invalidParams?.length" class="mt-2 pt-2 border-t border-status-down-border/40">
      <div class="text-[10px] text-text-secondary uppercase mb-1 font-semibold">Validation Violations:</div>
      <ul class="list-none space-y-1 pl-1">
        <li
          v-for="(param, idx) in parsedError.invalidParams"
          :key="idx"
          class="text-text-muted text-[11px] flex items-start gap-1"
        >
          <span class="text-status-down">&gt;</span>
          <span class="text-text-primary font-medium">{{ param.name }}:</span>
          <span>{{ param.reason }}</span>
        </li>
      </ul>
    </div>

    <div v-if="showInstance && parsedError.instance" class="text-[10px] text-text-muted mt-2 font-mono">
      Instance: {{ parsedError.instance }}
    </div>

    <div v-if="retryable" class="mt-2.5 pt-2 border-t border-status-down-border/40 flex justify-end">
      <button
        type="button"
        class="px-2 py-0.5 text-[11px] border border-status-down text-status-down hover:bg-status-down hover:text-text-inverse font-mono cursor-pointer transition-colors"
        @click="emit('retry')"
      >
        [COBA LAGI / RETRY]
      </button>
    </div>
  </div>
</template>
