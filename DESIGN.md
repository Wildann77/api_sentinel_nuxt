---
version: 1.0.0
name: API Sentinel Design System
description: |
  A high-density, terminal-inspired observability design system tailored for API Sentinel.
  Combines the minimalist monospaced aesthetic of developer tooling (JetBrains Mono / Geist Mono,
  1px hairline borders, zero drop shadows, ASCII bracketed notation) with modern production-grade
  observability features powered by Nuxt UI v4, Tailwind CSS v4, and reactive WebSockets.
  Default state is True Dark Terminal (`#09090b` canvas with phosphor status accents), with full
  support for an adaptive Warm Cream Light Mode (`#fdfcfc` canvas with nearly-black ink).

colors:
  canvas: "#09090b"
  canvas-subtle: "#0c0c0e"
  surface: "#121215"
  surface-elevated: "#18181b"
  surface-hover: "#202024"
  hairline: "#27272a"
  hairline-strong: "#3f3f46"
  hairline-focus: "#a1a1aa"

  text-primary: "#fafafa"
  text-secondary: "#a1a1aa"
  text-muted: "#71717a"
  text-dim: "#52525b"
  text-inverse: "#09090b"

  status-operational: "#10b981"
  status-operational-bg: "rgba(16, 185, 129, 0.12)"
  status-operational-border: "rgba(16, 185, 129, 0.35)"
  
  status-degraded: "#f59e0b"
  status-degraded-bg: "rgba(245, 158, 11, 0.12)"
  status-degraded-border: "rgba(245, 158, 11, 0.35)"

  status-down: "#f43f5e"
  status-down-bg: "rgba(244, 63, 94, 0.14)"
  status-down-border: "rgba(244, 63, 94, 0.40)"

  status-paused: "#71717a"
  status-paused-bg: "rgba(113, 113, 122, 0.12)"
  status-paused-border: "rgba(113, 113, 122, 0.30)"

  status-unknown: "#71717a"
  status-unknown-bg: "rgba(113, 113, 122, 0.08)"
  status-unknown-border: "rgba(113, 113, 122, 0.30)"

  brand-accent: "#10b981"
  brand-accent-hover: "#059669"
  brand-accent-dim: "rgba(16, 185, 129, 0.15)"

  ws-live: "#22c55e"
  ws-connecting: "#eab308"
  ws-disconnected: "#ef4444"

  light-canvas: "#fdfcfc"
  light-surface: "#f8f7f7"
  light-surface-elevated: "#f1eeee"
  light-hairline: "rgba(15, 0, 0, 0.12)"
  light-text-primary: "#201d1d"
  light-text-secondary: "#424245"
  light-text-muted: "#6e6e73"
  light-status-operational: "#059669"
  light-status-operational-bg: "rgba(5, 150, 105, 0.10)"
  light-status-operational-border: "rgba(5, 150, 105, 0.30)"
  light-status-degraded: "#d97706"
  light-status-degraded-bg: "rgba(217, 119, 6, 0.10)"
  light-status-degraded-border: "rgba(217, 119, 6, 0.30)"
  light-status-down: "#e11d48"
  light-status-down-bg: "rgba(225, 29, 72, 0.10)"
  light-status-down-border: "rgba(225, 29, 72, 0.30)"
  light-status-paused: "#52525b"
  light-status-paused-bg: "rgba(82, 82, 91, 0.10)"
  light-status-paused-border: "rgba(82, 82, 91, 0.30)"
  light-status-unknown: "#52525b"
  light-status-unknown-bg: "rgba(82, 82, 91, 0.08)"
  light-status-unknown-border: "rgba(82, 82, 91, 0.25)"

typography:
  display-xl:
    fontFamily: "Geist Mono, JetBrains Mono, monospace"
    fontSize: "32px"
    fontWeight: "700"
    lineHeight: "1.3"
    letterSpacing: "-0.02em"
  heading-lg:
    fontFamily: "Geist Mono, JetBrains Mono, monospace"
    fontSize: "20px"
    fontWeight: "600"
    lineHeight: "1.4"
    letterSpacing: "-0.01em"
  heading-md:
    fontFamily: "Geist Mono, JetBrains Mono, monospace"
    fontSize: "15px"
    fontWeight: "600"
    lineHeight: "1.4"
    letterSpacing: "0"
  body-md:
    fontFamily: "Geist Mono, JetBrains Mono, monospace"
    fontSize: "13px"
    fontWeight: "400"
    lineHeight: "1.5"
    letterSpacing: "0"
  body-strong:
    fontFamily: "Geist Mono, JetBrains Mono, monospace"
    fontSize: "13px"
    fontWeight: "600"
    lineHeight: "1.5"
    letterSpacing: "0"
  caption-sm:
    fontFamily: "Geist Mono, JetBrains Mono, monospace"
    fontSize: "11px"
    fontWeight: "500"
    lineHeight: "1.4"
    letterSpacing: "0.02em"
  code-snippet:
    fontFamily: "Geist Mono, JetBrains Mono, monospace"
    fontSize: "12px"
    fontWeight: "400"
    lineHeight: "1.6"
    letterSpacing: "0"

rounded:
  none: "0px"
  xs: "2px"
  sm: "4px"
  md: "6px"

spacing:
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  container-max: "1440px"

