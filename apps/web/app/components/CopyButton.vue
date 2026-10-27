<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    text: string;
    label?: string;
    size?: "xs" | "sm";
  }>(),
  {
    label: "COPY",
    size: "xs",
  },
);

const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

async function copyToClipboard(): Promise<void> {
  if (!props.text || copied.value) return;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(props.text);
    } else {
      const el = document.createElement("textarea");
      el.value = props.text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }

    copied.value = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // Clipboard permission denied or unsupported
  }
}
</script>

<template>
  <button
    type="button"
    class="font-mono inline-flex items-center gap-1 rounded-xs border border-hairline bg-surface hover:bg-surface-hover hover:border-hairline-strong transition-colors select-none cursor-pointer"
    :class="[
      size === 'xs' ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2.5 py-1',
      copied ? 'text-status-operational border-status-operational/50' : 'text-text-muted hover:text-text-primary',
    ]"
    :aria-label="copied ? 'Copied to clipboard' : `Copy ${text} to clipboard`"
    @click.stop="copyToClipboard"
  >
    <span class="text-text-muted">[</span>
    <span v-if="copied" class="font-bold">COPIED!</span>
    <span v-else>{{ label }}</span>
    <span class="text-text-muted">]</span>
  </button>
</template>
