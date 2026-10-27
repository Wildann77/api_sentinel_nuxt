<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    actionLabel?: string;
    actionTo?: string;
  }>(),
  {
    title: "TIDAK ADA DATA AKTIF",
    description: "Belum ada item atau metrik yang tersedia untuk ditampilkan.",
    actionLabel: undefined,
    actionTo: undefined,
  },
);

const emit = defineEmits<(e: "action") => void>();
</script>

<template>
  <div
    class="border border-dashed border-hairline-strong bg-canvas-subtle p-8 sm:p-12 text-center font-mono select-none my-4 flex flex-col items-center justify-center transition-colors"
  >
    <div class="text-text-muted mb-2 text-sm tracking-widest uppercase font-semibold">
      [ <span class="text-text-secondary">{{ title }}</span> ]
    </div>

    <p v-if="description" class="text-text-muted text-xs max-w-md mx-auto leading-relaxed mb-5 font-normal">
      {{ description }}
    </p>

    <div v-if="$slots.action || actionLabel" class="mt-2">
      <slot name="action">
        <BracketButton
          v-if="actionLabel"
          :label="actionLabel"
          :to="actionTo"
          variant="solid"
          @click="emit('action')"
        />
      </slot>
    </div>
  </div>
</template>