components:
  topbar-nav:
    height: "48px"
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.hairline}"
    borderBottomWidth: "1px"
    typography: "{typography.body-md}"
  tab-nav-item:
    height: "36px"
    padding: "0 14px"
    typography: "{typography.body-md}"
    colorDefault: "{colors.text-secondary}"
    colorActive: "{colors.text-primary}"
    backgroundActive: "{colors.surface-elevated}"
    borderBottomActive: "2px solid {colors.brand-accent}"
  badge-status:
    height: "22px"
    padding: "2px 8px"
    typography: "{typography.caption-sm}"
    rounded: "{rounded.xs}"
    borderWidth: "1px"
  metric-card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.hairline}"
    borderWidth: "1px"
    rounded: "{rounded.none}"
    padding: "16px"
  probe-table:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.hairline}"
    borderWidth: "1px"
    headerTypography: "{typography.caption-sm}"
    cellTypography: "{typography.body-md}"
  inspection-drawer:
    width: "480px"
    backgroundColor: "{colors.canvas-subtle}"
    borderColor: "{colors.hairline}"
    borderLeftWidth: "1px"
---

# API Sentinel — Frontend Design Specification

Dokumen ini mendefinisikan sistem desain, spesifikasi visual, token antarmuka, arsitektur komponen Vue 3 / Nuxt UI v4, dan interaksi pengguna untuk frontend web **API Sentinel**.

Dokumen ini diturunkan langsung dan disinkronkan secara ketat dengan [PRD.md](./PRD.md) (kebutuhan produk & fitur MVP) dan [ARCHITECTURE.md](./ARCHITECTURE.md) (batasan teknis monorepo, Nuxt 4.6.x, Nuxt UI v4, Tailwind CSS v4, Drizzle, dan WebSocket real-time).

---

## 1. Filosofi Desain & Arah Visual

API Sentinel adalah platform pemantauan dan keandalan API mandiri (*self-hosted observability platform*). Karakter antarmuka mengadopsi **Terminal-Monospace Observability Aesthetic**:

1. **Monospace-First Typography:** Seluruh teks antarmuka menggunakan keluarga font monospace modern (`Geist Mono`, `JetBrains Mono`, `IBM Plex Mono`). Nilai metrik, timestamp UTC, kode status HTTP, latency dalam milidetik, dan payload JSON tampil sejajar secara natural dalam *grid tabular*, memudahkan pembacaan diagnostik sekilas.
2. **Flat Chrome & Zero Drop Shadows:** Tidak ada efek bayangan blur (*drop shadow*), efek kaca blur berlebih (*frosted glassmorphism*), atau sudut membulat berlebihan. Elevasi direpresentasikan secara tegas melalui garis pembatas rambut (*1px hairline border* `#27272a`) dan tingkat kegelapan permukaan (*surface depth contrast*).
3. **Phosphor Status Signals:** Status kesehatan endpoint tidak menggunakan warna pastel dekoratif, melainkan aksen fosfor terminal yang presisi dan memiliki kontras tinggi sesuai standar aksesibilitas WCAG 2.2 Level AA:
   - `[OPERATIONAL]` — Fosfor Emerald (`#10b981`)
   - `[DEGRADED]` — Fosfor Amber (`#f59e0b`)
   - `[DOWN]` — Fosfor Rose/Crimson (`#f43f5e`)
   - `[PAUSED]` — Neutral Zinc Muted (`#71717a`)
4. **Bracketed ASCII Notation:** Komponen UI penting, pill status, dan tombol aksi memanfaatkan notasi kurung siku terminal (misalnya `[● LIVE]`, `[+ TAMBAH MONITOR]`, `[01: TARGET]`, `[RUN PROBE]`) untuk mempertegas identitas *developer-first*.
5. **Mode Tampilan:** Default adalah **True Dark Terminal** (`#09090b`), dengan dukungan penuh **Warm Cream Light Mode** (`#fdfcfc` canvas dan `#201d1d` ink) melalui Nuxt ColorMode terintegrasi.

---

## 2. Struktur Layout: Top-Only Horizontal Terminal Tabs

Sesuai hasil keputusan arsitektur antarmuka, API Sentinel mengadopsi **Top-Only Horizontal Terminal Navigation** (ala *tmux/terminal tab-bar* flat). Hal ini memaksimalkan 100% lebar layar horizontal untuk tabel telemetri yang padat, grafik latency interaktif, dan inspeksi JSON, tanpa ada ruang layar yang terpotong oleh sidebar vertikal permanen.

