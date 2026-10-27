<script setup lang="ts">
withDefaults(
  defineProps<{
    rows?: number;
    columns?: number;
  }>(),
  {
    rows: 5,
    columns: 6,
  },
);
</script>

<template>
  <div class="w-full space-y-2 py-2 font-mono">
    <div
      v-for="r in rows"
      :key="r"
      class="flex items-center gap-3 p-3 border-b border-hairline bg-surface/50"
    >
      <div
        v-for="c in columns"
        :key="c"
        class="h-4 bg-surface-elevated animate-pulse rounded-xs"
        :class="c === 1 ? 'w-24' : c === 2 ? 'w-16' : c === 3 ? 'w-48 flex-1' : 'w-20'"
      />
    </div>
  </div>
</template>
