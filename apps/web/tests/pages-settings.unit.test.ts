import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("P15.7 — /dashboard/settings Screen Tests (DES §5.7, US 26–30)", () => {
  const pagesDir = resolve(__dirname, "../app/pages");
  const settingsPagePath = resolve(pagesDir, "dashboard/settings/index.vue");

  it("file dashboard/settings/index.vue exists", () => {
    expect(existsSync(settingsPagePath)).toBe(true);
  });

  const content = readFileSync(settingsPagePath, "utf-8");

  it("uses default layout and renders page header", () => {
    expect(content).toContain('layout: "default"');
    expect(content).toContain("[04: SYSTEM SETTINGS & INTEGRATIONS]");
  });

  it("Telegram Section: provides token input, chat ID, TEST PING BOT, and zero-spam policy notice", () => {
    // Inputs and masking
    expect(content).toContain("telegramForm.botToken");
    expect(content).toContain("showBotToken");
    expect(content).toContain("telegramForm.chatId");

    // Zero-spam policy notice
    expect(content).toContain("KEBIJAKAN ZERO-SPAM");

    // Test ping button + action
    expect(content).toContain("TEST PING BOT");
    expect(content).toContain("handleTestPing");
    expect(content).toContain("testPingMutation");

    // Save button
    expect(content).toContain("SIMPAN KONFIGURASI TELEGRAM");
    expect(content).toContain("handleSaveTelegram");
  });

  it("Password Section: validates old password and changes owner credentials", () => {
    expect(content).toContain("passwordForm.currentPassword");
    expect(content).toContain("passwordForm.newPassword");
    expect(content).toContain("passwordForm.confirmPassword");
    expect(content).toContain("handleChangePassword");
    expect(content).toContain("changePasswordMutation");
    expect(content).toContain("UBAH PASSWORD PEMILIK");
  });

  it("CSV Export Section: supports monitor and timerange filters, and dual CSV download actions", () => {
    // Filters
    expect(content).toContain("selectedExportMonitor");
    expect(content).toContain("selectedExportRange");
    expect(content).toContain("exportMonitorOptions");
    expect(content).toContain("exportPresetOptions");

    // CSV Download buttons
    expect(content).toContain("DOWNLOAD CSV RIWAYAT PEMERIKSAAN");
    expect(content).toContain("DOWNLOAD CSV RIWAYAT INSIDEN");
    expect(content).toContain("handleDownloadCsv");
    expect(content).toContain("/api/reports/export.csv");

    // Formula injection sanitization notice
    expect(content).toContain("SANITASI FORMULA INJECTION");
  });
});
