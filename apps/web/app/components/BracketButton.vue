<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    label?: string;
    icon?: string;
    variant?: "solid" | "outline" | "ghost" | "danger";
    disabled?: boolean;
    loading?: boolean;
    type?: "button" | "submit" | "reset";
    to?: string;
    size?: "xs" | "sm" | "md";
  }>(),
  {
    label: "",
    icon: undefined,
    variant: "outline",
    disabled: false,
    loading: false,
    type: "button",
    to: undefined,
    size: "sm",
  },
);

const emit = defineEmits<(e: "click", event: MouseEvent) => void>();

const variantClasses = computed<string>(() => {
  switch (props.variant) {
    case "solid":
      return "bg-brand-accent text-text-inverse hover:bg-brand-accent-hover border border-brand-accent font-semibold";
    case "danger":
      return "bg-status-down-bg text-status-down hover:bg-status-down hover:text-text-inverse border border-status-down-border font-semibold";
    case "ghost":
      return "bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-transparent";
    default:
      return "bg-surface text-text-primary hover:bg-surface-hover hover:border-hairline-strong border border-hairline";
  }
});

const sizeClasses = computed<string>(() => {
  switch (props.size) {
    case "xs":
      return "text-xs py-0.5 px-2";
    case "md":
      return "text-sm py-2 px-4";
    default:
      return "text-xs py-1.5 px-3";
  }
});

function handleClick(event: MouseEvent): void {
  if (props.disabled || props.loading) {
    event.preventDefault();
    return;
  }
  emit("click", event);
}
</script>

<template>
  <NuxtLink
    v-if="to && !disabled"
    :to="to"
    class="font-mono inline-flex items-center justify-center gap-1.5 rounded-xs transition-colors cursor-pointer select-none no-underline shadow-none"
    :class="[variantClasses, sizeClasses]"
    @click="handleClick"
  >
    <span class="text-text-muted">[</span>
    <span v-if="loading" class="animate-pulse">LOADING...</span>
    <template v-else>
      <span v-if="icon" :class="icon" aria-hidden="true" />
      <span>{{ label }}</span>
      <slot />
    </template>
    <span class="text-text-muted">]</span>
  </NuxtLink>

  <button
    v-else
    :type="type"
    :disabled="disabled || loading"
    class="font-mono inline-flex items-center justify-center gap-1.5 rounded-xs transition-colors select-none shadow-none"
    :class="[
      variantClasses,
      sizeClasses,
      disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    ]"
    @click="handleClick"
  >
    <span class="text-text-muted">[</span>
    <span v-if="loading" class="animate-pulse">PROCESSING...</span>
    <template v-else>
      <span v-if="icon" :class="icon" aria-hidden="true" />
      <span>{{ label }}</span>
      <slot />
    </template>
    <span class="text-text-muted">]</span>
  </button>
</template>
