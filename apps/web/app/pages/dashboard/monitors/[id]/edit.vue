<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useMonitorQuery } from "../../../../composables/use-monitors.js";

definePageMeta({
  layout: "default",
});

const route = useRoute();
const monitorId = computed<string>(() => String(route.params.id || ""));

const { data: monitor, isLoading, error, refetch } = useMonitorQuery(monitorId);
</script>

<template>
  <div class="space-y-6">
    <!-- Header Section -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-brand-accent font-bold">&gt;</span>
          <h1 class="text-sm sm:text-base font-bold tracking-wider text-text-primary uppercase">
            [EDIT KONFIGURASI MONITOR<span v-if="monitor">: {{ monitor.name }}</span>]
          </h1>
        </div>
        <p class="text-xs text-text-secondary mt-1">
          Ubah parameter request, jadwal interval, secret terenkripsi, dan aturan validasi respons kontrak API.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <NuxtLink
          to="/dashboard/monitors"
          class="text-xs font-mono text-text-secondary hover:text-text-primary flex items-center gap-1 transition-colors"
        >
          <span>&lt; KEMBALI KE INVENTARIS</span>
        </NuxtLink>
      </div>
    </div>

    <!-- Error State -->
    <ProblemAlert
      v-if="error"
      :error="error.message || 'Gagal memuat detail monitor dari server.'"
      retryable
      @retry="() => refetch()"
    />

    <!-- Loading State -->
    <div v-else-if="isLoading" class="p-6 bg-surface border border-hairline space-y-4">
      <div class="text-xs text-text-muted font-mono animate-pulse">
        [MEMUAT KONFIGURASI MONITOR TERDAFTAR...]
      </div>
      <SkeletonRows :count="6" />
    </div>

    <!-- Edit Form -->
    <MonitorForm
      v-else-if="monitor"
      mode="edit"
      :initial-data="monitor"
      :loading="isLoading"
    />
  </div>
</template>
