<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useAuth } from "../composables/use-auth.js";

const emit = defineEmits<(e: "openCommandPalette") => void>();

const router = useRouter();
const route = useRoute();
const auth = useAuth();

interface NavTab {
  id: string;
  name: string;
  label: string;
  to: string;
  isActive: (currentPath: string) => boolean;
}

const navTabs: NavTab[] = [
  {
    id: "overview",
    name: "OVERVIEW",
    label: "[01: OVERVIEW]",
    to: "/dashboard",
    isActive: (p) => p === "/dashboard" || p === "/dashboard/",
  },
  {
    id: "monitors",
    name: "MONITORS",
    label: "[02: MONITORS]",
    to: "/dashboard/monitors",
    isActive: (p) => p.startsWith("/dashboard/monitors"),
  },
  {
    id: "incidents",
    name: "INCIDENTS",
    label: "[03: INCIDENTS]",
    to: "/dashboard/incidents",
    isActive: (p) => p.startsWith("/dashboard/incidents"),
  },
  {
    id: "settings",
    name: "SETTINGS",
    label: "[04: SETTINGS]",
    to: "/dashboard/settings",
    isActive: (p) => p.startsWith("/dashboard/settings"),
  },
];

const activeTab = computed(() => {
  return navTabs.find((t) => t.isActive(route.path)) ?? navTabs[0];
});

const mobileDropdownItems = computed(() => [
  navTabs.map((tab) => ({
    label: tab.label,
    icon: tab.isActive(route.path) ? "i-lucide-check" : "i-lucide-chevron-right",
    to: tab.to,
  })),
]);

const tabElementRefs = ref<HTMLElement[]>([]);

function setTabRef(el: unknown, index: number): void {
  if (el && typeof el === "object") {
    const target = "$el" in el ? (el as { $el: unknown }).$el : el;
    if (target instanceof HTMLElement) {
      tabElementRefs.value[index] = target;
    }
  }
}

async function onTabKeydown(e: KeyboardEvent, index: number): Promise<void> {
  let targetIndex = -1;
  if (e.key === "ArrowRight") {
    targetIndex = (index + 1) % navTabs.length;
  } else if (e.key === "ArrowLeft") {
    targetIndex = (index - 1 + navTabs.length) % navTabs.length;
  }
  if (targetIndex >= 0) {
    e.preventDefault();
    const targetTab = navTabs[targetIndex];
    if (targetTab) {
      await router.push(targetTab.to);
      await nextTick();
      tabElementRefs.value[targetIndex]?.focus();
    }
  }
}

async function handleLogout(): Promise<void> {
  await auth.logout();
}
</script>

<template>
  <header
    class="h-12 border-b border-hairline bg-surface px-2.5 sm:px-4 flex items-center justify-between font-mono text-xs select-none sticky top-0 z-40 transition-colors"
  >
    <!-- Left: Brand Glyph & Terminal Tabs / Mobile Dropdown -->
    <div class="flex items-center gap-1 sm:gap-4 h-full">
      <!-- Brand Glyph [SENTINEL_] -->
      <NuxtLink
        to="/dashboard"
        class="font-bold text-xs sm:text-sm tracking-wider text-text-primary hover:text-brand-accent transition-colors flex items-center py-1 mr-1 sm:mr-3 min-h-[36px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-text-muted focus-visible:outline-offset-2"
        aria-label="API Sentinel Dashboard Home"
      >
        <span class="text-brand-accent font-mono">[</span>
        <span>SENTINEL</span>
        <span class="text-brand-accent animate-pulse font-bold">_</span>
        <span class="text-brand-accent font-mono">]</span>
      </NuxtLink>

      <!-- Mobile Navigation Dropdown (< 768px) DES §9 -->
      <div class="md:hidden flex items-center">
        <UDropdownMenu
          :items="mobileDropdownItems"
          :ui="{
            content: 'font-mono text-xs bg-surface border border-hairline rounded-none shadow-xl min-w-52 py-1 z-50',
            item: 'font-mono text-xs hover:bg-surface-hover rounded-none px-3 py-2.5 cursor-pointer min-h-[44px]',
          }"
        >
          <button
            type="button"
            class="h-10 px-2 flex items-center gap-1 font-mono text-xs font-semibold text-text-primary bg-surface hover:bg-surface-hover border border-hairline transition-colors cursor-pointer min-h-[44px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-text-muted"
            aria-label="Buka Menu Navigasi Terminal"
          >
            <span>[MENU: {{ activeTab?.name }} ▾]</span>
          </button>
        </UDropdownMenu>
      </div>

      <!-- Horizontal Tabs Desktop (>= 768px) with Keyboard Arrow Navigation -->
      <nav
        class="hidden md:flex items-center h-full gap-0.5"
        role="tablist"
        aria-label="Main Terminal Navigation"
      >
        <NuxtLink
          v-for="(tab, idx) in navTabs"
          :key="tab.id"
          :ref="(el) => setTabRef(el, idx)"
          :to="tab.to"
          role="tab"
          :aria-selected="tab.isActive(route.path)"
          :tabindex="tab.isActive(route.path) ? 0 : -1"
          class="h-9 px-3 flex items-center text-xs font-mono transition-colors border-b-2 min-h-[36px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-text-muted focus-visible:outline-offset-2"
          :class="[
            tab.isActive(route.path)
              ? 'text-text-primary bg-surface-elevated border-brand-accent font-semibold'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover border-transparent',
          ]"
          @keydown="onTabKeydown($event, idx)"
        >
          {{ tab.label }}
        </NuxtLink>
      </nav>
    </div>

    <!-- Right: Telemetry Pulse, Shortcut, Theme, Auth -->
    <div class="flex items-center gap-1.5 sm:gap-3">
      <!-- Live WebSocket Pulse & Reconnect Action -->
      <WsIndicator />

      <!-- Quick Command Palette Shortcut [Ctrl+K] -->
      <button
        type="button"
        class="hidden sm:inline-flex items-center gap-1 font-mono text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded-xs border border-hairline hover:border-hairline-strong bg-surface hover:bg-surface-hover transition-colors cursor-pointer min-h-[36px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-text-muted focus-visible:outline-offset-2"
        aria-label="Buka command palette (Ctrl+K)"
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
        class="font-mono text-xs text-text-muted hover:text-status-down px-2 sm:px-2.5 py-1 rounded-xs border border-hairline hover:border-status-down-border bg-surface hover:bg-status-down-bg transition-colors cursor-pointer min-h-[36px] sm:min-h-[36px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-status-down-border focus-visible:outline-offset-2"
        aria-label="Keluar sistem dan logout"
        @click="handleLogout"
      >
        <span>[</span>
        <span>LOGOUT</span>
        <span>]</span>
      </button>
    </div>
  </header>
</template>
