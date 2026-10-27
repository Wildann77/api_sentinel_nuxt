<script setup lang="ts">
import { useAuth } from "../composables/use-auth.js";

const emit = defineEmits<(e: "openCommandPalette") => void>();

const route = useRoute();
const auth = useAuth();

interface NavTab {
  id: string;
  label: string;
  to: string;
  isActive: (currentPath: string) => boolean;
}

const navTabs: NavTab[] = [
  {
    id: "overview",
    label: "[01: OVERVIEW]",
    to: "/dashboard",
    isActive: (p) => p === "/dashboard" || p === "/dashboard/",
  },
  {
    id: "monitors",
    label: "[02: MONITORS]",
    to: "/dashboard/monitors",
    isActive: (p) => p.startsWith("/dashboard/monitors"),
  },
  {
    id: "incidents",
    label: "[03: INCIDENTS]",
    to: "/dashboard/incidents",
    isActive: (p) => p.startsWith("/dashboard/incidents"),
  },
  {
    id: "settings",
    label: "[04: SETTINGS]",
    to: "/dashboard/settings",
    isActive: (p) => p.startsWith("/dashboard/settings"),
  },
];

async function handleLogout(): Promise<void> {
  await auth.logout();
}
</script>

<template>
  <header
    class="h-12 border-b border-hairline bg-surface px-3 sm:px-4 flex items-center justify-between font-mono text-xs select-none sticky top-0 z-40 transition-colors"
  >
    <!-- Left: Brand Glyph & Terminal Tabs -->
    <div class="flex items-center gap-1 sm:gap-4 h-full">
      <!-- Brand Glyph [SENTINEL_] -->
      <NuxtLink
        to="/dashboard"
        class="font-bold text-xs sm:text-sm tracking-wider text-text-primary hover:text-brand-accent transition-colors flex items-center py-1 mr-1 sm:mr-3"
      >
        <span class="text-brand-accent font-mono">[</span>
        <span>SENTINEL</span>
        <span class="text-brand-accent animate-pulse font-bold">_</span>
        <span class="text-brand-accent font-mono">]</span>
      </NuxtLink>

      <!-- Horizontal Tabs -->
      <nav class="hidden md:flex items-center h-full gap-0.5" aria-label="Main Navigation">
        <NuxtLink
          v-for="tab in navTabs"
          :key="tab.id"
          :to="tab.to"
          class="h-9 px-3 flex items-center text-xs font-mono transition-colors border-b-2"
          :class="[
            tab.isActive(route.path)
              ? 'text-text-primary bg-surface-elevated border-brand-accent font-semibold'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover border-transparent',
          ]"
        >
          {{ tab.label }}
        </NuxtLink>
      </nav>
    </div>

    <!-- Right: Telemetry Pulse, Shortcut, Theme, Auth -->
    <div class="flex items-center gap-2 sm:gap-3">
      <!-- Live WebSocket Pulse -->
      <WsIndicator />

      <!-- Quick Command Palette Shortcut [Ctrl+K] -->
      <button
        type="button"
        class="hidden sm:inline-flex items-center gap-1 font-mono text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded-xs border border-hairline hover:border-hairline-strong bg-surface hover:bg-surface-hover transition-colors cursor-pointer"
        aria-label="Open command palette"
        @click="emit('openCommandPalette')"
      >
        <span>[</span>
        <span class="text-text-secondary font-medium">Ctrl+K</span>
        <span>]</span>
      </button>

      <!-- Theme Switcher [THEME] -->
      <ThemeToggle />

      <!-- Logout Button [LOGOUT] -->
      <button
        type="button"
        class="font-mono text-xs text-text-muted hover:text-status-down px-2 py-1 rounded-xs border border-hairline hover:border-status-down-border bg-surface hover:bg-status-down-bg transition-colors cursor-pointer"
        aria-label="Exit system and logout"
        @click="handleLogout"
      >
        <span>[</span>
        <span>LOGOUT</span>
        <span>]</span>
      </button>
    </div>
  </header>
</template>