```
+------------------------------------------------------------------------------------------------------+
| [SENTINEL_]     [01: OVERVIEW]  [02: MONITORS]  [03: INCIDENTS]  [04: SETTINGS]   [● LIVE]  (USER) |
+------------------------------------------------------------------------------------------------------+
| > BREADCRUMB: sentinel / dashboard / monitors / auth-service-v1                                      |
+------------------------------------------------------------------------------------------------------+
|                                                                                                      |
|  [METRIC TILE 01]       [METRIC TILE 02]       [METRIC TILE 03]       [METRIC TILE 04]               |
|  UPTIME 24H: 99.94%     AVG LATENCY: 42ms      ACTIVE INCIDENTS: 0    TOTAL CHECKS: 14,290           |
|                                                                                                      |
|  +------------------------------------------------------------------------------------------------+  |
|  | LATENCY TELEMETRY (<UChart> Responsive SVG)                             [24H]  [7D]  [30D]    |  |
|  | 120ms |                                                                                        |  |
|  |  80ms |       /\__                                                                             |  |
|  |  40ms |______/    \_________________________________/\_________/\___________________________  |  |
|  |   0ms +--------------------------------------------------------------------------------------+  |
|  |       00:00        04:00        08:00        12:00        16:00        20:00        00:00      |  |
|  +------------------------------------------------------------------------------------------------+  |
|                                                                                                      |
|  +------------------------------------------------------------------------------------------------+  |
|  | PROBE INSPECTION TABLE (<UTable>)                              [SEARCH] [FILTER] [+ NEW PROBE] |  |
|  | STATUS         METHOD  TARGET ENDPOINT            STATUS CODE  LATENCY   LAST CHECK (UTC)      |  |
|  | [OPERATIONAL]  GET     https://api.domain.com/v1   200 OK       34ms      2026-10-22 09:12:01   |  |
|  | [DEGRADED]     POST    https://auth.domain.com/token 504 T/O   5000ms     2026-10-22 09:11:45   |  |
|  | [DOWN]         GET     https://pay.domain.com/hook 500 ERR     412ms     2026-10-22 09:10:12   |  |
|  +------------------------------------------------------------------------------------------------+  |
+------------------------------------------------------------------------------------------------------+
```

### 2.1. Anatomi Topbar Header

Header aplikasi beroperasi pada ketinggian kompak `48px` dan menampung:
1. **Brand Glyph:** `[SENTINEL_]` dengan kursor berkedip (*blinking terminal cursor*).
2. **Terminal Navigation Tabs:**
   - `[01: OVERVIEW]` (`/dashboard`)
   - `[02: MONITORS]` (`/dashboard/monitors`)
   - `[03: INCIDENTS]` (`/dashboard/incidents`)
   - `[04: SETTINGS]` (`/dashboard/settings`)
3. **Live WebSocket Pulse Indicator:**
   - Terkoneksi: `[● LIVE]` (bulatan hijau berkedip halus `#22c55e`).
   - Reconnecting / Stale: `[○ SYNCING...]` (kuning `#eab308`).
   - Terputus: `[✕ DISCONNECTED]` (merah `#ef4444`).
4. **Quick Utility Trigger:** Tombol keyboard shortcut `[Ctrl+K]` untuk membuka `UCommandPalette`, pemilih tema `[THEME]`, dan tombol `[LOGOUT]`.

---

## 3. Skema Palet Warna & Semantic Tokens

Sistem warna menggunakan CSS Variables yang terhubung langsung dengan engine Tailwind CSS v4 (`@theme`) dan Nuxt UI v4 semantic color mapping.

### 3.1. True Dark Palette (Default)

| Token Desain | Nilai HEX / CSS | Peran dalam Antarmuka | Kontras WCAG |
|---|---|---|---|
| `{colors.canvas}` | `#09090b` | Background halaman utama (*root background*). | - |
| `{colors.canvas-subtle}` | `#0c0c0e` | Background kontainer tabel dan panel log. | - |
| `{colors.surface}` | `#121215` | Background kartu metrik, bar navigasi, dan card form. | - |
| `{colors.surface-elevated}`| `#18181b` | Background tab aktif, dialog modal, dan slideover drawer. | - |
| `{colors.surface-hover}` | `#202024` | Status hover pada baris tabel dan tombol terminal. | - |
| `{colors.hairline}` | `#27272a` | Garis pembatas utama (1px solid) antar-komponen. | - |
| `{colors.hairline-strong}` | `#3f3f46` | Border input terfokus atau batas pemisah aktif. | - |
| `{colors.text-primary}` | `#fafafa` | Teks utama, angka metrik, dan judul tabel. | 14.8:1 (Pass AAA) |
| `{colors.text-secondary}` | `#a1a1aa` | Label field, deskripsi sub-header, unit satuan. | 7.2:1 (Pass AAA) |
| `{colors.text-muted}` | `#71717a` | Placeholder, timestamp sekunder, label dinonaktifkan. | 4.6:1 (Pass AA) |

### 3.2. Status Phosphor & Semantic Indicators

Sesuai model status di [PRD.md](./PRD.md) dan [ARCHITECTURE.md](./ARCHITECTURE.md) (Enum `health_status`: `UNKNOWN`, `UP`, `DEGRADED`, `DOWN`, `PAUSED` — status domain `UP` dipetakan ke label UI `[OPERATIONAL]`):

| Status Domain | Teks Glyph | Warna Teks | Background Pill | Border (1px) | Definisi Kondisi |
|---|---|---|---|---|---|
| **OPERATIONAL (UP)** | `[OPERATIONAL]` | `#10b981` (Emerald) | `rgba(16, 185, 129, 0.12)` | `rgba(16, 185, 129, 0.35)` | Endpoint lolos validasi status code, headers, dan JSONPath. |
| **DEGRADED** | `[DEGRADED]` | `#f59e0b` (Amber) | `rgba(245, 158, 11, 0.12)` | `rgba(245, 158, 11, 0.35)` | Terjadi 1 atau 2 kegagalan berturut-turut (belum mencapai batas 3x buka insiden). |
| **DOWN** | `[DOWN]` | `#f43f5e` (Rose) | `rgba(244, 63, 94, 0.14)` | `rgba(244, 63, 94, 0.40)` | Mencapai $\ge 3$ kegagalan berturut-turut. Insiden aktif dibuka dan Telegram dikirim. |
| **PAUSED** | `[PAUSED]` | `#71717a` (Zinc) | `rgba(113, 113, 122, 0.12)` | `rgba(113, 113, 122, 0.30)` | Pemeriksaan otomatis dijeda sementara oleh pengguna. |
| **UNKNOWN** | `[UNKNOWN]` | `#71717a` (Zinc Dim) | `rgba(113, 113, 122, 0.08)` | `rgba(113, 113, 122, 0.30)` | Status awal monitor baru atau yang baru di-resume sebelum hasil probe pertama selesai. |

