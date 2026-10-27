<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useAuth } from "../composables/use-auth.js";

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
  }>(),
  {
    modelValue: false,
  },
);

const emit = defineEmits<(e: "update:modelValue", value: boolean) => void>();

const isOpen = ref(props.modelValue);
const auth = useAuth();
const colorMode = useColorMode();

function openPalette(): void {
  isOpen.value = true;
  emit("update:modelValue", true);
}

function closePalette(): void {
  isOpen.value = false;
  emit("update:modelValue", false);
}

function toggleTheme(): void {
  colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
  closePalette();
}

async function handleLogout(): Promise<void> {
  closePalette();
  await auth.logout();
}

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  to?: string;
  onSelect?: () => void;
}

interface CommandGroup {
  id: string;
  label: string;
  items: CommandItem[];
}

const groups: CommandGroup[] = [
  {
    id: "navigation",
    label: "NAVIGASI HALAMAN",
    items: [
      {
        id: "nav-overview",
        label: "[01: OVERVIEW]",
        description: "Dashboard ringkasan metrik global dan feed real-time",
        to: "/dashboard",
        onSelect: () => closePalette(),
      },
      {
        id: "nav-monitors",
        label: "[02: MONITORS]",
        description: "Daftar inventaris endpoint API, sparkline, dan filter",
        to: "/dashboard/monitors",
        onSelect: () => closePalette(),
      },
      {
        id: "nav-new-monitor",
        label: "[+ TAMBAH MONITOR BARU]",
        description: "Konfigurasi target probe, auth headers, dan assertions",
        to: "/dashboard/monitors/new",
        onSelect: () => closePalette(),
      },
      {
        id: "nav-incidents",
        label: "[03: INCIDENTS]",
        description: "Pelacakan insiden terbuka, riwayat downtime, dan recovery",
        to: "/dashboard/incidents",
        onSelect: () => closePalette(),
      },
      {
        id: "nav-settings",
        label: "[04: SETTINGS]",
        description: "Konfigurasi bot Telegram, kredensial owner, dan ekspor CSV",
        to: "/dashboard/settings",
        onSelect: () => closePalette(),
      },
    ],
  },
  {
    id: "actions",
    label: "AKSI SISTEM",
    items: [
      {
        id: "action-theme",
        label: "[TOGGLE THEME: DARK / LIGHT]",
        description: "Beralih antara mode True Dark Terminal dan Warm Cream Light",
        onSelect: () => toggleTheme(),
      },
      {
        id: "action-logout",
        label: "[KELUAR SISTEM / LOGOUT]",
        description: "Hapus sesi aktif dan kembali ke gerbang login",
        onSelect: () => {
          void handleLogout();
        },
      },
    ],
  },
];

function handleKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (isOpen.value) {
      closePalette();
    } else {
      openPalette();
    }
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});

defineExpose({
  open: openPalette,
  close: closePalette,
});
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :ui="{
      content: 'font-mono bg-surface border border-hairline max-w-xl p-0 overflow-hidden rounded-none shadow-none',
      body: 'p-0',
    }"
    @update:open="emit('update:modelValue', $event)"
  >
    <template #content>
      <div class="border-b border-hairline px-3 py-2 bg-canvas-subtle flex items-center justify-between text-xs text-text-secondary font-mono">
        <span class="font-bold">[SENTINEL::COMMAND_PALETTE]</span>
        <span class="text-text-muted">[ESC untuk tutup]</span>
      </div>

      <UCommandPalette
        :groups="groups"
        placeholder="Ketik perintah navigasi atau aksi..."
        class="font-mono text-xs"
        :ui="{
          root: 'bg-surface font-mono text-xs',
          input: 'font-mono text-xs text-text-primary bg-surface border-b border-hairline py-3 px-3 placeholder:text-text-muted',
          group: 'p-2 border-b border-hairline last:border-b-0',
          label: 'text-[10px] text-text-muted font-bold uppercase tracking-wider px-2 py-1',
          item: 'font-mono text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover px-2 py-1.5 cursor-pointer rounded-xs flex items-center justify-between',
        }"
        @update:model-value="closePalette"
      />
    </template>
  </UModal>
</template>
