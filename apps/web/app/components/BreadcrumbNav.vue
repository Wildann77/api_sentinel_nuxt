<script setup lang="ts">
import { computed } from "vue";

const route = useRoute();

interface BreadcrumbItem {
  label: string;
  to: string;
  isLast: boolean;
}

const items = computed<BreadcrumbItem[]>(() => {
  const path = route.path;
  const segments = path.split("/").filter(Boolean);

  const list: BreadcrumbItem[] = [
    {
      label: "sentinel",
      to: "/dashboard",
      isLast: segments.length === 0,
    },
  ];

  let currentPath = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    currentPath += `/${seg}`;
    list.push({
      label: seg,
      to: currentPath,
      isLast: i === segments.length - 1,
    });
  }

  return list;
});
</script>

<template>
  <nav
    class="border-b border-hairline bg-canvas-subtle px-4 py-1.5 font-mono text-xs flex items-center gap-1.5 overflow-x-auto select-none"
    aria-label="Breadcrumb"
  >
    <span class="text-brand-accent font-bold">&gt;</span>
    <span class="text-text-muted uppercase font-semibold text-[11px]">BREADCRUMB:</span>

    <div class="flex items-center gap-1.5 flex-nowrap">
      <template v-for="(item, idx) in items" :key="item.to">
        <span v-if="idx > 0" class="text-hairline-strong select-none">/</span>

        <NuxtLink
          v-if="!item.isLast"
          :to="item.to"
          class="text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        >
          {{ item.label }}
        </NuxtLink>

        <span
          v-else
          class="text-text-primary font-semibold"
          aria-current="page"
        >
          {{ item.label }}
        </span>
      </template>
    </div>
  </nav>
</template>