### 3.3. Warm Cream Light Mode (Adaptive Fallback)

Disediakan bagi pengguna yang memilih mode terang dengan sentuhan estetika kertas/terminal cetak:
- **Canvas:** `#fdfcfc` (warm white cream).
- **Surface:** `#f8f7f7` / `#f1eeee`.
- **Hairline:** `rgba(15, 0, 0, 0.12)`.
- **Text Primary:** `#201d1d` (ink near-black).
- **Text Secondary:** `#424245` (charcoal).
- **Status Badges:** Mempertahankan warna Emerald `#059669`, Amber `#d97706`, Rose `#e11d48`, dan Zinc `#52525b` dengan saturasi gelap untuk menjamin kontras rasio $\ge 4.5:1$.

---

## 4. Tipografi & Skala Hirarki

Sistem menggunakan font monospace seragam untuk seluruh peran teks, menjaga konsistensi ritme horizontal dan vertikal:

```css
font-family: "Geist Mono", "JetBrains Mono", "IBM Plex Mono", Menlo, Consolas, monospace;
```

### 4.1. Tabel Skala Tipografi

| Token | Ukuran | Tebal (*Weight*) | Line Height | Penggunaan (*Usage*) |
|---|---|---|---|---|
| `{typography.display-xl}` | `32px` | 700 (Bold) | 1.3 | Nilai angka metrik besar (cth. `99.98%`, `42ms`). |
| `{typography.heading-lg}` | `20px` | 600 (Semibold) | 1.4 | Judul monitor pada halaman detail, judul halaman login. |
| `{typography.heading-md}` | `15px` | 600 (Semibold) | 1.4 | Judul section form, header panel tabel, judul drawer. |
| `{typography.body-md}` | `13px` | 400 (Regular) | 1.5 | Teks default, baris tabel, deskripsi error RFC 9457, nilai input. |
| `{typography.body-strong}` | `13px` | 600 (Semibold) | 1.5 | Nama kolom tabel, tab navigasi aktif, label tombol utama. |
| `{typography.caption-sm}` | `11px` | 500 (Medium) | 1.4 | Status badges, timestamp UTC, header tabel, indikator live WS. |
| `{typography.code-snippet}`| `12px` | 400 (Regular) | 1.6 | JSON response preview, aturan JSONPath, curl snippet, cipher key. |

---

## 5. Spesifikasi Layar & Alur Pengguna (Screen Inventory)

### 5.1. Layar Autentikasi (`/login`)
- **Tujuan:** Autentikasi pemilik tunggal (*single-owner*) sesuai PRD Bagian 3.A dan mitigasi *timing attack* via Argon2id di Architecture Bagian 5.3.
- **Komponen:**
  - Kartu login terpusat (`width: 380px`), border hairline 1px `#27272a`, background `#121215`.
  - Wordmark: `[SENTINEL::AUTH_GATE]`.
  - Field:
    - Username (`UInput` monospaced).
    - Password (`UInput` tipe `password` dengan tombol *toggle visibility*).
  - Aksi: Tombol `[ENTER SYSTEM]` (`UButton` primary Emerald).
  - Feedback Keamanan: Alert banner RFC 9457 jika kredensial salah, tombol disabled saat status *submitting*.

