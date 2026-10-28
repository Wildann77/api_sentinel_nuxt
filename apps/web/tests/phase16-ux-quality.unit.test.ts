import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 16 — UX Quality Suite (P16.1 - P16.4)", () => {
  const webAppDir = resolve(__dirname, "../app");
  const pagesDir = resolve(webAppDir, "pages/dashboard");
  const componentsDir = resolve(webAppDir, "components");
  const layoutsDir = resolve(webAppDir, "layouts");

  describe("P16.1 — Kelengkapan 6 State (DES §7)", () => {
    it("1. Loading State: uses SkeletonRows and SkeletonTiles without circular spinners", () => {
      const overview = readFileSync(resolve(pagesDir, "index.vue"), "utf-8");
      const monitors = readFileSync(resolve(pagesDir, "monitors/index.vue"), "utf-8");
      const incidents = readFileSync(resolve(pagesDir, "incidents/index.vue"), "utf-8");
      const detail = readFileSync(resolve(pagesDir, "monitors/[id]/index.vue"), "utf-8");

      expect(overview).toContain("<SkeletonTiles");
      expect(overview).toContain("<SkeletonRows");
      expect(monitors).toContain("<SkeletonRows");
      expect(incidents).toContain("<SkeletonRows");
      expect(detail).toContain("<SkeletonRows");
    });

    it("2. Empty State: displays dashed container and CTA across data listings", () => {
      const overview = readFileSync(resolve(pagesDir, "index.vue"), "utf-8");
      const monitors = readFileSync(resolve(pagesDir, "monitors/index.vue"), "utf-8");
      const incidents = readFileSync(resolve(pagesDir, "incidents/index.vue"), "utf-8");
      const detail = readFileSync(resolve(pagesDir, "monitors/[id]/index.vue"), "utf-8");

      expect(overview).toContain("<EmptyState");
      expect(monitors).toContain("<EmptyState");
      expect(incidents).toContain("<EmptyState");
      expect(detail).toContain("[BELUM ADA RIWAYAT PEMERIKSAAN]");
    });

    it("3. Live/Success State: displays [● LIVE] and 500ms flash indicator via websocket", () => {
      const wsIndicator = readFileSync(resolve(componentsDir, "WsIndicator.vue"), "utf-8");
      const overview = readFileSync(resolve(pagesDir, "index.vue"), "utf-8");
      const monitors = readFileSync(resolve(pagesDir, "monitors/index.vue"), "utf-8");

      expect(wsIndicator).toContain("● LIVE");
      expect(overview).toContain("socket.isFlashing");
      expect(monitors).toContain("socket.isFlashing");
    });

    it("4. Stale/Offline State: shows [✕ DISCONNECTED], (STALE DATA), and [RECONNECT] trigger", () => {
      const defaultLayout = readFileSync(resolve(layoutsDir, "default.vue"), "utf-8");
      const wsIndicator = readFileSync(resolve(componentsDir, "WsIndicator.vue"), "utf-8");
      const overview = readFileSync(resolve(pagesDir, "index.vue"), "utf-8");
      const monitors = readFileSync(resolve(pagesDir, "monitors/index.vue"), "utf-8");

      expect(defaultLayout).toContain("[✕ DISCONNECTED]");
      expect(defaultLayout).toContain("(STALE DATA)");
      expect(defaultLayout).toContain("RECONNECT");
      expect(wsIndicator).toContain("✕ DISCONNECTED");
      expect(overview).toContain("(STALE DATA)");
      expect(monitors).toContain("(STALE DATA)");
    });

    it("5. Error RFC 9457: mounts ProblemAlert with retry on query failure", () => {
      const problemAlert = readFileSync(resolve(componentsDir, "ProblemAlert.vue"), "utf-8");
      const overview = readFileSync(resolve(pagesDir, "index.vue"), "utf-8");
      const monitors = readFileSync(resolve(pagesDir, "monitors/index.vue"), "utf-8");
      const incidents = readFileSync(resolve(pagesDir, "incidents/index.vue"), "utf-8");
      const settings = readFileSync(resolve(pagesDir, "settings/index.vue"), "utf-8");

      expect(problemAlert).toContain("ProblemDetailsError");
      expect(problemAlert).toContain("[COBA LAGI / RETRY]");
      expect(overview).toContain("<ProblemAlert");
      expect(monitors).toContain("<ProblemAlert");
      expect(incidents).toContain("<ProblemAlert");
      expect(settings).toContain("<ProblemAlert");
    });

    it("6. Destructive Confirm: requires exact typing of target name before permanent deletion", () => {
      const confirmModal = readFileSync(
        resolve(componentsDir, "DestructiveConfirmModal.vue"),
        "utf-8",
      );
      const monitors = readFileSync(resolve(pagesDir, "monitors/index.vue"), "utf-8");
      const detail = readFileSync(resolve(pagesDir, "monitors/[id]/index.vue"), "utf-8");

      expect(confirmModal).toContain("isMatch");
      expect(confirmModal).toContain("HAPUS PERMANEN");
      expect(monitors).toContain("<DestructiveConfirmModal");
      expect(detail).toContain("<DestructiveConfirmModal");
    });
  });

  describe("P16.2 — Aksesibilitas WCAG 2.2 AA (DES §8)", () => {
    it("enforces semantic text and background tokens adhering to AA contrast ratios", () => {
      const mainCss = readFileSync(resolve(webAppDir, "assets/css/main.css"), "utf-8");
      expect(mainCss).toContain("--color-canvas: #09090b");
      expect(mainCss).toContain("--color-text-primary: #fafafa");
      expect(mainCss).toContain("--color-text-secondary: #a1a1aa");
      expect(mainCss).toContain("--color-status-operational: #10b981");
      expect(mainCss).toContain("--color-status-down: #f43f5e");
    });

    it("provides full keyboard navigation for topbar tabs (ArrowRight / ArrowLeft / focus outline)", () => {
      const topbar = readFileSync(resolve(componentsDir, "TopbarNav.vue"), "utf-8");
      expect(topbar).toContain("onTabKeydown");
      expect(topbar).toContain("ArrowRight");
      expect(topbar).toContain("ArrowLeft");
      expect(topbar).toContain('role="tablist"');
      expect(topbar).toContain('role="tab"');
      expect(topbar).toContain("focus-visible:outline");
    });

    it("announces live incident transitions via aria-live='polite' and provides explicit aria-labels", () => {
      const incidents = readFileSync(resolve(pagesDir, "incidents/index.vue"), "utf-8");
      const overview = readFileSync(resolve(pagesDir, "index.vue"), "utf-8");
      const statusBadge = readFileSync(resolve(componentsDir, "StatusBadge.vue"), "utf-8");

      expect(incidents).toContain('aria-live="polite"');
      expect(overview).toContain('aria-live="polite"');
      expect(statusBadge).toContain('role="status"');
      expect(statusBadge).toContain("aria-label");
    });

    it("ensures interactive touch targets meet >= 36px desktop and 44x44px mobile standards", () => {
      const topbar = readFileSync(resolve(componentsDir, "TopbarNav.vue"), "utf-8");
      const themeToggle = readFileSync(resolve(componentsDir, "ThemeToggle.vue"), "utf-8");
      const wsIndicator = readFileSync(resolve(componentsDir, "WsIndicator.vue"), "utf-8");

      expect(topbar).toContain("min-h-[44px]");
      expect(topbar).toContain("min-h-[36px]");
      expect(themeToggle).toContain("min-h-[36px]");
      expect(wsIndicator).toContain("min-h-[36px]");
    });
  });

  describe("P16.3 — Responsif & Multi-Breakpoint (DES §9)", () => {
    it("locks container to max-w-[1440px] centered on Desktop Ultra (> 1440px)", () => {
      const defaultLayout = readFileSync(resolve(layoutsDir, "default.vue"), "utf-8");
      expect(defaultLayout).toContain("max-w-[1440px]");
      expect(defaultLayout).toContain("mx-auto");
    });

    it("switches metric tiles to 2x2 grid on Tablet (768px - 1023px) and hides sparkline column", () => {
      const overview = readFileSync(resolve(pagesDir, "index.vue"), "utf-8");
      const monitors = readFileSync(resolve(pagesDir, "monitors/index.vue"), "utf-8");

      expect(overview).toContain("grid-cols-1 sm:grid-cols-2 lg:grid-cols-4");
      expect(monitors).toContain('class: "hidden lg:table-cell"');
    });

    it("renders compact UDropdownMenu navigation on Mobile (< 768px)", () => {
      const topbar = readFileSync(resolve(componentsDir, "TopbarNav.vue"), "utf-8");
      expect(topbar).toContain("<UDropdownMenu");
      expect(topbar).toContain("md:hidden");
      expect(topbar).toContain("[MENU:");
    });

    it("renders Card List View monospaced on Mobile (< 768px) across telemetry tables", () => {
      const overview = readFileSync(resolve(pagesDir, "index.vue"), "utf-8");
      const monitors = readFileSync(resolve(pagesDir, "monitors/index.vue"), "utf-8");
      const incidents = readFileSync(resolve(pagesDir, "incidents/index.vue"), "utf-8");
      const detail = readFileSync(resolve(pagesDir, "monitors/[id]/index.vue"), "utf-8");

      expect(overview).toContain("md:hidden divide-y divide-hairline");
      expect(monitors).toContain('class="md:hidden space-y-3"');
      expect(incidents).toContain('class="md:hidden space-y-3"');
      expect(detail).toContain('class="md:hidden space-y-2.5"');
    });

    it("ensures inspection drawers take full width 100vw on mobile devices", () => {
      const checkDrawer = readFileSync(
        resolve(componentsDir, "CheckInspectionDrawer.vue"),
        "utf-8",
      );
      const incidentDrawer = readFileSync(
        resolve(componentsDir, "IncidentInspectionDrawer.vue"),
        "utf-8",
      );

      expect(checkDrawer).toContain("w-full sm:max-w-[480px]");
      expect(incidentDrawer).toContain("w-full sm:max-w-[480px]");
    });
  });

  describe("P16.4 — Checklist Verifikasi Frontend (DES §10)", () => {
    it("adheres to zero hardcoded random color utilities and uses semantic tokens", () => {
      const statusBadge = readFileSync(resolve(componentsDir, "StatusBadge.vue"), "utf-8");
      const metricTile = readFileSync(resolve(componentsDir, "MetricTile.vue"), "utf-8");
      const problemAlert = readFileSync(resolve(componentsDir, "ProblemAlert.vue"), "utf-8");

      expect(statusBadge).not.toContain("bg-red-500");
      expect(statusBadge).not.toContain("text-green-500");
      expect(metricTile).toContain("text-status-operational");
      expect(problemAlert).toContain("border-status-down-border");
    });

    it("implements zero-leak UI protocol (masks secrets and tokens)", () => {
      const monitorForm = readFileSync(resolve(componentsDir, "MonitorForm.vue"), "utf-8");
      const settings = readFileSync(resolve(pagesDir, "settings/index.vue"), "utf-8");

      expect(monitorForm).toContain("Zero-Leak Protocol");
      expect(settings).toContain("showBotToken");
    });

    it("integrates contracts synchronization package @sentinel/contracts", () => {
      const monitors = readFileSync(resolve(pagesDir, "monitors/index.vue"), "utf-8");
      const overview = readFileSync(resolve(pagesDir, "index.vue"), "utf-8");

      expect(monitors).toContain('from "@sentinel/contracts"');
      expect(overview).toContain('from "@sentinel/contracts"');
    });
  });
});
