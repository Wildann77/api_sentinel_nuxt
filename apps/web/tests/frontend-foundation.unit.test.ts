import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const g = globalThis as unknown as {
  defineAppConfig?: <T>(c: T) => T;
  defineNuxtConfig?: <T>(c: T) => T;
};
g.defineAppConfig ??= <T>(c: T): T => c;
g.defineNuxtConfig ??= <T>(c: T): T => c;

interface TerminalUiConfig {
  colors: { primary: string; neutral: string };
  button: {
    defaultVariants: { size: string; color: string; variant: string };
    slots: { base: string };
  };
  input: {
    defaultVariants: { size: string };
    slots: { base: string };
  };
  badge: {
    defaultVariants: { size: string; variant: string };
    slots: { base: string };
  };
  table: {
    slots: { th: string; td: string };
  };
  card: {
    slots: { root: string };
  };
}

interface TestNuxtConfig {
  future?: { compatibilityVersion?: number };
  modules?: string[];
  css?: string[];
  routeRules?: Record<string, unknown>;
  nitro?: { preset?: string; experimental?: { websocket?: boolean } };
  build?: { transpile?: string[] };
  colorMode?: { preference?: string; fallback?: string; storageKey?: string };
}

describe("Frontend Foundation & Terminal System (Phase 14)", () => {
  let appConfig: { ui: TerminalUiConfig };
  let nuxtConfig: TestNuxtConfig;

  beforeAll(async () => {
    const appMod = (await import("../app/app.config.js")) as {
      default: { ui: TerminalUiConfig };
    };
    const nuxtMod = (await import("../nuxt.config.js")) as {
      default: TestNuxtConfig;
    };
    appConfig = appMod.default;
    nuxtConfig = nuxtMod.default;
  });

  it("nuxt.config.ts complies with ARCH §8.1 and Nuxt 4 requirements", () => {
    expect(nuxtConfig.future?.compatibilityVersion).toBe(4);
    expect(nuxtConfig.modules).toContain("@nuxt/ui");
    expect(nuxtConfig.css).toContain("~/assets/css/main.css");
    expect(nuxtConfig.routeRules).toEqual({
      "/login": { ssr: true },
      "/dashboard/**": { ssr: false },
      "/api/**": { cors: false },
    });
    expect(nuxtConfig.nitro?.preset).toBe("node-server");
    expect(nuxtConfig.nitro?.experimental?.websocket).toBe(true);
    expect(nuxtConfig.build?.transpile).toEqual([
      "@sentinel/domain",
      "@sentinel/application",
      "@sentinel/infra",
      "@sentinel/contracts",
    ]);
    expect(nuxtConfig.colorMode?.preference).toBe("dark");
    expect(nuxtConfig.colorMode?.fallback).toBe("dark");
    expect(nuxtConfig.colorMode?.storageKey).toBe("sentinel-color-mode");
  });

  it("app.config.ts overrides Nuxt UI components with terminal styling (D-22)", () => {
    const ui = appConfig.ui;
    expect(ui.colors.primary).toBe("emerald");
    expect(ui.colors.neutral).toBe("zinc");

    expect(ui.button.defaultVariants.size).toBe("sm");
    expect(ui.button.defaultVariants.color).toBe("primary");
    expect(ui.button.defaultVariants.variant).toBe("solid");
    expect(ui.button.slots.base).toContain("font-mono");
    expect(ui.button.slots.base).toContain("rounded-xs");

    expect(ui.input.defaultVariants.size).toBe("sm");
    expect(ui.input.slots.base).toContain("font-mono");
    expect(ui.input.slots.base).toContain("border-hairline");

    expect(ui.badge.defaultVariants.size).toBe("sm");
    expect(ui.badge.defaultVariants.variant).toBe("subtle");
    expect(ui.badge.slots.base).toContain("font-mono");
    expect(ui.badge.slots.base).toContain("rounded-xs");

    expect(ui.table.slots.th).toContain("font-mono");
    expect(ui.table.slots.td).toContain("font-mono");

    expect(ui.card.slots.root).toContain("rounded-none");
    expect(ui.card.slots.root).toContain("border-hairline");
  });

  it("main.css contains all required design tokens and phosphor status accents from DES §3", () => {
    const cssPath = resolve(__dirname, "../app/assets/css/main.css");
    const cssContent = readFileSync(cssPath, "utf-8");

    expect(cssContent).toContain('@import "tailwindcss";');
    expect(cssContent).toContain('@import "@nuxt/ui";');
    expect(cssContent).toContain("--color-canvas: #09090b");
    expect(cssContent).toContain("--color-hairline: #27272a");
    expect(cssContent).toContain("--color-status-operational: #10b981");
    expect(cssContent).toContain("--color-status-degraded: #f59e0b");
    expect(cssContent).toContain("--color-status-down: #f43f5e");
    expect(cssContent).toContain("--color-status-paused: #71717a");
    expect(cssContent).toContain("--color-status-unknown: #71717a");
    expect(cssContent).toContain("--color-canvas: #fdfcfc");
    expect(cssContent).toContain("@theme");
    expect(cssContent).toContain("Geist Mono");
  });
});
