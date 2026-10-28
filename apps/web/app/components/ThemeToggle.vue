<script setup lang="ts">
import { computed } from "vue";

const colorMode = useColorMode();

const isDark = computed({
  get(): boolean {
    return colorMode.value === "dark";
  },
  set(val: boolean): void {
    colorMode.preference = val ? "dark" : "light";
  },
});
</script>

<template>
  <ClientOnly>
    <button
      type="button"
      class="font-mono text-xs text-text-secondary hover:text-text-primary px-2.5 py-1 rounded-xs border border-hairline hover:border-hairline-strong bg-surface hover:bg-surface-hover transition-colors cursor-pointer select-none inline-flex items-center gap-1.5 min-h-[36px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-text-muted focus-visible:outline-offset-2"
      :aria-label="`Switch to ${isDark ? 'light' : 'dark'} mode`"
      @click="isDark = !isDark"
    >
      <span class="text-text-muted">[THEME:</span>
      <span :class="isDark ? 'text-brand-accent font-semibold' : 'text-amber-500 font-semibold'">
        {{ isDark ? 'DARK' : 'LIGHT' }}
      </span>
      <span class="text-text-muted">]</span>
    </button>
    <template #fallback>
      <span class="font-mono text-xs text-text-muted px-2.5 py-1 border border-hairline rounded-xs bg-surface inline-flex items-center min-h-[36px]">
        [THEME]
      </span>
    </template>
  </ClientOnly>
</template>
