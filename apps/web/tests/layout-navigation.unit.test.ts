import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("P14.6 — Layout & Navigation Unit Tests", () => {
  const componentsDir = resolve(__dirname, "../app/components");
  const layoutsDir = resolve(__dirname, "../app/layouts");
  const middlewareDir = resolve(__dirname, "../app/middleware");
  const composablesDir = resolve(__dirname, "../app/composables");

  it("all required layout and navigation files exist", () => {
    expect(existsSync(resolve(componentsDir, "TopbarNav.vue"))).toBe(true);
    expect(existsSync(resolve(componentsDir, "BreadcrumbNav.vue"))).toBe(true);
    expect(existsSync(resolve(componentsDir, "CommandPaletteModal.vue"))).toBe(true);
    expect(existsSync(resolve(layoutsDir, "default.vue"))).toBe(true);
    expect(existsSync(resolve(layoutsDir, "login.vue"))).toBe(true);
    expect(existsSync(resolve(middlewareDir, "auth.global.ts"))).toBe(true);
    expect(existsSync(resolve(composablesDir, "use-auth.ts"))).toBe(true);
  });

  describe("TopbarNav", () => {
    const content = readFileSync(resolve(componentsDir, "TopbarNav.vue"), "utf-8");

    it("renders 48px header with [SENTINEL_] brand glyph and blinking cursor", () => {
      expect(content).toContain("h-12"); // 48px in Tailwind
      expect(content).toContain("SENTINEL");
      expect(content).toContain("animate-pulse");
      expect(content).toContain("text-brand-accent");
    });

    it("renders 4 horizontal navigation tabs (DES §2)", () => {
      expect(content).toContain("[01: OVERVIEW]");
      expect(content).toContain("[02: MONITORS]");
      expect(content).toContain("[03: INCIDENTS]");
      expect(content).toContain("[04: SETTINGS]");
      expect(content).toContain("/dashboard");
      expect(content).toContain("/dashboard/monitors");
      expect(content).toContain("/dashboard/incidents");
      expect(content).toContain("/dashboard/settings");
    });

    it("includes WsIndicator, [Ctrl+K] shortcut, ThemeToggle, and [LOGOUT] trigger", () => {
      expect(content).toContain("<WsIndicator");
      expect(content).toContain("Ctrl+K");
      expect(content).toContain("<ThemeToggle");
      expect(content).toContain("LOGOUT");
      expect(content).toContain("handleLogout");
    });
  });

  describe("BreadcrumbNav", () => {
    const content = readFileSync(resolve(componentsDir, "BreadcrumbNav.vue"), "utf-8");

    it("renders monospaced prompt-style breadcrumbs starting with sentinel", () => {
      expect(content).toContain("&gt;");
      expect(content).toContain("BREADCRUMB:");
      expect(content).toContain("sentinel");
      expect(content).toContain('aria-label="Breadcrumb"');
    });
  });

  describe("CommandPaletteModal", () => {
    const content = readFileSync(resolve(componentsDir, "CommandPaletteModal.vue"), "utf-8");

    it("wraps UCommandPalette in UModal with Ctrl+K / Meta+K keyboard shortcut", () => {
      expect(content).toContain("<UModal");
      expect(content).toContain("<UCommandPalette");
      expect(content).toContain("event.ctrlKey || event.metaKey");
      expect(content).toContain('event.key.toLowerCase() === "k"');
    });

    it("provides 4 tabs, new monitor shortcut, theme toggle, and logout actions", () => {
      expect(content).toContain("[01: OVERVIEW]");
      expect(content).toContain("[02: MONITORS]");
      expect(content).toContain("[+ TAMBAH MONITOR BARU]");
      expect(content).toContain("[03: INCIDENTS]");
      expect(content).toContain("[04: SETTINGS]");
      expect(content).toContain("[TOGGLE THEME: DARK / LIGHT]");
      expect(content).toContain("[KELUAR SISTEM / LOGOUT]");
    });
  });

  describe("Layouts: default.vue & login.vue", () => {
    const defaultContent = readFileSync(resolve(layoutsDir, "default.vue"), "utf-8");
    const loginContent = readFileSync(resolve(layoutsDir, "login.vue"), "utf-8");

    it("default layout includes TopbarNav, BreadcrumbNav, max-w-1440px slot, and CommandPaletteModal", () => {
      expect(defaultContent).toContain("<TopbarNav");
      expect(defaultContent).toContain("<BreadcrumbNav");
      expect(defaultContent).toContain("max-w-[1440px]");
      expect(defaultContent).toContain("<CommandPaletteModal");
    });

    it("login layout isolates auth gate without topbar or sidebar", () => {
      expect(loginContent).not.toContain("<TopbarNav");
      expect(loginContent).not.toContain("<BreadcrumbNav");
      expect(loginContent).toContain("<ThemeToggle");
      expect(loginContent).toContain("ZERO-LEAK ACCESS GATE");
    });
  });

  describe("Route Middleware: auth.global.ts", () => {
    const middlewareContent = readFileSync(resolve(middlewareDir, "auth.global.ts"), "utf-8");

    it("redirects unauthenticated users to /login and authenticated users to /dashboard", () => {
      expect(middlewareContent).toContain("useAuth()");
      expect(middlewareContent).toContain("await auth.fetchMe()");
      expect(middlewareContent).toContain('navigateTo("/login")');
      expect(middlewareContent).toContain('navigateTo("/dashboard")');
    });
  });

  describe("useAuth Composable", () => {
    const authContent = readFileSync(resolve(composablesDir, "use-auth.ts"), "utf-8");

    it("implements state management for auth_user, login, logout, and fetchMe", () => {
      expect(authContent).toContain("useState");
      expect(authContent).toContain("/api/auth/me");
      expect(authContent).toContain("/api/auth/login");
      expect(authContent).toContain("/api/auth/logout");
      expect(authContent).toContain("isAuthenticated");
      expect(authContent).toContain("isInitialized");
    });
  });
});
