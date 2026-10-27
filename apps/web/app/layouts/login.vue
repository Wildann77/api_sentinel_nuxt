<script setup lang="ts">
// Minimal terminal login layout (no topbar navigation or tabs)
</script>

<template>
  <div class="min-h-screen flex flex-col justify-between bg-canvas text-text-primary font-mono antialiased p-4 sm:p-6">
    <!-- Header with Theme Toggle -->
    <header class="flex items-center justify-between max-w-md w-full mx-auto select-none">
      <div class="text-xs font-bold tracking-wider text-text-primary flex items-center gap-1">
        <span class="text-brand-accent">[</span>
        <span>SENTINEL</span>
        <span class="text-brand-accent animate-pulse">_</span>
        <span class="text-brand-accent">]</span>
      </div>

      <ThemeToggle />
    </header>

    <!-- Centered Auth Container -->
    <main class="flex-1 flex items-center justify-center py-8">
      <slot />
    </main>

    <!-- Footer Security Notice -->
    <footer class="text-center text-[11px] text-text-dim select-none font-mono py-2">
      <span>API SENTINEL // ZERO-LEAK ACCESS GATE // RFC 9457 COMPLIANT</span>
    </footer>
  </div>
</template>
