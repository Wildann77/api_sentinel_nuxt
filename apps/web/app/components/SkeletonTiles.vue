<script setup lang="ts">
withDefaults(
  defineProps<{
    count?: number;
  }>(),
  {
    count: 4,
  },
);
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full font-mono">
    <div
      v-for="i in count"
      :key="i"
      class="border border-hairline bg-surface p-4 flex flex-col justify-between"
    >
      <div class="h-3.5 w-24 bg-surface-elevated animate-pulse rounded-xs mb-3" />
      <div class="h-8 w-28 bg-surface-elevated animate-pulse rounded-xs mb-2" />
      <div class="h-3 w-16 bg-surface-elevated animate-pulse rounded-xs" />
    </div>
  </div>
</template>
