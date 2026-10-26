// apps/web/nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: "2026-10-24",
  future: {
    compatibilityVersion: 4,
  },
  modules: ["@nuxt/ui"],
  css: ["~/assets/css/main.css"],
  colorMode: {
    preference: "dark",
    fallback: "dark",
    storageKey: "sentinel-color-mode",
  },
  app: {
    head: {
      title: "API Sentinel",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        {
          name: "description",
          content: "Self-hosted, high-performance API monitoring and reliability platform",
        },
      ],
      link: [
        {
          rel: "preconnect",
          href: "https://fonts.googleapis.com",
        },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossorigin: "",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap",
        },
      ],
    },
  },
  routeRules: {
    "/login": { ssr: true },
    "/dashboard/**": { ssr: false },
    "/api/**": { cors: false },
  },
  nitro: {
    preset: "node-server",
    experimental: {
      websocket: true,
    },
  },
  build: {
    transpile: [
      "@sentinel/domain",
      "@sentinel/application",
      "@sentinel/infra",
      "@sentinel/contracts",
    ],
  },
});
