<script setup lang="ts">
// app.vue - Root Application Component wrapped in UApp
</script>

<template>
  <UApp>
    <div class="min-h-screen bg-canvas text-text-primary font-mono antialiased selection:bg-brand-accent selection:text-text-inverse">
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </div>
  </UApp>
</template>
