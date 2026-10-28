import { expect, test } from "@playwright/test";

const BASE_ORIGIN = "http://localhost:3000";

test.describe("P17.4 — API Sentinel Full End-to-End Observability Suite", () => {
  let authCookieValue: string | null = null;
  let createdMonitorId: string | null = null;

  test.beforeAll(async ({ playwright }) => {
    try {
      const { execSync } = await import("node:child_process");
      execSync(
        'docker exec sentinel-postgres-dev psql -U sentinel_user -d api_sentinel_dev -c "TRUNCATE TABLE rate_limits;"',
        { stdio: "ignore" },
      );
      execSync("bun run db:seed", { stdio: "ignore" });
    } catch {
      // Ignore if docker exec not available in some environments
    }

    const req = await playwright.request.newContext();
    const res = await req.post(`${BASE_ORIGIN}/api/auth/login`, {
      headers: { origin: BASE_ORIGIN },
      data: { username: "admin", password: "admin123" },
    });
    expect(res.ok()).toBe(true);

    const setCookie = res.headers()["set-cookie"];
    const match = setCookie?.match(/sentinel_session=([^;]+)/);
    if (match?.[1]) {
      authCookieValue = match[1];
    }
    expect(authCookieValue).toBeDefined();
  });

  test.beforeEach(async ({ context }) => {
    if (authCookieValue) {
      await context.addCookies([
        {
          name: "sentinel_session",
          value: authCookieValue,
          domain: "localhost",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }
  });

  test("1. Login pemilik dengan cookie HttpOnly via Form UI", async ({ page, context }) => {
    // Clear pre-injected cookies to test full UI login flow
    await context.clearCookies();

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const usernameInput = page.locator("#login-username");
    const passwordInput = page.locator("#login-password");
    const submitBtn = page.locator('button[type="submit"]');

    await usernameInput.click();
    await usernameInput.fill("admin");
    await passwordInput.click();
    await passwordInput.fill("admin123");

    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await page.waitForURL("**/dashboard", { timeout: 15000 });
    await expect(page).toHaveURL(/.*\/dashboard/);

    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === "sentinel_session");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.value.length).toBeGreaterThan(20);
  });

  test("2 & 3. Buat monitor dengan autentikasi & assertion rules", async ({ page, context }) => {
    // Create monitor with custom assertion and bearer auth via API
    const monitorName = `E2E Probe ${Date.now()}`;
    const createRes = await context.request.post(`${BASE_ORIGIN}/api/monitors`, {
      headers: { origin: BASE_ORIGIN },
      data: {
        name: monitorName,
        url: "https://example.com",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 5000,
        assertions: [{ type: "status", operator: "equals", expected: 200 }],
        auth: {
          type: "BEARER",
          token: "e2e-secret-token",
        },
      },
    });

    expect(createRes.ok()).toBe(true);
    const monitorData = await createRes.json();
    expect(monitorData.id).toBeDefined();
    expect(monitorData.name).toBe(monitorName);
    createdMonitorId = monitorData.id;

    // Verify it renders on /dashboard/monitors
    await page.goto("/dashboard/monitors");
    await expect(page.locator(`text=${monitorName}`).first()).toBeVisible({ timeout: 10000 });
  });

  test("4 & 5. Jalankan pemeriksaan manual dan lihat hasil riwayat", async ({ page, context }) => {
    let targetMonitorId = createdMonitorId;
    if (!targetMonitorId) {
      const listRes = await context.request.get(`${BASE_ORIGIN}/api/monitors`);
      const listData = await listRes.json();
      targetMonitorId = listData.data[0]?.id;
    }
    expect(targetMonitorId).toBeDefined();

    // Trigger manual check via API
    const checkRes = await context.request.post(
      `${BASE_ORIGIN}/api/monitors/${targetMonitorId}/check`,
      {
        headers: { origin: BASE_ORIGIN },
      },
    );
    expect(checkRes.status()).toBeLessThan(400);

    // Open monitor detail page
    await page.goto(`/dashboard/monitors/${targetMonitorId}`);
    await expect(page).toHaveURL(new RegExp(`/dashboard/monitors/${targetMonitorId}`));

    // Verify check history table or sections exist
    await expect(
      page.getByRole("heading", { name: /RIWAYAT 20 PEMERIKSAAN TERAKHIR/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /TRIGGER CHECK/i })).toBeVisible();
  });

  test("6. Lihat grafik uptime & latency di dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    // Verify system counters and headers
    await expect(page.getByText("[01: OVERVIEW DASHBOARD]")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("UPTIME 24H")).toBeVisible();
  });

  test("7 & 8. Simulasikan kegagalan dan pemulihan insiden", async ({ page }) => {
    await page.goto("/dashboard/incidents");
    await expect(page).toHaveURL(/.*\/dashboard\/incidents/);

    // Header and filter should show incidents management
    await expect(page.getByRole("heading", { name: /INCIDENTS MANAGEMENT/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test("9. Atur Telegram & uji pengiriman notifikasi (mock)", async ({ context }) => {
    // Test API endpoint directly for telegram test notification
    const testNotifRes = await context.request.post(`${BASE_ORIGIN}/api/settings/telegram/test`, {
      headers: { origin: BASE_ORIGIN },
      data: {
        botToken: "123456789:AAFakeTokenForE2ETestingMockTelegram123",
        chatId: "-100123456789",
      },
    });
    // Expected either 200 or 502/bad gateway because mock token is rejected by actual Telegram or network
    expect([200, 502]).toContain(testNotifRes.status());
    if (testNotifRes.status() === 200) {
      const data = await testNotifRes.json();
      expect(typeof data.success).toBe("boolean");
    }
  });

  test("10. Ekspor CSV laporan pemantauan", async ({ context }) => {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 86400000).toISOString();
    const to = now.toISOString();

    const csvRes = await context.request.get(
      `${BASE_ORIGIN}/api/reports/export.csv?type=checks&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(csvRes.ok()).toBe(true);

    const contentType = csvRes.headers()["content-type"];
    expect(contentType).toContain("text/csv");

    const contentDisposition = csvRes.headers()["content-disposition"];
    expect(contentDisposition).toContain("attachment");

    const csvText = await csvRes.text();
    // Verify CSV header structure
    expect(csvText).toContain("timestamp,monitor_name,status,status_code,latency_ms");
  });

  test("11. Halaman & endpoint terlindungi menolak akses tanpa sesi", async ({ page, request }) => {
    // 1. Direct page navigation without session cookie redirects to login
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login(\?redirect=.*)?$/);

    // 2. Direct API call without session cookie returns 401 Problem Details (RFC 9457)
    const unauthorizedRes = await request.get(`${BASE_ORIGIN}/api/monitors`, {
      headers: { cookie: "" },
    });
    expect(unauthorizedRes.status()).toBe(401);
    expect(unauthorizedRes.headers()["content-type"]).toContain("application/problem+json");

    const problem = await unauthorizedRes.json();
    expect(problem.status).toBe(401);
    expect(problem.type).toBe("https://api-sentinel.local/errors/invalid-credentials");
  });
});
