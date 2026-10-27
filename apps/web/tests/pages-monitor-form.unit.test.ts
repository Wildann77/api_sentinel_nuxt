import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("P15.4 — Form Monitor (/new & [id]/edit) Tests (DES §5.4, US 4–11, D-15)", () => {
  const appDir = resolve(__dirname, "../app");
  const newPagePath = resolve(appDir, "pages/dashboard/monitors/new.vue");
  const editPagePath = resolve(appDir, "pages/dashboard/monitors/[id]/edit.vue");
  const formComponentPath = resolve(appDir, "components/MonitorForm.vue");
  const probeModalComponentPath = resolve(appDir, "components/ProbeResultModal.vue");

  it("all required files exist", () => {
    expect(existsSync(newPagePath)).toBe(true);
    expect(existsSync(editPagePath)).toBe(true);
    expect(existsSync(formComponentPath)).toBe(true);
    expect(existsSync(probeModalComponentPath)).toBe(true);
  });

  const formContent = readFileSync(formComponentPath, "utf-8");
  const newContent = readFileSync(newPagePath, "utf-8");
  const editContent = readFileSync(editPagePath, "utf-8");
  const probeModalContent = readFileSync(probeModalComponentPath, "utf-8");

  describe("MonitorForm.vue Stepped Monospace Tabs", () => {
    it("defines UTabs with 3 distinct stepped tabs", () => {
      expect(formContent).toContain("<UTabs");
      expect(formContent).toContain("[01: TARGET & SCHEDULE]");
      expect(formContent).toContain("[02: HEADERS & AUTHENTICATION]");
      expect(formContent).toContain("[03: RESPONSE ASSERTIONS]");
      expect(formContent).toContain(':unmount-on-hide="false"');
    });

    it("Tab 01: provides name, method, url, interval, and timeout inputs", () => {
      expect(formContent).toContain("NAMA MONITOR");
      expect(formContent).toContain('maxlength="100"');
      expect(formContent).toContain("METODE HTTP");
      expect(formContent).toContain("TARGET URL");
      expect(formContent).toContain("INTERVAL PEMERIKSAAN");
      expect(formContent).toContain("TIMEOUT REQUEST (MS)");
      expect(formContent).toContain("1 MENIT (60s)");
      expect(formContent).toContain("24 JAM (86400s)");
      expect(formContent).toContain('min="1000"');
      expect(formContent).toContain('max="30000"');
    });

    it("Tab 02: implements Zero-Leak protocol, credential masking, custom headers, and body", () => {
      expect(formContent).toContain("[ZERO-LEAK PROTOCOL: XCHACHA20-POLY1305 ENCRYPTION]");
      expect(formContent).toContain("SKEMA AUTENTIKASI TARGET");
      expect(formContent).toContain("BEARER");
      expect(formContent).toContain("BASIC");
      expect(formContent).toContain("API_KEY");
      expect(formContent).toContain("CUSTOM_HEADER");
      expect(formContent).toContain("••••••••");
      expect(formContent).toContain("[UBAH TOKEN RAHASIA]");
      expect(formContent).toContain("__SENTINEL_UNCHANGED__");
      expect(formContent).toContain("CUSTOM REQUEST HEADERS");
      expect(formContent).toContain("+ BARIS HEADER");
      expect(formContent).toContain("FORBIDDEN_REQUEST_HEADERS");
      expect(formContent).toContain("REQUEST BODY JSON (MAKS 64 KB)");
    });

    it("Tab 03: configures expected status (D-15), header/JSONPath builders, and 10 rules limit", () => {
      expect(formContent).toContain("HTTP STATUS CODE CHECK (WAJIB)");
      expect(formContent).toContain("EQUALS (Harus Sama)");
      expect(formContent).toContain("NOT_EQUALS (Tidak Boleh Sama)");
      expect(formContent).toContain("+ ASSERTION HEADER");
      expect(formContent).toContain("+ ASSERTION JSONPATH");
      expect(formContent).toContain("[ATURAN:");
      expect(formContent).toContain("10 MAKS]");
      expect(formContent).toContain("totalAssertionRulesCount");
      expect(formContent).toContain("isAssertionLimitExceeded");
    });

    it("Sticky Action Bar: provides dry-run probe, cancel, and save actions with OCC handling", () => {
      expect(formContent).toContain("> RUN TEST PROBE SEKARANG");
      expect(formContent).toContain("BATAL");
      expect(formContent).toContain("SIMPAN & AKTIFKAN MONITOR");
      expect(formContent).toContain("SIMPAN PERUBAHAN");
      expect(formContent).toContain("OCC CONFLICT MISMATCH: HTTP 409");
      expect(formContent).toContain("MUAT ULANG DATA SEKARANG");
    });
  });

  describe("ProbeResultModal.vue", () => {
    it("renders dry-run probe diagnostics and checklist", () => {
      expect(probeModalContent).toContain("<UModal");
      expect(probeModalContent).toContain("[DRY-RUN PROBE:");
      expect(probeModalContent).toContain("LATENCY");
      expect(probeModalContent).toContain("PINNED IP");
      expect(probeModalContent).toContain("EVALUASI ASSERTION RULES");
      expect(probeModalContent).toContain("RESPONSE HEADERS DITERIMA");
      expect(probeModalContent).toContain("RESPONSE BODY SNIPPET (MAX 5KB)");
    });
  });

  describe("Page Integration (new.vue & edit.vue)", () => {
    it("new.vue mounts MonitorForm with mode create", () => {
      expect(newContent).toContain('mode="create"');
      expect(newContent).toContain("[+ TAMBAH MONITOR BARU]");
    });

    it("edit.vue loads monitor via useMonitorQuery and mounts MonitorForm with mode edit", () => {
      expect(editContent).toContain("useMonitorQuery");
      expect(editContent).toContain('mode="edit"');
      expect(editContent).toContain(':initial-data="monitor"');
      expect(editContent).toContain("[EDIT KONFIGURASI MONITOR");
    });
  });
});
