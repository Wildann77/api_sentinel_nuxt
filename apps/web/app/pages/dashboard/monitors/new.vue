<script setup lang="ts">
definePageMeta({
  layout: "default",
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header Section -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-brand-accent font-bold">&gt;</span>
          <h1 class="text-sm sm:text-base font-bold tracking-wider text-text-primary uppercase">
            [+ TAMBAH MONITOR BARU]
          </h1>
        </div>
        <p class="text-xs text-text-secondary mt-1">
          Konfigurasi endpoint API target, parameter autentikasi, interval jadwal, dan aturan assertion validasi respons.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <NuxtLink
          to="/dashboard/monitors"
          class="text-xs font-mono text-text-secondary hover:text-text-primary flex items-center gap-1 transition-colors"
        >
          <span>&lt; KEMBALI KE INVENTARIS</span>
        </NuxtLink>
      </div>
    </div>

    <!-- Shared Form Component -->
    <MonitorForm mode="create" />
  </div>
</template>
