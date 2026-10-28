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

    <!-- Offline / Stale Data Banner Strip DES §7 -->
    <div
      v-if="socket.status.value === 'DISCONNECTED'"
      class="bg-ws-disconnected/15 border-b border-ws-disconnected/40 px-3 sm:px-4 py-2 font-mono text-xs text-ws-disconnected flex flex-wrap items-center justify-between gap-2"
      role="status"
      aria-live="polite"
    >
      <div class="flex items-center gap-2">
        <span class="font-bold">[✕ DISCONNECTED]</span>
        <span class="text-text-secondary text-[11px] sm:text-xs">Menampilkan data cache lokal</span>
        <span class="px-1.5 py-0.5 bg-status-down-bg border border-status-down-border text-[10px] font-bold uppercase text-status-down">(STALE DATA)</span>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-ws-disconnected text-ws-disconnected hover:bg-ws-disconnected hover:text-text-inverse font-mono transition-colors cursor-pointer min-h-[36px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-ws-disconnected"
        aria-label="Coba hubungkan ulang WebSocket"
        @click="socket.reconnect()"
      >
        <span>[</span>
        <span>RECONNECT</span>
        <span>]</span>
      </button>
    </div>
    <div
      v-else-if="socket.status.value === 'SYNCING'"
      class="bg-ws-connecting/15 border-b border-ws-connecting/40 px-3 sm:px-4 py-1.5 font-mono text-xs text-ws-connecting flex items-center gap-2"
      role="status"
      aria-live="polite"
    >
      <span class="font-bold">[○ SYNCING...]</span>
      <span class="text-text-secondary text-[11px] sm:text-xs">Menyinkronkan telemetri real-time dengan server...</span>
    </div>

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