### 5.2. Layar Ringkasan Eksekutif (`/dashboard`)
- **Tujuan:** Menampilkan metrik kesehatan sistem secara keseluruhan (PRD Fitur #7, #8, #9).
- **Komponen:**
  - **4 Metrik Utama (Grid 4 Kolom):**
    1. Overall Uptime (24h / 7d) dalam persen tabular (`99.94%`).
    2. Rata-rata Latency global (`38ms`).
    3. Status Insiden Aktif (`0 ACTIVE` atau `[!] 2 INCIDENTS`).
    4. Total Endpoint yang Dipantau (`12 MONITORS`).
  - **Grafik Latency Komposit (`<UChart>`):** Menampilkan perbandingan latency antar endpoint aktif dalam 24 jam terakhir.
  - **Live Probe Stream Feed:** Mini-tabel yang menampilkan 10 pemeriksaan terakhir secara real-time via WebSocket broadcast event `CHECK_COMPLETED` (serta mendengarkan `INCIDENT_TRANSITION`).

### 5.3. Layar Manajemen Monitor (`/dashboard/monitors`)
- **Tujuan:** Inventarisasi, filter status, dan aksi cepat terhadap seluruh endpoint yang dipantau (PRD Fitur #2, #5, #6).
- **Fitur Antarmuka:**
  - Baris filter: Pencarian teks URL/nama monitor, dropdown filter status (`ALL`, `OPERATIONAL`, `DEGRADED`, `DOWN`, `PAUSED`, `UNKNOWN`).
  - Tombol aksi: `[+ TAMBAH MONITOR BARU]` (`/dashboard/monitors/new`).
  - Tabel Data (`UTable`):
    - Kolom 1: Status Health Badge (`[OPERATIONAL]`, `[DEGRADED]`, `[DOWN]`, `[PAUSED]`, `[UNKNOWN]`).
    - Kolom 2: Metode HTTP (badge ringkas: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`).
    - Kolom 3: Nama Monitor & Target URL (disertai tombol salin URL).
    - Kolom 4: Mini Latency Sparkline SVG (ringkasan 20 titik pemeriksaan terakhir).
    - Kolom 5: Uptime 24h & Rata-rata Latency.
    - Kolom 6: Waktu Pemeriksaan Terakhir (relatif & absolut UTC).
    - Kolom 7: Menu Aksi Cepat (`UDropdownMenu`):
      - `[RUN PROBE NOW]` (eksekusi manual instan via pg-boss priority).
      - `[PAUSE / RESUME]` (toggle status aktif — jika di-pause saat kondisi insiden terbuka/DOWN, modal/tooltip konfirmasi menginformasikan bahwa insiden tetap terbuka / unresolved sesuai invariant arsitektur).
      - `[EDIT CONFIGURATION]`.
      - `[DELETE MONITOR]` (konfirmasi modal dengan penghapusan kaskade).

### 5.4. Form Konfigurasi Monitor (`/dashboard/monitors/new` & `[id]/edit`)
- **Tujuan:** Konfigurasi mendalam parameter request, autentikasi aman, jadwal interval, dan aturan validasi respons (PRD Fitur #3, #4, #5, #11, #12).
- **Pola Tata Letak (Stepped Monospace Tabs + Live Probe Bar):**
  Menggunakan `UTabs` horizontal yang mengelompokkan form tanpa membebani halaman:

  ```
  +----------------------------------------------------------------------------------------------------+
  | [01: TARGET & SCHEDULE]    [02: HEADERS & AUTHENTICATION]    [03: RESPONSE ASSERTIONS]             |
  +----------------------------------------------------------------------------------------------------+
  | (Konten Tab Aktif)                                                                                 |
  |                                                                                                    |
  | ... field input sesuai tab ...                                                                     |
  |                                                                                                    |
  +----------------------------------------------------------------------------------------------------+
  | [STICKY FOOTER ACTION BAR]                                                                         |
  | [> RUN TEST PROBE SEKARANG]                   [BATAL]  [SIMPAN & AKTIFKAN MONITOR]                 |
  +----------------------------------------------------------------------------------------------------+
  ```

  - **Tab 01: Target & Schedule:**
    - Nama Monitor (wajib, max 100 char).
    - Metode HTTP (`USelect`: GET, POST, PUT, PATCH, DELETE, HEAD).
    - Target URL (`UInput`: validasi skema `http://` / `https://` dengan perlindungan SSRF).
    - Interval Pemeriksaan (`USelect`: 1m, 5m, 15m, 30m, 1h, 6h, 12h, 24h).
    - Timeout (`UInput`: 1000ms - 30000ms, default 10000ms).
  - **Tab 02: Headers & Authentication:**
    - Tipe Autentikasi (`USelect`: None, Bearer Token, Basic Auth, API Key, Custom Header).
    - Input Rahasia Kredensial: Nilai disamarkan (*masked* `••••••••`), dengan label peringatan *Zero-Leak Protocol* (dienkripsi menggunakan Libsodium AEAD sebelum disimpan ke database).
    - Custom Request Headers: Dynamic key-value builder dengan tombol `[+ BARIS HEADER]`.
    - Request Body: Textarea monospaced untuk payload JSON (khusus POST, PUT, PATCH).
  - **Tab 03: Response Assertions (Validasi Kontrak — maks 10 aturan):**
    - Expected HTTP Status (`UInput`: default `200` atau daftar koma `200, 201`).
    - Response Header Assertions: Key-value validator (contoh `content-type` harus mengandung `application/json`).
    - JSONPath Body Assertion Builder (PRD Bagian 4.1):
      - Input ekspresi JSONPath (contoh `$.status` atau `$.data.user.id`, dibatasi $\le$ 100 karakter dengan evaluasi safe AST `preventEval: true`).
      - Operator perbandingan (`EQUALS`, `NOT_EQUALS`, `CONTAINS`, `EXISTS`).
      - Expected Value (tipe string, boolean, atau number).
      - Batasan Form & Validasi Inline: Maksimal total 10 aturan kombinasi status, header, dan body per monitor.
  - **Sticky Test Probe Action Bar:**
    - Tombol `[> RUN TEST PROBE SEKARANG]`: Menjalankan pemeriksaan langsung (*dry-run*) ke server tanpa menunggu scheduler, menampilkan modal ringkasan status code, latency, dan checklist assertion yang lolos/gagal.
    - Tombol `[SIMPAN MONITOR]`: Validasi form via Zod Standard Schema, simpan ke database dengan optimistik concurrency lock versioning (ARCHITECTURE Bagian 6.3.B).

### 5.5. Layar Detail Monitor & Telemetri (`/dashboard/monitors/[id]`)
- **Tujuan:** Analisis mendalam performa endpoint, visualisasi latency, dan audit log pemeriksaan (PRD Fitur #7, #8, #16, #17, #18, #19, #20).
- **Komponen:**
  1. **Header Banner:** Nama monitor, URL tujuan, status badge saat ini, tombol `[PAUSE]`, `[EDIT]`, dan `[TRIGGER MANUAL CHECK]`.
  2. **Kartu Agregasi Uptime & Latency:**
     - 24 Jam Uptime & Rata-rata Latency.
     - 7 Hari Uptime & P95 Latency.
     - 30 Hari Uptime & P99 Latency.
  3. **Grafik Latency Responsif (`<UChart>`):**
     - Menggunakan Nuxt UI `<UChart>` (berbasis TanStack Charts SVG).
     - Garis hijau fosfor untuk respons sukses (`200 OK`).
     - Titik merah tegas (*crimson dots*) untuk respons gagal / timeout.
     - Interaksi hover menampilkan tooltip monospaced: Timestamp UTC, Latency, Status Code, Status Assertion.
  4. **Tabel Riwayat Pemeriksaan Terakhir (`UTable`):**
     - Menampilkan riwayat check historis.
     - Kolom: Waktu UTC, Status Code, Latency (ms), Status Assertions (Pass/Fail count), dan Tombol `[INSPECT]`.
  5. **Inspection Slideover Drawer (`USlideover`):**
     - Membuka drawer dari sisi kanan layar (`width: 480px`) saat tombol `[INSPECT]` diklik.
     - Menampilkan detail teknis diagnostik mendalam:
       - Badge Kategori Kegagalan: Menampilkan kategori kegagalan resmi dari enum `failure_category` (termasuk `RESPONSE_SIZE_EXCEEDED` dan `EXECUTION_ABORTED`).
       - IP Address hasil pinning SSRF (`Socket IP Pinning`).
       - HTTP Request Headers yang dikirim (kredensial disanitasi).
       - HTTP Response Headers yang diterima dari target.
       - Cuplikan Response Body (max 5KB, format JSON syntax highlight).
       - Checklist Evaluasi Assertion: Setiap aturan JSONPath diberi status `[PASS]` hijau atau `[FAIL]` merah disertai alasan spesifik (contoh: `Expected "active", received "pending"`).

### 5.6. Layar Manajemen Insiden (`/dashboard/incidents`)
- **Tujuan:** Pelacakan insiden aktif, riwayat downtime, dan deteksi pemulihan otomatis (PRD Bagian 3.D, Fitur #9, #21-#25).
- **Logika Status Insiden:**
  - **OPEN:** Dipicu setelah $\ge 3$ kali kegagalan berturut-turut (`is_resolved = false`).
  - **RECOVERING (Status Turunan UI):** Diturunkan saat insiden aktif mengalami 1 pemeriksaan sukses (`consecutiveSuccesses == 1`, `is_resolved = false`; membutuhkan 2x sukses berturut-turut untuk otomatis resolved).
  - **RESOLVED:** Insiden ditutup setelah 2 pemeriksaan sukses berturut-turut (`is_resolved = true`).
- **Komponen:**
  - **Active Incident Banner (jika ada insiden aktif):**
    - Border Rose 2px berkedip halus.
    - Live Stopwatch Downtime: Menampilkan durasi gangguan secara detik-demi-detik (`DOWNTIME: 00:14:22`).
    - Failure Streak Counter: Menampilkan jumlah kegagalan berturut-turut (misal `5 consecutive failures`).
  - **Tabel Arsip Insiden:**
    - ID Insiden (UUIDv7 berurutan).
    - Monitor Terkait.
    - Waktu Mulai Gangguan (UTC).
    - Waktu Pemulihan (UTC).
    - Total Durasi Gangguan (`18m 42s`).
    - Penyebab Utama (*Root Cause Summary*: contoh `HTTP 504 Gateway Timeout` atau `Assertion Failed: $.auth.token is missing`).
    - Status Notifikasi Telegram: `[DISPATCHED: 2 MESSAGES]` (Opened + Resolved).

### 5.7. Layar Pengaturan & Integrasi (`/dashboard/settings`)
- **Tujuan:** Konfigurasi notifikasi Telegram, manajemen akun pemilik, dan ekspor data (PRD Bagian 3.E, Fitur #10, #11, #26-#30).
- **Section Konfigurasi:**
  1. **Integrasi Telegram Bot:**
     - Bot Token Input (`UInput` tipe masked: `123456789:AA••••••••••••••••••••••••••••••`).
     - Target Chat ID (`UInput`: contoh `-1001234567890` atau ID chat pribadi).
     - Tombol `[TEST PING BOT]`: Mengirim pesan uji coba instan via endpoint `/api/settings/telegram/test` dengan notifikasi status toast instan.
     - Kebijakan Zero-Spam: Keterangan bahwa bot hanya mengirim notifikasi saat insiden dibuka dan ditutup (tidak ada spam pada kegagalan berulang).
  2. **Kredensial Akun Pemilik:**
     - Ubah password pemilik aplikasi dengan verifikasi password lama (Argon2id hashing).
  3. **Ekspor Data (Laporan CSV):**
     - Tombol `[DOWNLOAD CSV RIWAYAT PEMERIKSAAN]`: Mengunduh stream CSV riwayat pemeriksaan via endpoint `GET /api/reports/export.csv?type=checks`.
     - Tombol `[DOWNLOAD CSV RIWAYAT INSIDEN]`: Mengunduh stream CSV riwayat insiden via endpoint `GET /api/reports/export.csv?type=incidents`.
     - Menggunakan streaming cursor Nitro RFC compliance untuk menghindari *memory exhaustion* dengan sanitasi formula injection (ARCHITECTURE Bagian 5.4 dan 9.3).

---

## 6. Arsitektur Komponen Nuxt UI v4 & Pemetaan Pola

Sistem mengoptimalkan komponen bawaan `@nuxt/ui` v4 yang dibangun di atas Reka UI dan Tailwind CSS v4:

### 6.1. Pemetaan Komponen

| Kebutuhan Antarmuka | Komponen Nuxt UI v4 | Konfigurasi Khusus & Varian |
|---|---|---|
| **Aplikasi Root** | `<UApp>` | Membungkus seluruh aplikasi di `app.vue`. Wajib untuk rendering modal, toast, dan overlay. |
| **Navigasi Tab Bar** | `<UTabs>` | Varian flat border-b, tanpa background pill bulat. |
| **Tombol Aksi** | `<UButton>` | Varian `solid` (Emerald) untuk aksi primer, `outline` (hairline `#27272a`) untuk aksi sekunder. |
| **Input Form** | `<UInput>`, `<USelect>`, `<UTextarea>` | Font Geist Mono, padding kompak `8px 12px`, border `#27272a`, focus ring `#a1a1aa`. |
| **Form Wrapper** | `<UForm>`, `<UFormField>` | Integrasi Zod Standard Schema, validasi error inline di bawah field. |
| **Tabel Telemetri** | `<UTable>` | Header uppercase monospace, border pemisah baris 1px, zero zebra-striping, hover subtle `#18181b`. |
| **Status Indikator** | `<UBadge>` | Varian `subtle`, border 1px, typography `{typography.caption-sm}`, bentuk kotak (`rounded-xs`). |
| **Inspeksi Detail** | `<USlideover>` | Muncul dari kanan layar, border kiri hairline 1px `#27272a`, background `#0c0c0e`. |
| **Konfirmasi Destruktif**| `<UModal>` | Dialog konfirmasi hapus monitor/insiden dengan peringatan tegas warna Rose. |
| **Visualisasi Latency** | `<UChart>` | Rendering grafik SVG responsif terintegrasi `@tanstack/vue-charts`, tema gelap sinkron. |
| **Notifikasi Sistem** | `useToast()` (`<UToast>`) | Muncul di sudut kanan bawah dengan layout monospaced dan icon Lucide (`i-lucide-*`). |
| **Pencarian Cepat** | `<UCommandPalette>` | Modal popover navigasi cepat dengan pintasan keyboard `Ctrl+K`. |

### 6.2. Aturan Override Komponen (`app.config.ts`)

Untuk memastikan komponen Nuxt UI v4 secara default merender estetika terminal tanpa konfigurasi berulang pada setiap template:

```typescript
// apps/web/app/app.config.ts
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'emerald',
      neutral: 'zinc'
    },
    button: {
      defaultVariants: {
        size: 'sm',
        color: 'primary',
        variant: 'solid'
      },
      slots: {
        base: 'font-mono rounded-xs transition-colors duration-150 cursor-pointer'
      }
    },
    input: {
      defaultVariants: {
        size: 'sm'
      },
      slots: {
        base: 'font-mono rounded-xs border-hairline bg-surface focus:border-hairline-strong focus:ring-0'
      }
    },
    badge: {
      defaultVariants: {
        size: 'sm',
        variant: 'subtle'
      },
      slots: {
        base: 'font-mono font-medium rounded-xs border uppercase tracking-wider'
      }
    },
    table: {
      slots: {
        th: 'font-mono text-xs font-semibold text-text-secondary border-b border-hairline uppercase bg-canvas-subtle py-2.5 px-3',
        td: 'font-mono text-xs text-text-primary border-b border-hairline py-2 px-3',
        tr: 'hover:bg-surface-hover transition-colors'
      }
    },
    card: {
      slots: {
        root: 'rounded-none border border-hairline bg-surface shadow-none',
        header: 'border-b border-hairline px-4 py-3',
        body: 'p-4'
      }
    }
  }
});
```

---

## 7. Model Kelengkapan State (State Completeness Matrix)

Setiap komponen dan halaman wajib mengimplementasikan 6 status antarmuka secara eksplisit sesuai prinsip `/frontend-design`:

| State | Indikator Visual & Representasi Komponen | Aksi Pemulihan Pengguna |
|---|---|---|
| **1. Initial / Loading** | `<USkeleton>` monospaced berbentuk blok teks abu-abu berkedip halus pada baris tabel dan kartu metrik. Tidak ada spinner lingkaran kartun. | Non-interaktif sementara data disiapkan. |
| **2. Empty State** | Blok kontainer dengan border putus-putus (`border-dashed border-zinc-800`), teks penjelas monospaced (`[TIDAK ADA MONITOR AKTIF]`), dan tombol CTA `[+ BUAT MONITOR PERTAMA]`. | Tombol langsung membuka form pembuatan. |
| **3. Live / Success** | Indikator `[● LIVE]` hijau di header, baris tabel berkedip hijau halus 500ms saat data diperbarui via WebSocket (`animate-pulse-subtle`). | Data up-to-date otomatis tanpa perlu reload. |
| **4. Stale / Offline** | Header berubah menjadi `[○ SYNCING...]` kuning atau `[✕ DISCONNECTED]` merah jika koneksi WebSocket terputus. Metrik diberi label `(STALE DATA)`. | Auto-reconnect berjalan otomatis di background, tombol manual `[RECONNECT]` tersedia. |
| **5. Error (RFC 9457)** | `<UAlert>` varian Rose menampilkan `title`, `detail`, dan `instance` dari payload RFC 9457 Problem Details. | Tombol `[COBA LAGI]` (`retry()`) atau tombol navigasi kembali. |
| **6. Destructive Confirm**| `<UModal>` dengan konfirmasi eksplisit pengetikan nama monitor sebelum proses hapus dieksekusi. | Tombol `[BATAL]` dan `[HAPUS PERMANEN]`. |

---

## 8. Aksesibilitas & Standar Kepatuhan WCAG 2.2 AA

1. **Rasio Kontras Warna:** Seluruh pasangan warna teks terhadap warna latar memenuhi standar WCAG 2.2 Level AA:
   - Teks Utama (`#fafafa`) di atas Canvas (`#09090b`): Kontras rasio **14.8:1** (Melampaui syarat 4.5:1).
   - Teks Sekunder (`#a1a1aa`): Kontras rasio **7.2:1**.
   - Teks Status Emerald (`#10b981`): Kontras rasio **5.8:1**.
   - Teks Status Amber (`#f59e0b`): Kontras rasio **6.1:1**.
   - Teks Status Rose (`#f43f5e`): Kontras rasio **5.1:1**.
2. **Operabilitas Keyboard Sepenuhnya:**
   - Navigasi tab bar dapat dijelajahi menggunakan tombol `ArrowLeft` / `ArrowRight` / `Tab`.
   - Seluruh baris aksi dan modal memiliki indikator fokus yang jelas (`outline: 1px solid #a1a1aa`, `outline-offset: 2px`).
   - Tidak ada jebakan keyboard (*no keyboard traps*). Modal dan drawer mengembalikan fokus ke elemen pemanggil saat ditutup.
3. **Screen Reader Semantic Support:**
   - Seluruh status badge menyertakan atribut `aria-label` yang jelas (contoh: `aria-label="Status Monitor: Operational, semua assertion lolos"`).
   - Notifikasi insiden real-time diumumkan via elemen `aria-live="polite"` agar pengguna screen reader mengetahui perubahan status tanpa disorientasi.
4. **Target Sentuh Minimum:** Seluruh tombol dan area interaktif memiliki tinggi minimal `36px` dengan padding minimal yang setara target sentuh `44x44px` pada perangkat mobile.

---

## 9. Responsif & Perilaku Multi-Breakpoint

| Breakpoint | Lebar Viewport | Penyesuaian Layout & Perilaku Responsif |
|---|---|---|
| **Desktop Ultra** | `> 1440px` | Kontainer terkunci pada `max-w-[1440px]` terpusat, 4 kartu metrik sejajar, tabel menampilkan seluruh 7 kolom data. |
| **Desktop Standar**| `1024px - 1439px` | Layout default. Tabel telemetri penuh, grafik latency dengan rentang waktu 24 jam penuh. |
| **Tablet** | `768px - 1023px` | Kartu metrik menjadi grid 2x2. Kolom sparkline disembunyikan dari tabel utama untuk menjaga ruang baca URL dan status. |
| **Mobile** | `< 768px` | Topbar tab navigasi beralih ke menu dropdown kompak. Kartu metrik menumpuk 1 kolom vertikal. Tabel telemetri beralih ke *card list view* monospaced. Drawer inspeksi menggunakan lebar penuh `100vw`. |

---

## 10. Panduan Verifikasi & Quality Checklist

Sebelum kode frontend di-commit atau diapprove, wajib memvalidasi daftar periksa berikut:

- [ ] **Kepatuhan Stack:** Menggunakan komponen resmi `@nuxt/ui` v4 dan styling Tailwind CSS v4 `@theme`.
- [ ] **Zero Hardcoded Colors:** Tidak menggunakan warna utility ad-hoc seperti `bg-gray-800` atau `text-red-500`; selalu gunakan semantic token (`bg-surface`, `text-primary`, `border-hairline`, `status-operational`).
- [ ] **Zero-Leak UI Protocol:** Nilai kredensial target dan token Telegram tidak pernah ditampilkan dalam teks biasa (selalu di-mask).
- [ ] **Kontrak Sinkronisasi:** Tipe data DTO, request, dan response merujuk langsung ke package `@sentinel/contracts`.
- [ ] **Penanganan WebSocket:** Komponen reaktif terhadap event `sentinel_events` dan memiliki fallback visual saat koneksi terputus.
- [ ] **Aksesibilitas:** Seluruh interaksi dapat dijalankan 100% menggunakan keyboard dan lolos uji kontras warna WCAG AA.
- [ ] **Pengujian E2E:** Seluruh alur utama (Login, Tambah Monitor, Dry-Run Probe, Inspeksi Hasil, Simpan Pengaturan Telegram) terlindungi oleh suite pengujian otomatis Playwright.
