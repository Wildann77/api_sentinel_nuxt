<script setup lang="ts">
import { onMounted, ref } from "vue";
import type CommandPaletteModal from "../components/CommandPaletteModal.vue";
import { useSentinelSocket } from "../composables/use-sentinel-socket.js";

const commandPaletteRef = ref<InstanceType<typeof CommandPaletteModal> | null>(null);

function handleOpenCommandPalette(): void {
  commandPaletteRef.value?.open();
}

const socket = useSentinelSocket({ autoConnect: true });

onMounted(() => {
  socket.subscribe();
});
</script>

<template>
  <div class="min-h-screen flex flex-col bg-canvas text-text-primary font-mono antialiased">
    <!-- Topbar Navigation (48px) -->
    <TopbarNav @open-command-palette="handleOpenCommandPalette" />

    <!-- Breadcrumb Stream -->
    <BreadcrumbNav />

    <!-- Main Content Container (Locked to max 1440px desktop) -->
    <main class="flex-1 max-w-[1440px] w-full mx-auto p-3 sm:p-6">
      <slot />
    </main>

    <!-- Global Command Palette (Ctrl+K) -->
    <CommandPaletteModal ref="commandPaletteRef" />
  </div>
</template>
