import type { Ref } from "vue";

declare global {
  function useState<T>(key: string, init?: () => T): Ref<T>;
  function $fetch<T = unknown>(request: string, opts?: Record<string, unknown>): Promise<T>;
  function navigateTo(to: string): Promise<unknown>;
  function useRoute(): {
    path: string;
    fullPath: string;
    query: Record<string, unknown>;
    params: Record<string, unknown>;
  };
  function useColorMode(): { value: string; preference: string };
  function definePageMeta(meta: Record<string, unknown>): void;
  function defineNuxtPlugin<T>(
    plugin: (nuxtApp: { vueApp: { use: (plugin: unknown, options?: unknown) => void } }) => T,
  ): (nuxtApp: { vueApp: { use: (plugin: unknown, options?: unknown) => void } }) => T;
}
