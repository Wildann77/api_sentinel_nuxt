# API Sentinel — TASK.md

Daftar tugas implementasi lengkap untuk **API Sentinel**, diturunkan langsung dari tiga dokumen sumber:

- [PRD.md](./PRD.md) — kebutuhan produk, 30 user story, logika bisnis, strategi pengujian.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — topologi, DDD + Hexagonal, keamanan, skema DB, queue, observabilitas, deployment.
- [DESIGN.md](./DESIGN.md) — sistem desain terminal-monospace, layar, komponen Nuxt UI v4, state, aksesibilitas.

Dokumen ini dirancang agar dapat dieksekusi bertahap oleh developer atau AI assistant: setiap fase dibagi menjadi tugas kecil, setiap tugas punya penjelasan **apa yang dibangun**, **langkah actionable**, **kriteria selesai**, dan **referensi** ke dokumen sumber.

---

## Cara Memakai Dokumen Ini

**Notasi referensi:** `PRD §x` = PRD.md, `ARCH §x` = ARCHITECTURE.md, `DES §x` = DESIGN.md, `US n` = User Story PRD §3, `D-nn` = keputusan pada Fase 0.

**Urutan:** kerjakan fase berurutan. Tugas dalam satu fase boleh paralel kecuali ada baris `Prasyarat`. Fase 0 wajib selesai (minimal bagian "Keputusan Blokir") sebelum Fase 2 dan Fase 4 dimulai karena memengaruhi skema dan domain.

**Aturan Definition of Done (berlaku untuk SETIAP tugas):**

- [ ] `bun run lint` (Biome), `bun run typecheck`, dan `bun run check:boundaries` lulus.
- [ ] Pengujian yang relevan ditulis bersamaan dengan kode dan lulus (Vitest/Testcontainers/Playwright sesuai lapisan).
- [ ] Tidak ada rahasia (password, token, API key, header auth, keyring) yang bocor ke respons API, log, CSV, atau pesan error.
- [ ] Kesalahan ditampilkan jelas (RFC 9457 di API, `ProblemAlert` di UI).
- [ ] Perubahan konfigurasi, env, migrasi, atau prosedur operasional dicatat di dokumentasi (Fase 18).
- [ ] Aturan Hexagonal dipatuhi: `domain` tanpa I/O, `application` hanya lewat port, `infra` mengimplementasikan port.

**Peta fase:**

| Fase | Cakupan | Bergantung pada |
|---|---|---|
| 0 | Rekonsiliasi dokumen & keputusan teknis | — |
| 1 | Fondasi monorepo, tooling, CI | 0 |
| 2 | Domain layer (aggregate, VO, engine) | 0, 1 |
| 3 | Contracts, port, test double | 2 |
| 4 | Infra: database, migrasi, repository, UoW | 0, 3 |
| 5 | Infra: kripto, hasher, logger, rate limiter, pubsub | 3 |
| 6 | Infra: probe jaringan SSRF-safe | 2, 3 |
| 7 | Slice Identity & Access (auth, sesi, middleware) | 4, 5 |
| 8 | Slice manajemen monitor | 4, 5, 6, 7 |
| 9 | Worker, scheduler, pipeline pemeriksaan | 4–8 |
| 10 | Insiden & notifikasi Telegram | 9 |
| 11 | Riwayat, metrik, uptime/latency, ekspor CSV | 4, 9 |
| 12 | Real-time (LISTEN/NOTIFY + WebSocket) | 9 |
| 13 | Observabilitas (OTel, Prometheus, health) | 9 |
| 14 | Frontend: fondasi & komponen bersama | 7, 8 |
| 15 | Frontend: layar | 10–12, 14 |
| 16 | Kualitas UX: state, aksesibilitas, responsif | 15 |
| 17 | Suite pengujian lintas lapisan & gerbang CI | 1–16 |
| 18 | Deployment, dokumentasi, rilis | semua |

---

## Fase 0 — Rekonsiliasi Dokumen & Keputusan Teknis

**Tujuan:** menutup celah dan inkonsistensi antar-dokumen sebelum kode ditulis. Beberapa temuan berasal dari pembacaan silang PRD/ARCH/DES; sebagian diverifikasi ke dokumentasi resmi (pg-boss, Nuxt UI, Nitro, Drizzle, Bun).

### P0.1 — Putuskan dan catat keputusan D-01 s.d. D-24

**Membangun:** tabel keputusan final yang menjadi sumber kebenaran, lalu dipatch ke dokumen terkait.

Kolom "Rekomendasi" adalah usulan; ubah jika Anda memilih lain, lalu tandai `[x]`.

| ID | Temuan | Keputusan Final (Disetujui) | Blokir |
|---|---|---|---|
| D-01 | ARCH §6.3/§7.1 menulis `boss.send(..., { db: tx })`. API pg-boss butuh adapter `Db` (`executeSql`); untuk Drizzle gunakan `fromDrizzle(tx, sql)`. | **DISETUJUI:** Tulis `QueuePort` adapter yang membungkus `tx` via `fromDrizzle(tx, sql)`. Perbaiki contoh di ARCH. | Ya (F4) |
| D-02 | pg-boss v10+ mewajibkan `createQueue()` sebelum `send()`; `singletonKey` hanya menjamin keunikan pada policy `short`/`singleton`/`stately`; `send()` mengembalikan `null` (bukan error) bila ditolak policy. ARCH tidak menyebut policy. | **DISETUJUI:** `probe:check` → policy `stately` + `singletonKey = monitorId` (maks 1 queued + 1 active per monitor; selaras PRD §4.9). `notification:send` → `stately` + `singletonKey = incidentId:type`. Selalu cek return `null`. Handler `work()` menerima array job. | Ya (F9) |
| D-03 | ARCH §1.2: `drizzle-kit v0.30.5` dipasangkan dengan `drizzle-orm v0.45.4`. Pasangan yang lazim adalah drizzle-orm 0.45.x + drizzle-kit 0.31.x; drizzle-orm < 0.45.2 terkena CVE-2026-39356. | **DISETUJUI:** Pin `drizzle-orm 0.45.4` dan `drizzle-kit 0.31.11`. Update matriks ARCH §1.2. | Ya (F1) |
| D-04 | ARCH §11.1 menyalin `bun.lockb`. Sejak Bun 1.2 default lockfile adalah `bun.lock` (teks); `--frozen-lockfile` akan gagal. | **DISETUJUI:** Ganti ke `bun.lock` di Dockerfile dan workflow CI. | Tidak |
| D-05 | ARCH §1.2 menyebut `@tanstack/vue-charts v1.1.0` untuk `<UChart>`; dokumentasi Nuxt UI menyebut `<UChart>` dibangun di atas TanStack Charts dan `@tanstack/charts` adalah optional peer dependency. | **DISETUJUI:** Pasang paket peer sesuai dokumentasi Nuxt UI v4.12 saat F14; perbarui ARCH. | Tidak |
| D-06 | `check_results` dipartisi bulanan, tetapi hanya 2 partisi contoh; tidak ada pembuatan partisi otomatis, partisi default, maupun retensi. drizzle-kit kurang andal untuk tabel partisi. | **DISETUJUI:** Migrasi kustom SQL untuk tabel partisi + job pemeliharaan (buat partisi N bulan ke depan, drop partisi lewat retensi) + partisi `DEFAULT` sebagai jaring pengaman. | Ya (F4) |
| D-07 | Job latar yang disebut tetapi belum didefinisikan: rollup `monitor_metrics_hourly`, cleanup `rate_limits` (ARCH §5.3 menyebut hourly), cleanup `sessions` kedaluwarsa, pemeliharaan partisi, retensi. | **DISETUJUI:** Daftarkan sebagai cron pg-boss di `apps/worker/src/jobs/maintenance` (F9). | Tidak |
| D-08 | PRD §4.3: akun awal dibuat lewat "proses setup yang dibatasi dan didokumentasikan"; ARCH tidak punya mekanisme. | **DISETUJUI:** CLI `bun run owner:create` (interaktif/env), menolak jika sudah ada user (didukung `uq_single_owner_guard`). | Tidak |
| D-09 | DES §5.7 punya "Ubah password pemilik" tetapi tidak ada use case/endpoint di PRD/ARCH. | **DISETUJUI:** Tambah `ChangeOwnerPasswordUseCase` + `PUT /api/settings/account/password` (verifikasi password lama, revoke sesi lain). Tambahkan ke ARCH §4.1 dan §9.3. | Tidak |
| D-10 | DES §5.4 "RUN TEST PROBE" menguji konfigurasi yang belum disimpan, namun hanya ada `POST /api/monitors/:id/check`. | **DISETUJUI:** Tambah `POST /api/monitors/test` (payload konfigurasi), `TestMonitorConfigUseCase`, rate limit Tier 2, tidak menyimpan hasil. | Tidak |
| D-11 | DES §5.5 drawer inspeksi butuh IP hasil pinning, request headers (disanitasi), response headers, cuplikan body ≤5 KB; skema `check_results` tidak menyimpannya. | **DISETUJUI:** Tambah kolom `diagnostics JSONB` (tersanitasi, batas ukuran) dan kolom `pinned_ip`. | Ya (F4) |
| D-12 | PRD §4.10 mewajibkan waktu terjadwal, waktu mulai/selesai, correlation ID; skema hanya `executed_at` + `duration_ms`. Metrik `job_lag` butuh waktu terjadwal. | **DISETUJUI:** Tambah `scheduled_for`, `started_at`, `finished_at` (atau pertahankan `executed_at` = started), `correlation_id`. | Ya (F4) |
| D-13 | Manual check: ARCH "tanpa memengaruhi counter produksi", PRD "tidak merusak status penjadwalan", tetapi tabel tidak membedakan sumber pemeriksaan, dan definisi kelayakan uptime (PRD §4.11) belum jelas. | **DISETUJUI:** Tambah kolom `trigger_type` (`SCHEDULED`/`MANUAL`); manual disimpan tetapi TIDAK mengubah counter/insiden dan TIDAK dihitung uptime; ditampilkan di riwayat dengan label. | Ya (F4) |
| D-14 | PRD §4.8 mewajibkan kategori kegagalan redirect yang jelas; enum `failure_category` tidak memilikinya. | **DISETUJUI:** Tambah nilai `REDIRECT_NOT_ALLOWED` di enum (migrasi) dan di badge UI (DES §5.5). | Ya (F2) |
| D-15 | Inkonsistensi assertion: PRD §4.7 = satu kode status + operator `exists/equals/contains`; DES §5.4 = daftar status `200, 201` + operator `NOT_EQUALS`. | **DISETUJUI (FINAL):** Multi-status code (misal: 200, 204) + 4 operator (`exists`, `equals`, `not_equals`, `contains`). Skema JSONB/array di DB. Sinkronkan PRD §4.7 dan DES §5.4. | Ya (F2) |
| D-16 | ARCH §3.3 mensyaratkan JSONPath "preventEval" tanpa menyebut pustaka, sedangkan `domain` wajib nol dependensi. | **DISETUJUI:** Implementasikan parser subset JSONPath sendiri di domain (`$`, `.key`, `['key']`, `[n]`, `[*]`, recursive `..key`), tanpa filter expression `?()`/script. Sintaks di luar subset ditolak saat validasi. | Ya (F2) |
| D-17 | Penghapusan monitor: use case "soft-delete" vs skema `ON DELETE CASCADE` tanpa `deleted_at`. | **DISETUJUI (FINAL):** Dual mode: Sediakan tombol 'Pause/Nonaktifkan' (`is_active: false`, status `PAUSED`, batalkan job pg-boss, simpan riwayat data) dan 'Hapus Permanen' (hard delete cascade + batalkan job pg-boss). UI wajib modal konfirmasi ketik nama monitor. | Tidak |
| D-18 | Ekspor CSV: PRD §4.17 butuh filter monitor + rentang waktu; ARCH hanya `?type=`. | **DISETUJUI:** Tambah query `monitorId`, `from`, `to` (UTC), validasi Zod. | Tidak |
| D-19 | Endpoint pendukung UI yang belum ada: feed pemeriksaan terbaru (DES §5.2), sparkline 20 titik per monitor (DES §5.3), grafik latency komposit multi-monitor (DES §5.2), status notifikasi pada insiden (DES §5.6). | **DISETUJUI:** Tambah `GET /api/checks/recent`, field `sparkline` pada list monitor, `GET /api/metrics/latency?range=`, dan ringkasan `notificationDeliveries` pada DTO insiden. | Tidak |
| D-20 | Env schema ARCH §10 tidak memuat `WORKER_PORT`, `HEARTBEAT_INTERVAL_SECONDS`, `OTEL_*`, `CHECK_RETENTION_DAYS`, `TELEGRAM_API_BASE_URL`; peran `SESSION_SECRET` tidak jelas karena sesi memakai opaque token + SHA-256. | **DISETUJUI (FINAL):** `SESSION_SECRET` wajib di `.env`: dipakai untuk cookie signing + HMAC-SHA256 token hash. Lengkapi semua env var yang kurang di Zod schema (`WORKER_PORT`, `HEARTBEAT_INTERVAL_SECONDS`, `OTEL_*`, `CHECK_RETENTION_DAYS`, `TELEGRAM_API_BASE_URL`). | Tidak |
| D-21 | AAD enkripsi hanya didefinisikan untuk monitor (`monitorId:field:name`); token Telegram di `notification_configs` belum punya AAD. | **DISETUJUI:** AAD token: `notificationConfigId:field:botToken`. | Tidak |
| D-22 | DES §6.2 memakai API v2 (`primary: 'emerald'`, `gray: 'zinc'`) dan utilitas `zinc-*`, sementara DES §10 melarang warna hardcode. Nuxt UI v4 memakai `ui.colors` (`primary`, `neutral`). | **DISETUJUI:** Verifikasi skema `app.config.ts` terhadap docs Nuxt UI v4; definisikan token semantik di Tailwind `@theme` dan pakai itu. | Tidak |
| D-23 | Retensi data: PRD §4.4 menyerahkan kebijakan ke implementasi. | **DISETUJUI:** Default `CHECK_RETENTION_DAYS=90`, rollup per jam dipertahankan 400 hari; dapat dikonfigurasi. | Tidak |
| D-24 | Ambiguitas versi `typescript v5.9+ / v7.0.x`; versi lain di matriks ARCH belum diverifikasi terhadap registry saat implementasi. | **DISETUJUI (FINAL):** Pin TypeScript `~5.9.3`. Versi definitif verified: `drizzle-orm 0.45.4`, `drizzle-kit 0.31.11`, `pg-boss 12.38.0`, `nuxt 4.6.2`, `@nuxt/ui 4.12.0`, `zod 4.6.7`, `libsodium-wrappers-sumo 0.8.4`, `@biomejs/biome 2.6.2`. | Tidak |

- [x] Tinjau semua D-nn, ubah rekomendasi bila perlu, tandai keputusan final.
- [x] Catat versi final paket (D-03, D-24) pada tabel yang sama.

**Selesai bila:** semua baris "Blokir = Ya" punya keputusan final.

### P0.2 — Patch dokumen sumber

**Membangun:** dokumen sumber yang konsisten dengan keputusan.

- [x] ARCH §1.2: perbarui versi (D-03, D-05, D-24) dan contoh pg-boss (D-01, D-02).
- [x] ARCH §4.1/§9.3: tambah use case dan endpoint baru (D-09, D-10, D-19, D-18).
- [x] ARCH §6.1: tambah kolom/enum baru (D-11, D-12, D-13, D-14) dan catatan partisi (D-06).
- [x] ARCH §10 & §11.1: env baru (D-20) dan `bun.lock` (D-04).
- [x] DES §5.4/§6.2: sinkronkan assertion (D-15) dan skema `app.config` (D-22).
- [x] PRD §4.7: catat keputusan assertion jika berubah.

**Selesai bila:** tidak ada kontradiksi antar-dokumen untuk item D-nn.

---

## Fase 1 — Fondasi Monorepo & Tooling

### P1.1 — Inisialisasi repository dan Bun workspace

**Membangun:** kerangka monorepo `api_sentinel_nuxt` sesuai ARCH §2.

- [x] Buat root `package.json` dengan `workspaces: ["apps/*", "packages/*"]`, `private: true`, `engines.node >= 24`.
- [x] Tambah `bunfig.toml`, `.nvmrc` (24.11.1), `.gitignore`, `.editorconfig`, `.dockerignore` (kecualikan `node_modules`, `.env*`).
- [x] Beri nama paket `@sentinel/contracts`, `@sentinel/domain`, `@sentinel/application`, `@sentinel/infra`, `@sentinel/web`, `@sentinel/worker`.
- [x] Tambahkan skrip root: `dev:web`, `dev:worker`, `build`, `typecheck`, `lint`, `format`, `check:boundaries`, `test`, `test:integration`, `test:e2e`, `db:generate`, `db:migrate`, `owner:create`, `secrets:reencrypt`.

**Selesai bila:** `bun install` berhasil dan workspace saling dapat diimpor.
**Ref:** ARCH §2.

### P1.2 — Konfigurasi TypeScript

**Membangun:** basis TS ketat untuk semua paket.

- [x] `tsconfig.base.json`: `strict: true`, `verbatimModuleSyntax: true`, target `ES2023`, `moduleResolution: Bundler`, `noUncheckedIndexedAccess`.
- [x] Buat `tsconfig.json` per paket yang meng-extend base; atur path alias `@sentinel/*`.
- [x] Pastikan Nuxt `tsconfig` (generated) kompatibel dengan base.

**Selesai bila:** `bun run typecheck` lulus pada semua paket kosong.
**Ref:** ARCH §1.2, §2.

### P1.3 — Scaffold paket dan aplikasi

**Membangun:** struktur folder lengkap ARCH §2 (kosong tetapi valid).

- [x] `packages/contracts/src/{dtos,schemas,events}`.
- [x] `packages/domain/src/{entities,value-objects,events,services,errors}`.
- [x] `packages/application/src/{ports/in,ports/out,use-cases}`.
- [x] `packages/infra/src/{db,repositories,network,crypto,notification,queue,logging,config}`.
- [x] `apps/web` (Nuxt 4 `app/` + `server/{api,routes,plugins,middleware,utils}`), `apps/worker/src/{index.ts,scheduler.ts,jobs,container.ts}`.
- [x] Tiap paket punya `index.ts` sebagai public API.

**Selesai bila:** semua paket dapat di-build/typecheck.
**Ref:** ARCH §2.

### P1.4 — Biome

**Membangun:** lint + format tunggal.

- [x] Tambah `biome.json` persis ARCH §2.1.A (versi sesuai D-24).
- [x] Skrip `lint`, `format`, `check`; format ulang repo awal.

**Selesai bila:** `bun run lint` bersih.
**Ref:** ARCH §2.1.A.

### P1.5 — dependency-cruiser (penegak Hexagonal)

**Membangun:** gerbang CI yang menggagalkan pelanggaran batas layer.

- [x] `.dependency-cruiser.js` dengan aturan tabel ARCH §2.1.B (domain tanpa impor apa pun kecuali TS standar; application → domain+contracts; contracts → tidak ada paket internal; infra → application/domain/contracts; web/worker; worker dilarang impor web).
- [x] Larang `domain` mengimpor pustaka I/O/framework eksternal.
- [x] Skrip `check:boundaries` (exit code 1 jika melanggar).
- [x] Tambah uji negatif: berkas fixture yang sengaja melanggar harus membuat check gagal.

**Selesai bila:** pelanggaran fixture terdeteksi; kode asli lolos.
**Ref:** ARCH §1.1, §2.1.B.

### P1.6 — Vitest + Testcontainers

**Membangun:** infrastruktur pengujian.

- [x] Vitest workspace per paket; ambang cakupan: domain & application ≥ 90%, infra ≥ 80%, SSRF guard 100%.
- [x] Helper `@testcontainers/postgresql` (PostgreSQL 17) dengan migrasi otomatis dan truncate antar-tes.
- [x] Helper server HTTP lokal terkendali (respons status/lambat/besar/gzip/redirect) dan mock DNS (untuk F6).
- [x] Helper mock Telegram API (kontrol 200/429/500).

**Selesai bila:** satu tes contoh di tiap layer berjalan.
**Ref:** ARCH §13, PRD §5.

### P1.7 — Validasi environment (fail-fast)

**Membangun:** modul konfigurasi tunggal yang dipakai web & worker.

- [x] `packages/infra/src/config/env.ts` dengan `EnvSchema` Zod (ARCH §10) + variabel D-20 (`WORKER_PORT`, `HEARTBEAT_INTERVAL_SECONDS`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `CHECK_RETENTION_DAYS`, `TELEGRAM_API_BASE_URL`).
- [x] Validasi `APP_KEYRING` (JSON, `activeKeyId` ada, semua key 32 byte base64).
- [x] Proses gagal booting dengan pesan jelas tanpa mencetak nilai rahasia.
- [x] Buat `.env.example` lengkap (ARCH §10).

**Selesai bila:** env invalid menghentikan boot; unit test menutup tiap aturan.
**Ref:** ARCH §10.

### P1.8 — Infrastruktur dev (Docker)

**Membangun:** lingkungan lokal PostgreSQL 17 + Prometheus + Jaeger.

- [x] `docker-compose.dev.yml` (ARCH §11.3) dan `infra/prometheus/prometheus.yml` (scrape web:3000 & worker:3001).
- [x] Hapus kunci `version` yang usang bila perlu.
- [x] Dokumentasikan workflow dev 5 langkah (ARCH §11.3).

**Selesai bila:** `docker compose -f docker-compose.dev.yml up -d` sehat; `pg_isready` OK.
**Ref:** ARCH §11.3.

### P1.9 — Pipeline CI

**Membangun:** gerbang kualitas otomatis.

- [x] Job: install (`--frozen-lockfile`), lint, typecheck, check:boundaries, unit, integration (Testcontainers), build web & worker, E2E (Playwright), audit dependensi.
- [x] Cache Bun, laporan cakupan, gagal bila di bawah ambang.

**Selesai bila:** pipeline hijau pada repo awal.
**Ref:** ARCH §2.1, §13.

---

## Fase 2 — Domain Layer

> Aturan: tanpa I/O, tanpa framework, tanpa pustaka eksternal. Semua kelas diuji unit ≥ 90%.

### P2.1 — Kernel bersama: exception, enum, UUIDv7

**Membangun:** fondasi tipe domain.

- [x] `DomainException` abstrak + `EntityNotFound`, `Validation` (dengan `invalidParams`), `SSRFBlocked`, `InvalidCredentials`, `Conflict`, `RateLimitExceeded` (`retryAfterSeconds`), `Forbidden` (ARCH §9.1.A).
- [x] Enum `HttpMethod`, `HealthStatus`, `FailureCategory` (11 nilai ARCH §6.1 + `REDIRECT_NOT_ALLOWED` per D-14), `TriggerType` (D-13).
- [x] Value object `UUIDv7` (validasi format, perbandingan, ekstraksi waktu).

**Selesai bila:** unit test memverifikasi status code & errorType tiap exception.
**Ref:** ARCH §3, §9.1.

### P2.2 — NetworkPolicy (CIDR matcher murni)

**Membangun:** logika blokir jaringan tanpa I/O, dipakai domain dan probe infra.

- [x] Konstanta `BLOCKED_CIDR_RANGES` lengkap (IPv4 15 entri + IPv6 9 entri, ARCH §5.1.A).
- [x] Parser IPv4/IPv6 sendiri (tanpa dependensi), cek keanggotaan CIDR.
- [x] Normalisasi IPv4-mapped IPv6 (`::ffff:a.b.c.d`), evaluasi NAT64 `64:ff9b::/96` dan 6to4 `2002::/16`.
- [x] Parser literal IP numerik non-standar (desimal, hex, octal, singkatan) sebelum cek CIDR.
- [x] Fungsi `assertAllowed(ips[])`: tolak bila SALAH SATU IP terblokir → `SSRFBlockedException`.

**Selesai bila:** tiap CIDR diuji (alamat di dalam & di luar batas) dengan cakupan 100%.
**Ref:** ARCH §5.1, PRD §4.8.

### P2.3 — EndpointUrl VO

**Membangun:** validasi URL target di sisi domain.

- [x] Hanya skema `http`/`https`; tolak userinfo (`user:pass@`); tolak host kosong; dukung IPv6 berkurung.
- [x] Jika hostname adalah IP literal, jalankan `NetworkPolicy`.
- [x] Batas panjang URL; normalisasi (tanpa mengubah semantik).
- [x] Pesan error `ValidationException` dengan `invalidParams` (contoh ARCH §9.1.C).

**Selesai bila:** unit test mencakup literal desimal/hex/octal, `[::1]`, `localhost`, userinfo, skema `ftp`.
**Ref:** ARCH §5.1, PRD §4.4/§4.8.

### P2.4 — EncryptedSecret VO & validasi header

**Membangun:** representasi ciphertext dan aturan header.

- [x] `EncryptedSecret.parse()` format `v1:<keyId>:<hexNonce 48>:<hexCtMac>`; tolak format salah.
- [x] `HeaderPolicy`: deny-list `Host`, `Content-Length`, `Transfer-Encoding`, `Connection`, `Keep-Alive`, `Upgrade`, `Proxy-Authorization` (case-insensitive).
- [x] Ekstraktor `headerKeys` (nama header saja) untuk kolom `header_keys`.
- [x] Definisi `AuthConfig` (None, Bearer, Basic, ApiKey, CustomHeader) dengan validasi kelengkapan (US 7).

**Selesai bila:** unit test lolos untuk tiap tipe auth dan deny-list.
**Ref:** ARCH §3.2, §5.1.B, §5.2; PRD §4.6.

### P2.5 — AssertionRule VO

**Membangun:** model aturan validasi respons.

- [x] Tipe aturan: `status`, `header` (`exists/equals/contains`), `body-json` (`exists/equals/contains`) sesuai D-15.
- [x] Batas: maks 10 aturan gabungan per monitor; query JSONPath ≤ 100 karakter.
- [x] Nilai ekspektasi bertipe (`string|number|boolean`); tanpa konversi implisit.
- [x] Nama header dibandingkan case-insensitive.

**Selesai bila:** aturan ke-11 ditolak; query 101 karakter ditolak.
**Ref:** ARCH §3.2/§3.3, PRD §4.7.

### P2.6 — AssertionEngine (parser JSONPath aman, tanpa eval)

**Membangun:** domain service evaluasi respons (mitigasi CVE-2024-21534/CVE-2025-1302).

- [x] Rancang & dokumentasikan grammar subset JSONPath (D-16); recursive-descent parser menghasilkan AST.
- [x] Evaluator AST murni; tanpa `eval()`/`Function()`; tolak `?()`/`()` script.
- [x] Evaluasi status HTTP, header, body JSON; hasil per aturan `AssertionExecutionResult` (`PASS/FAIL` + alasan, contoh `Expected "active", received "pending"`).
- [x] Perbandingan tipe ketat (`123` ≠ `"123"`); `contains` untuk string dan array.
- [x] Kasus gagal bernama: JSON tidak valid, JSONPath tidak dapat diproses, nilai tidak ada.
- [x] Sukses hanya bila semua aturan aktif lulus (PRD §4.7).

**Selesai bila:** unit test: status/header/JSONPath, JSON invalid, tipe ketat, serangan injeksi (`$..[?(@.constructor...)]`) ditolak.
**Ref:** ARCH §3.3, PRD §4.7/§5.1.

### P2.7 — CheckResult entity & sanitasi diagnostik

**Membangun:** catatan historis immutable.

- [x] Entity `CheckResult` (field ARCH §3.2 + `triggerType`, `scheduledFor`, `startedAt`, `finishedAt`, `correlationId`, `pinnedIp`, `diagnostics` per D-11/D-12/D-13).
- [x] Sanitizer `sanitizedDiagnostic`: redaksi token Telegram, header `Authorization`, API key, payload kredensial; batas panjang.
- [x] Latency `null` bila gagal sebelum request dimulai (PRD §4.12); tidak pernah `0` palsu.

**Selesai bila:** unit test: redaksi dan latency null.
**Ref:** ARCH §3.2, PRD §4.10/§4.12.

### P2.8 — Monitor aggregate root

**Membangun:** state machine kesehatan dan invarian (jantung domain).

- [x] Atribut ARCH §3.2 (termasuk `version`, `nextRunAt`, `currentIncidentId`).
- [x] Validasi pembuatan: nama ≤ 100, interval 60–86.400, timeout 1.000–30.000, aturan ≤ 10.
- [x] `recordCheckFailure`: DEGRADED (<3), DOWN + buka insiden di ≥3, update `failureCount` saat sudah DOWN, reset `consecutiveSuccesses`.
- [x] `recordCheckSuccess`: reset kegagalan; DOWN tetap bila <2 sukses; UP + `IncidentRecovered` di ≥2; non-DOWN → UP.
- [x] `pause()` (insiden tetap terbuka), `resume()` (→ `UNKNOWN`, `nextRunAt = now`).
- [x] `computeNextRun(clock, jitter ±5%)` tanpa catch-up burst (PRD §4.9).
- [x] Manual check tidak memanggil `recordCheck*` (D-13).
- [x] Menghasilkan domain event bertipe.

**Selesai bila:** tabel state transition diuji penuh: 1–2 gagal, gagal ke-3, gagal saat DOWN, 1 sukses lalu gagal (reset), 2 sukses, pause saat DOWN, resume.
**Ref:** ARCH §3.2, PRD §4.13/§4.14/§5.1, US 21–25.

### P2.9 — Incident entity & domain events

**Membangun:** siklus hidup insiden.

- [x] Entity `Incident` (field ARCH §3.2): `open`, `registerFailure`, `resolve` (hitung `durationSeconds`).
- [x] `IncidentOpenedEvent`, `IncidentRecoveredEvent`, event update `failureCount`.
- [x] Invarian satu insiden terbuka per monitor (diperkuat DB di F4).

**Selesai bila:** unit test durasi, resolve ganda ditolak.
**Ref:** ARCH §3.2, PRD §4.14.

### P2.10 — Kalkulator uptime & agregasi murni

**Membangun:** aturan metrik terdokumentasi dan teruji (PRD §5.1).

- [x] `calculateUptime(success, total)` → `null` (N/A) bila `total = 0`; 100% tidak pernah dihasilkan tanpa data.
- [x] Penggabung bucket (untuk rollup per jam): total, sukses, rata-rata berbobot.
- [x] Dokumentasikan aturan: hanya pemeriksaan `SCHEDULED` yang layak; PAUSED & jadwal terlewat tidak dihitung.

**Selesai bila:** unit test: 97/100 = 97%; 0 data → N/A.
**Ref:** PRD §4.11/§4.12.

---

## Fase 3 — Contracts, Port, Test Double

### P3.1 — Contracts: DTO, skema Zod, event

**Membangun:** kontrak bersama client–web–worker (Standard Schema-compliant).

- [x] DTO + skema untuk: Auth (login, me, change password), Monitor (create/update/response TANPA rahasia, `headerKeys`, `authType`, `version`, `sparkline`), Check, CheckDetail (diagnostics), Incident (+ ringkasan notifikasi), Metrics (summary, per-monitor bucket, latency komposit), Telegram settings, ReportQuery.
- [x] `ProblemDetails` (RFC 9457) dan `CursorPage<T>` (`limit`, `hasMore`, `nextCursor`).
- [x] Payload event `CHECK_COMPLETED`, `INCIDENT_TRANSITION` (ARCH §9.4) dan payload NOTIFY (< 8.000 byte).
- [x] Skema `invalidParams` selaras `ValidationException`.

**Selesai bila:** tiap skema punya tes valid/invalid; paket tidak mengimpor domain/infra.
**Ref:** ARCH §2, §7.2, §9.

### P3.2 — Outbound ports

**Membangun:** semua antarmuka I/O di `application/ports/out`.

- [x] Repository: `MonitorRepositoryPort`, `IncidentRepositoryPort`, `CheckResultRepositoryPort`, `SessionRepositoryPort`, `UserRepositoryPort`, `NotificationConfigRepositoryPort`, `NotificationDeliveryRepositoryPort`.
- [x] Layanan: `NetworkProbePort`, `CipherPort`, `QueuePort`, `PubSubPort`, `RateLimiterPort`, `PasswordHasherPort`, `IdGeneratorPort`, `ClockPort`, `UnitOfWorkPort`, `LoggerPort`.
- [x] Tambahan hasil D-nn: `NotificationPort` (Telegram), `MetricsRepositoryPort`/query port untuk rollup & agregasi.

**Selesai bila:** semua port terdokumentasi (kontrak error & idempotensi).
**Ref:** ARCH §4.2, §12.1.

### P3.3 — Inbound ports (use case interfaces)

- [x] Antarmuka untuk 13 use case ARCH §4.1 + `ChangeOwnerPasswordUseCase` (D-09), `TestMonitorConfigUseCase` (D-10), `ListMonitorsQuery`, `GetMonitorQuery`, `ListChecksQuery`, `ListIncidentsQuery`, `GetIncidentQuery`, `GetRecentChecksQuery`, `ValidateSessionUseCase`.
- [x] Konvensi `<Verb><Noun>UseCase`; tipe Command vs Query.

**Selesai bila:** daftar port cocok dengan matriks traceability ARCH §12.1.

### P3.4 — Test double in-memory

**Membangun:** fake untuk semua port agar use case dapat diuji cepat.

- [x] `InMemory*Repository`, `FakeClock`, `SequentialIdGenerator`, `FakeCipher`, `FakeProbe` (skrip respons), `FakeQueue`, `FakeUnitOfWork` (rollback simulasi), `FakeRateLimiter`.

**Selesai bila:** dipakai oleh minimal satu use case test.

### P3.5 — Presenter & mapper

**Membangun:** pemetaan domain → DTO.

- [x] Mapper `Monitor → MonitorDto` (tanpa rahasia, hanya `headerKeys`/`authType`).
- [x] `HealthStatus UP → [OPERATIONAL]`; status turunan `RECOVERING` (DOWN + `consecutiveSuccesses == 1`).
- [x] Mapper insiden & check; uptime `null` → "N/A" di DTO (nilai `null`, bukan 0).

**Selesai bila:** unit test memastikan tidak ada field rahasia pada DTO.
**Ref:** ARCH §3.2, DES §3.2/§5.6.

---

## Fase 4 — Infra: Database

### P4.1 — Koneksi & konfigurasi Drizzle

- [x] `drizzle.config.ts` (drizzle-kit 0.31.x), fabrik `pg.Pool` (ukuran pool, timeout, `application_name`).
- [x] Rancang pembagian koneksi: Pool Drizzle, pool pg-boss, `pg.Client` khusus LISTEN.
- [x] Skrip `db:generate`, `db:migrate` (runner terisolasi).

**Selesai bila:** koneksi ke Postgres dev berhasil; pool ditutup rapi saat shutdown.
**Ref:** ARCH §1.2, §6.

### P4.2 — Skema Drizzle

**Membangun:** skema ARCH §6.1 + penyesuaian D-nn.

- [x] Enum: `http_method`, `health_status`, `failure_category` (+ `REDIRECT_NOT_ALLOWED`), `delivery_status`, `trigger_type`.
- [x] Tabel: `users`, `sessions`, `rate_limits`, `monitors`, `incidents`, `check_results`, `monitor_metrics_hourly`, `notification_configs`, `notification_deliveries`, `worker_heartbeats`.
- [x] Tambahan: `check_results.{trigger_type, scheduled_for, started_at, finished_at, correlation_id, pinned_ip, diagnostics JSONB}`.
- [x] Constraint: `chk_monitor_interval`, `chk_monitor_timeout`; FK dan aksi `ON DELETE`.
- [x] Indeks: `idx_sessions_*`, `idx_rate_limits_expire`, `idx_monitors_due` (partial `is_active`), `uq_incidents_one_open` (partial), `idx_check_results_metrics` (INCLUDE), `idx_check_results_incident`, `idx_notification_deliveries_*`, `uq_single_owner_guard`.
- [x] Siklus FK `monitors.current_incident_id ↔ incidents` ditangani lewat `ALTER TABLE`.

**Selesai bila:** skema Drizzle cocok dengan DDL referensi; tipe TS ter-generate.
**Ref:** ARCH §6.1, §6.4.

### P4.3 — Migrasi (termasuk SQL kustom partisi)

**Membangun:** migrasi deklaratif + SQL manual untuk fitur yang tidak ditangani drizzle-kit.

- [x] Migrasi awal via `drizzle-kit generate`.
- [x] Migrasi kustom (`generate --custom`) untuk `check_results ... PARTITION BY RANGE (executed_at)`, partisi bulan berjalan + 2 bulan ke depan + partisi `DEFAULT` (D-06).
- [x] Pastikan snapshot drizzle tidak mencoba membuat ulang tabel partisi (gunakan pola modul terpisah/`tablesFilter` sesuai perilaku drizzle-kit versi terpasang).
- [x] Ekstensi: `pgcrypto` bila dibutuhkan pg-boss; `uuid-ossp` hanya bila benar-benar dipakai.
- [x] Migrasi seed minimal (tanpa data pengguna).
- [x] Runner `db:migrate` idempotent untuk container init.

**Selesai bila:** migrasi bersih pada DB kosong dan idempotent saat diulang; insert ke tanggal acak masuk partisi benar.
**Ref:** ARCH §6.1, §11.2; D-06.

### P4.4 — Pemeliharaan partisi & retensi

- [x] Fungsi `ensure_check_results_partitions(months_ahead)` (idempotent).
- [x] Fungsi/procedure drop partisi lebih tua dari `CHECK_RETENTION_DAYS` (D-23) dan pembersihan rollup lama.
- [x] Dipanggil oleh job maintenance (F9.5).

**Selesai bila:** uji integrasi: partisi baru terbentuk; partisi usang ter-drop; data aktif aman.

### P4.5 — Repository (driven adapters)

**Membangun:** implementasi port berbasis Drizzle.

- [x] `UserRepository`, `SessionRepository` (cari via hash token, hapus kedaluwarsa).
- [x] `MonitorRepository`: CRUD, update OCC `WHERE id AND version` (0 baris → `ConflictException`), `lockForUpdate(id)`, `claimDue(limit, tx)` (`FOR UPDATE SKIP LOCKED`), filter status/search + cursor.
- [x] `IncidentRepository`: simpan/resolve, ambil insiden terbuka, filter, detail.
- [x] `CheckResultRepository`: insert ke tabel partisi, daftar cursor (UUIDv7/waktu), stream cursor DB untuk CSV, sparkline 20 titik terakhir, recent feed.
- [x] `NotificationConfigRepository`, `NotificationDeliveryRepository` (PENDING→SENT/FAILED, retry_count).
- [x] `HeartbeatRepository` untuk `worker_heartbeats`.
- [x] Mapper baris ↔ entity domain.

**Selesai bila:** tiap repository diuji integrasi.
**Ref:** ARCH §4.2, §6.3.

### P4.6 — DrizzleUnitOfWorkAdapter

**Membangun:** transaksi tunggal untuk hasil probe + state + insiden + enqueue (tanpa dual-write).

- [x] Transaksi `READ COMMITTED`; repository & `QueuePort` terikat ke `tx` yang sama.
- [x] `QueuePort.send(..., tx)` memakai `fromDrizzle(tx, sql)` (D-01); cek return `null` (D-02).
- [x] `NOTIFY` dikeluarkan di dalam transaksi (terkirim saat commit).
- [x] Rollback penuh bila ada error (tidak ada ghost incident/orphan result).

**Selesai bila:** uji integrasi: kegagalan di tengah → tidak ada baris check/insiden/job; sukses → semua ada atomik.
**Ref:** ARCH §1.1.2, §6.3.A.

### P4.7 — Query metrik SQL & rollup

- [x] Query bucket 24 jam (`date_bin` 5 menit, `percentile_cont` p95/p99) sesuai ARCH §6.2; filter hanya `SCHEDULED`.
- [x] Query 7 hari/30 hari dari `monitor_metrics_hourly` (sub-100 ms).
- [x] Upsert rollup per jam (idempotent, aman diulang).
- [x] Kebijakan latency: definisikan apakah latency kegagalan terukur ikut dihitung (PRD §4.12 mengizinkan, harus dibedakan); dokumentasikan.
- [x] `total_checks = 0` → N/A (bukan 100%).

**Selesai bila:** hasil agregasi cocok dengan perhitungan referensi di tes.
**Ref:** ARCH §6.2, §6.4.B, PRD §4.11/§4.12.

### P4.8 — Uji integrasi database (Testcontainers)

- [x] Rollback atomik UoW.
- [x] Dua koneksi bersamaan pada `claimDue` tidak mengambil baris yang sama.
- [x] `uq_incidents_one_open` menolak insiden terbuka kedua.
- [x] `uq_single_owner_guard` menolak user kedua.
- [x] OCC mendeteksi update konkuren → 409.
- [x] Routing partisi, pagination cursor stabil.

**Selesai bila:** semua lulus di CI; cakupan infra ≥ 80%.
**Ref:** ARCH §13, PRD §5.2.

---

## Fase 5 — Infra: Layanan Pendukung

### P5.1 — UUIDv7 generator & SystemClock

- [x] `UuidV7GeneratorAdapter` (monoton, urut waktu); `SystemClockAdapter` (dapat diganti saat tes).

### P5.2 — LibsodiumAeadCipherAdapter

**Membangun:** enkripsi rahasia XChaCha20-Poly1305-IETF dengan AAD.

- [x] Parse `APP_KEYRING` (`activeKeyId`, `keys`); inisialisasi `libsodium-wrappers-sumo` (`await sodium.ready`).
- [x] `encrypt(plaintext, {monitorId|configId, fieldName})` → `v1:<keyId>:<hexNonce>:<hexCt>` dengan nonce acak 24 byte; AAD `monitorId:<id>:field:<name>` (token Telegram: D-21).
- [x] `decrypt` membaca `keyId` dari prefix; error jelas untuk kunci tidak ada / MAC salah / AAD tidak cocok.
- [x] Skrip `secrets:reencrypt` (k_lama → k_aktif) untuk prosedur rotasi (ARCH §11.4 langkah 4), idempotent dan dapat dilanjutkan.
- [x] Bersihkan buffer kunci dari log; tidak pernah mencetak plaintext.

**Selesai bila:** uji: roundtrip, tukar ciphertext antar monitor/kolom → gagal, rotasi kunci, format salah.
**Ref:** ARCH §5.2, §11.4, ADR 003.

### P5.3 — NodeArgon2HasherAdapter

- [x] Hash/verify Argon2id (`@node-rs/argon2`) dengan parameter terdokumentasi.
- [x] `verifyDummy()` terhadap hash konstan agar waktu login username tak dikenal setara (anti user enumeration).

**Selesai bila:** uji timing kasar: selisih jalur sukses/gagal tidak signifikan.
**Ref:** ARCH §5.3.

### P5.4 — PinoLoggerAdapter + redaksi

- [x] Logger JSON (pino v10) dengan field `monitorId`, `checkId`, `incidentId`, `correlationId`.
- [x] Redaksi regex `/bot\d+:[A-Za-z0-9_-]+/`, header `Authorization`, `Proxy-Authorization`, `X-Api-Key`, field kredensial pada payload; serializer `err` aman.
- [x] Level dari `LOG_LEVEL`.

**Selesai bila:** unit test: token Telegram & auth header tidak pernah muncul dalam output.
**Ref:** ARCH §1.1.3, §13; PRD §4.20.

### P5.5 — PostgresRateLimiterAdapter

- [x] Sliding-window pada tabel `rate_limits` (upsert atomik, `expire_at`).
- [x] Tier 1: 5 login gagal / 15 menit per IP (`ip:login`) dan per username (`user:login`).
- [x] Tier 2: 1 check / 10 dtk per monitor ID dan 20 check / menit per user.
- [x] Tier 3: 120 request / menit per user.
- [x] Hitung `retryAfterSeconds` → `RateLimitExceededException`.

**Selesai bila:** uji konkurensi: tidak ada lolos melebihi batas; kedaluwarsa benar.
**Ref:** ARCH §5.3.5.

### P5.6 — PgListenNotifyAdapter (PubSubPort)

- [x] Publisher `NOTIFY sentinel_events, payload` (validasi < 8.000 byte).
- [x] Subscriber `pg.Client` khusus `LISTEN sentinel_events` dengan reconnect eksponensial dan hook `onReconnect`.

**Selesai bila:** uji integrasi: event diterima; setelah koneksi diputus, subscriber pulih dan memicu callback resync.
**Ref:** ARCH §7.2.

---

## Fase 6 — Infra: Probe Jaringan SSRF-Safe

> Probe TIDAK memakai `fetch` Bun/Undici; memakai `node:http`/`node:https` dengan custom agent.

### P6.1 — Request builder

- [x] Rakit method, header, body, auth (Bearer, Basic, API Key via header, Custom Header) dari rahasia hasil dekripsi (hanya jalur internal).
- [x] Terapkan deny-list header; abaikan `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`.
- [x] Tidak meneruskan kredensial internal aplikasi ke target.

**Ref:** ARCH §5.1.B, PRD §4.5/§4.6.

### P6.2 — Resolver DNS & validasi multi-record

- [x] Jika hostname IP literal → `net.isIP` + `NetworkPolicy`.
- [x] Jika domain → `dns.promises.resolve4/resolve6` (semua record, `{ all: true }`); tolak bila SALAH SATU IP terblokir.
- [x] Normalisasi IPv4-mapped / NAT64 / 6to4 sebelum validasi.
- [x] Durasi DNS dicatat terpisah dari latency (ARCH §5.1.B).

**Ref:** ARCH §5.1, ADR 002.

### P6.3 — Agent socket IP-pinning

- [x] Custom `lookup` mengembalikan IP tervalidasi; socket TCP langsung ke IP numerik.
- [x] Pertahankan header `Host` dan TLS SNI (`servername`) sesuai domain asli → anti DNS rebinding TOCTOU.
- [x] Timeout: connect 5.000 ms, headers 5.000 ms, total `timeoutMs` via `AbortSignal.timeout()`; batalkan operasi jaringan saat timeout.
- [x] Redirect dinonaktifkan; respons 3xx → kategori `REDIRECT_NOT_ALLOWED` (D-14).
- [x] Ukur latency dari awal koneksi socket hingga header+body selesai.

**Ref:** ARCH §5.1, PRD §4.5/§4.8.

### P6.4 — Penanganan respons

- [x] Batas body 2 MB dihitung pada stream SETELAH dekompresi (gzip/deflate/br bomb guard) → `RESPONSE_SIZE_EXCEEDED`, stream diputus.
- [x] Bila monitor tidak butuh evaluasi body JSON, `destroy()` stream setelah header diterima.
- [x] Simpan response headers + cuplikan body ≤ 5 KB (tersanitasi) ke `diagnostics`; simpan `pinned_ip`.

**Ref:** ARCH §5.1.B, DES §5.5.

### P6.5 — Klasifikasi error ke `FailureCategory`

- [x] Pemetaan: DNS gagal, `ECONNREFUSED`, timeout koneksi, kegagalan TLS, status tidak sesuai, ukuran melebihi batas, abort eksekusi, SSRF diblokir, redirect.
- [x] Pesan diagnostik aman (tanpa rahasia).

**Ref:** PRD §4.5 daftar kegagalan, US 20.

### P6.6 — `NodeHttpSsrfProbeAdapter` (rangkaian)

- [x] Implementasi `NetworkProbePort` menggabungkan P6.1–P6.5, menghasilkan `ProbeOutcome` (status, headers, body stream/teks terbatas, latency, kategori).
- [x] Orkestrasi pada application: probe → `AssertionEngine` → `CheckResult` (PRD §4.5 langkah 9–10).

### P6.7 — Pengujian keamanan SSRF (cakupan 100%)

- [x] Tiap CIDR terblokir (termasuk `169.254.169.254`, `fd00:ec2::254`).
- [x] Multi-record A/AAAA dengan satu IP privat → tolak.
- [x] Simulasi DNS rebinding (mock DNS yang menukar IP) tidak dapat menembus karena IP dipin.
- [x] Literal numerik desimal/hex/octal; IPv4-mapped; NAT64; 6to4.
- [x] Userinfo ditolak; skema non-http ditolak; proxy env diabaikan.
- [x] Redirect, timeout, body besar, gzip bomb, kegagalan TLS.
- [x] Verifikasi metode, header, body, dan keempat metode auth tiba benar di server uji.

**Selesai bila:** seluruh skenario lulus; cakupan SSRF guard 100%.
**Ref:** ARCH §13, PRD §5.3.

---

## Fase 7 — Slice Identity & Access

### P7.1 — Handler error global RFC 9457

- [x] Plugin Nitro `server/plugins/error-handler.ts` (ARCH §9.1.B): petakan `DomainException` → status, `application/problem+json`, `Retry-After` untuk 429, `invalidParams` untuk validasi.
- [x] Error tak terduga → 500 generik, stack trace hanya di non-production, log via logger tersanitasi.

**Selesai bila:** uji tiap tipe exception menghasilkan payload sesuai contoh ARCH §9.1.C.

### P7.2 — Composition root web

- [x] `server/utils/container.ts`: rakit pool, adapter, repository, use case (singleton per proses).
- [x] Validasi env saat boot (P1.7).

### P7.3 — Use case autentikasi

- [x] `AuthenticateUserUseCase`: validasi input, cari user, verifikasi Argon2id; jalur username tak dikenal tetap menjalankan hash dummy; pesan generik `"Kredensial tidak valid"`; terapkan rate limit Tier 1.
- [x] Token acak 256-bit (`crypto.randomBytes(32)`); simpan `SHA-256(token)` (opsional HMAC dengan pepper D-20), IP & user-agent.
- [x] `ValidateSessionUseCase`: idle TTL 24 jam (sliding), absolute TTL 7 hari.
- [x] `RevokeSessionUseCase`; `ChangeOwnerPasswordUseCase` (D-09, cabut sesi lain).

**Selesai bila:** unit test dengan fake; edge case: sesi kedaluwarsa idle & absolut.
**Ref:** ARCH §5.3, PRD §4.3, US 1–3.

### P7.4 — CLI pembuatan akun pemilik

- [x] `bun run owner:create` (D-08): input username/password (atau env), hash Argon2id, tolak jika user sudah ada, pesan jelas.
- [ ] Dokumentasikan di README (F18).

**Selesai bila:** uji integrasi: user kedua ditolak oleh `uq_single_owner_guard`.

### P7.5 — Middleware Nitro

- [x] Security headers: CSP ketat yang kompatibel Nuxt/Nuxt UI, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- [x] CSRF: validasi `Origin` & `Host` untuk `POST/PATCH/PUT/DELETE` dan handshake WebSocket.
- [x] Ekstraksi IP client via `X-Forwarded-For` hanya dari `TRUSTED_PROXIES` (CIDR).
- [x] Middleware sesi: cookie → `ValidateSession`, perpanjang idle window; endpoint publik dikecualikan (`/api/auth/login`, `/healthz`, `/readyz`, `/metrics` sesuai kebijakan).
- [x] Rate limit Tier 3 (120/menit/user).

**Ref:** ARCH §5.3.5–6, PRD §4.3.

### P7.6 — Endpoint autentikasi

- [x] `POST /api/auth/login` (set cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` otomatis di HTTPS), `POST /api/auth/logout` (hapus sesi + cookie), `GET /api/auth/me`.
- [x] `PUT /api/settings/account/password` (D-09).

**Selesai bila:** uji API: 401 tanpa sesi, atribut cookie benar, 429 + `Retry-After` setelah 5 gagal, tidak ada pembedaan username/password salah.
**Ref:** PRD §5.2/§5.6 (poin 11).

---

## Fase 8 — Slice Manajemen Monitor

### P8.1 — Create & Update monitor

- [x] Skema Zod: nama ≤ 100, URL (skema + SSRF pre-check), method, header (deny-list), body, auth, assertion ≤ 10, interval, timeout.
- [x] Enkripsi `encryptedHeaders`, `encryptedBody`, `encryptedAuthConfig` dengan AAD `monitorId:field:<name>`; hitung `headerKeys`.
- [x] Monitor baru: aktif, `UNKNOWN`, `nextRunAt` dihitung dari aktivasi + interval.
- [x] Update: OCC (`version`); hanya re-enkripsi bila nilai berubah; placeholder rahasia ter-mask tidak menimpa nilai tersimpan.
- [x] Validasi gagal → tidak ada penyimpanan, 400 dengan `invalidParams`.

**Ref:** PRD §4.4, ARCH §6.3.B, US 4–11, 13.

### P8.2 — Pause, Resume, Delete

- [x] `PauseMonitorUseCase`: `PAUSED`; insiden terbuka tetap terbuka; batalkan job terjadwal.
- [x] `ResumeMonitorUseCase`: `UNKNOWN`, `nextRunAt = now`.
- [x] `DeleteMonitorUseCase` (D-17): hard delete + cascade, batalkan job pg-boss, tidak ada job yatim.

**Ref:** PRD §4.4, ARCH §3.2.

### P8.3 — Query monitor

- [x] `GET /api/monitors`: filter status, pencarian nama/URL, cursor, `sparkline` 20 titik (D-19).
- [x] `GET /api/monitors/:id`: konfigurasi tersanitasi (hanya `headerKeys`, `authType`, tanpa nilai rahasia).

**Ref:** US 14, ARCH §9.3.

### P8.4 — Handler REST monitor

- [x] `POST /api/monitors`, `PATCH /api/monitors/:id`, `DELETE /api/monitors/:id`, `POST /api/monitors/:id/pause`, `POST /api/monitors/:id/resume`.
- [x] Validasi Zod di server; kode status sesuai PRD §4.19 (400/401/403/404/409/429/500).

### P8.5 — Pengujian slice

- [x] Integrasi: CRUD, jeda/lanjut/hapus, 409 pada update konkuren, 11 aturan ditolak, URL privat ditolak (SSRF di create).
- [x] Sweep kebocoran: tidak ada nilai rahasia pada respons, log, CSV (uji dengan nilai rahasia unik).
- [x] Penolakan tanpa autentikasi pada semua endpoint.

**Ref:** PRD §5.2.

---

## Fase 9 — Worker, Scheduler, Pipeline Pemeriksaan

### P9.1 — Bootstrap worker

- [x] `apps/worker/src/index.ts`: env, container, start pg-boss (skema `pgboss`, hak `CREATE`), `createQueue` untuk `probe:check` (`stately`), `notification:send` (`stately`), antrean maintenance, dan DLQ.
- [x] Graceful shutdown (SIGTERM/SIGINT): berhenti mengambil job, tunggu job aktif, tutup pool.
- [x] Heartbeat setiap 15 dtk ke `worker_heartbeats` dan gauge metrik.
- [x] HTTP listener mandiri `node:http` port `WORKER_PORT` (3001) untuk `/healthz` dan `/metrics`.
- [x] Jalankan via `node --import tsx src/index.ts`.

**Ref:** ARCH §7.1, §9.5.C, §11.1; PRD §4.2.B/§4.20.

### P9.2 — Scheduler loop

- [x] Setiap 5 dtk: transaksi `SELECT ... WHERE is_active AND next_run_at <= NOW() FOR UPDATE SKIP LOCKED LIMIT 50`.
- [x] Hitung `next_run_at = NOW() + interval ± 5% jitter` (tanpa catch-up beruntun pasca-downtime; PRD §4.9).
- [x] Enqueue `probe:check` dalam transaksi yang sama (`singletonKey = monitorId`, adapter `fromDrizzle`), sisipkan `__traceparent`, cek `null`.
- [x] Bila pemeriksaan sebelumnya belum selesai → tidak menumpuk (dedupe policy).

**Ref:** ARCH §7.1.A, PRD §4.9, US 15.

### P9.3 — Konsumen probe (`ExecuteScheduledCheckUseCase`)

- [x] Konkurensi 20; re-verifikasi monitor masih ada & aktif.
- [x] Jalankan probe (F6) + AssertionEngine di luar transaksi DB.
- [x] UoW tunggal: `SELECT ... FOR UPDATE` monitor → insert `CheckResult` → `recordCheckFailure/Success` → buat/update/resolve `incidents` → insert `notification_deliveries` `PENDING` → `boss.send('notification:send', ..., singletonKey incidentId:type)` → `NOTIFY` → commit.
- [x] Ketahanan: kegagalan downstream (SSRF, timeout, Telegram) tidak membatalkan simpan hasil; kegagalan DB tidak menandai sukses.
- [x] Hitung `sentinel_worker_job_lag_seconds`.


**Ref:** ARCH §6.3.A, §7.1.B, PRD §4.10/§4.14, US 16, 21–25.

### P9.4 — Pemeriksaan manual & dry-run

- [x] `POST /api/monitors/:id/check`: rate limit Tier 2, enqueue prioritas, respons `202` + `checkId`; klien polling lewat riwayat (PRD §4.19).
- [x] `ExecuteManualCheckUseCase`: simpan hasil `trigger_type = MANUAL`, TIDAK mengubah counter/insiden/jadwal (D-13); batas konkurensi & timeout.
- [x] `POST /api/monitors/test` (D-10): jalankan konfigurasi yang belum disimpan, kembalikan ringkasan (status, latency, checklist assertion), tidak menyimpan.

**Ref:** US 12, ARCH §5.3.5 Tier 2, DES §5.4.

### P9.5 — Job maintenance (cron pg-boss)

- [x] Cleanup `rate_limits` kedaluwarsa (per jam).
- [x] Cleanup `sessions` kedaluwarsa.
- [x] Rollup `monitor_metrics_hourly` (idempotent).
- [x] Pemeliharaan partisi + retensi (F4.4).
- [x] Deteksi job macet/backlog (log + metrik).

**Ref:** ARCH §5.3.5, §6.4.B; D-06, D-07.

### P9.6 — Pengujian worker & scheduler

- [x] Monitor jatuh tempo dijalankan; yang dijeda tidak.
- [x] Worker hidup kembali menemukan pekerjaan tertinggal tanpa lonjakan.
- [x] Dua worker tidak mengambil pekerjaan sama.
- [x] Request lambat tidak menumpuk pekerjaan.
- [x] Timeout dicatat sebagai kegagalan.
- [x] Gangguan DB tidak menghilangkan pekerjaan secara diam-diam.
- [x] Manual check tidak merusak jadwal.

**Ref:** PRD §5.4.

---

## Fase 10 — Insiden & Notifikasi Telegram

### P10.1 — Query & endpoint insiden

- [x] `GET /api/incidents` (terbuka/terselesaikan, filter, cursor) dan `GET /api/incidents/:id` (riwayat kegagalan, penyebab, ringkasan notifikasi `[DISPATCHED: n]`).
- [x] DTO: waktu mulai/pulih, durasi, penyebab utama, status `OPEN/RECOVERING/RESOLVED` turunan.

**Ref:** US 24, 25; DES §5.6.


### P10.2 — TelegramBotNotificationAdapter

- [x] Kirim via Bot API (`TELEGRAM_API_BASE_URL` dapat diganti untuk mock).
- [x] Escaper MarkdownV2 (nama monitor & error disanitasi); templat pesan "INSIDEN TERBUKA" dan "INSIDEN DIPULIHKAN" (PRD §4.15).
- [x] Tangani 429 + `retry_after`; timeout request; ringkasan error aman (tanpa token).

**Ref:** ARCH §4.2, §7.1.C.


### P10.3 — `DispatchNotificationUseCase`

- [x] Ambil konfigurasi aktif, dekripsi token (AAD D-21), bentuk pesan dari data insiden.
- [x] Sukses → `SENT` + `last_attempt_at`; gagal → `FAILED`, `retry_count++`, `safe_error_summary`.
- [x] Retry dengan batas & backoff (konfigurasi pg-boss `retryLimit`, `retryBackoff`); 429 memakai `retry_after`.
- [x] Deduplikasi (`singletonKey incidentId:type`); kegagalan berulang dalam insiden yang sama tidak membuat notifikasi baru (US 29).
- [x] Konfigurasi belum ada/nonaktif → status gagal aman, tidak mengubah hasil pemeriksaan.

**Ref:** PRD §4.15, US 28–29.

### P10.4 — Endpoint pengaturan Telegram

- [x] `GET /api/settings/telegram` (status tanpa token), `PUT` (simpan terenkripsi, validasi token & chat ID), `POST /api/settings/telegram/test` (ping uji).
- [x] Token tidak pernah dikembalikan/di-log.

**Ref:** US 26, 27; ARCH §9.3.

### P10.5 — Pengujian notifikasi

- [x] Pembukaan → tepat satu event; pemulihan → tepat satu event; kegagalan berulang tidak menghasilkan event baru.
- [x] Gangguan Telegram tidak mengubah hasil pemeriksaan; retry berbatas.
- [x] Token bot tidak muncul di log/respons.
- [x] Gunakan API Telegram tiruan; satu pengujian integrasi manual ke bot nyata terdokumentasi.

**Ref:** PRD §5.5.

---

## Fase 11 — Riwayat, Metrik, dan Ekspor

### P11.1 — Riwayat pemeriksaan

- [x] `GET /api/monitors/:id/checks`: cursor, filter rentang waktu, tampil label `MANUAL`.
- [x] Detail check untuk drawer inspeksi (diagnostics tersanitasi).
- [x] `GET /api/checks/recent?limit=10` (feed dashboard, D-19).

**Ref:** US 16, 17, 20.

### P11.2 — Metrik uptime & latency

- [x] `GET /api/monitors/:id/metrics` (24h/7d/30d; uptime %, avg, p95, p99; N/A saat kosong).
- [x] `GET /api/metrics/summary` (total monitor, breakdown UP/DEGRADED/DOWN/PAUSED/UNKNOWN, insiden terbuka, uptime, latency, kegagalan terbaru).
- [x] `GET /api/metrics/latency?range=` untuk grafik komposit (D-19).
- [x] Waktu dihitung UTC, ditampilkan sesuai zona pengguna.

**Ref:** US 18, 19; PRD §4.11/§4.12/§4.16.

### P11.3 — Ekspor CSV

- [x] `GET /api/reports/export.csv?type=checks|incidents&monitorId&from&to` (D-18), streaming cursor DB (tanpa memuat seluruh data).
- [x] `sanitizeCsvValue` persis ARCH §5.4 (prefix `'` untuk `= + - @ \t \r`; kolom numerik tidak diberi prefix; kutip RFC 4180).
- [x] Kolom: waktu, nama monitor, hasil, status HTTP, latency, kategori kegagalan, mulai/pulih insiden; header `Content-Disposition`.
- [x] Tidak ada password/token/API key/header auth/kunci enkripsi.

**Selesai bila:** uji formula injection, quoting, backpressure data besar, tanpa rahasia.
**Ref:** US 30, PRD §4.17.

---

## Fase 12 — Real-Time

### P12.1 — Emisi event dari worker

- [x] Dalam UoW: `NOTIFY` `CHECK_COMPLETED` (monitorId, status, durationMs, executedAt) dan `INCIDENT_TRANSITION` (OPENED/RECOVERED).

### P12.2 — Plugin LISTEN di web

- [x] Plugin Nitro `server/plugins` membuka satu `pg.Client`, `LISTEN sentinel_events`, reconnect dengan backoff.
- [x] Broadcast ke peer WebSocket (crossws pub/sub).

### P12.3 — Handler WebSocket `/api/ws`

- [x] Aktifkan `nitro.experimental.websocket` (Nitro v2 pada Nuxt 4; bila Nitro v3 gunakan `features.websocket`) dan `defineWebSocketHandler`.
- [x] Hook `upgrade`: validasi cookie sesi + `Origin`.
- [x] Pesan klien `{ action: "subscribe", monitorId }`; broadcast sesuai kontrak ARCH §9.4; ping/pong.

### P12.4 — Klien WebSocket (composable)

- [x] `useSentinelSocket`: status `LIVE` / `SYNCING` / `DISCONNECTED`, reconnect eksponensial, subscribe ulang.
- [x] Saat reconnect berhasil → `queryClient.invalidateQueries()` (resync ARCH §7.2.4).
- [x] Event memperbarui cache TanStack Query dan memicu kedip baris 500 ms.

### P12.5 — Pengujian real-time

- [x] Integrasi: NOTIFY → WS peer menerima; WS tanpa sesi ditolak; Origin salah ditolak.
- [x] Putus koneksi LISTEN/WS → resync benar, tanpa data basi.

**Ref:** ARCH §7.2, §9.4.

---

## Fase 13 — Observabilitas

### P13.1 — OpenTelemetry

- [x] `@opentelemetry/sdk-node` di web & worker; ekspor OTLP HTTP ke Jaeger.
- [x] Propagasi W3C `traceparent` lewat payload job (`__traceparent`).
- [x] Span: `queue.wait_duration`, `probe.dns_lookup`, `probe.tcp_connect`, `probe.tls_handshake`, `probe.response_transfer`, `assertion.evaluation`, `db.transaction.save`, `notification.telegram_send`.

**Ref:** ARCH §9.5.A.

### P13.2 — Metrik Prometheus

- [x] `/metrics` di web & worker: `sentinel_probe_duration_ms` (bucket 50…10000), `sentinel_probe_total`, `sentinel_incidents_active`, `sentinel_worker_job_lag_seconds`, `sentinel_worker_heartbeat_timestamp`.
- [x] Perhatikan kardinalitas label `monitor_id`.

**Ref:** ARCH §9.5.B.

### P13.3 — Health endpoints

- [x] Web: `/healthz` (liveness), `/readyz` (cek koneksi DB); worker: `/healthz`.
- [x] Tangani DB mati tanpa mengklaim data tersimpan (PRD §4.20).

### P13.4 — Aturan alert

- [x] File rules Prometheus `SentinelWorkerDown` (`> 60` dtk, `for: 1m`) dan `SentinelHighJobLag` (`> 30`, `for: 2m`); daftarkan di `prometheus.yml`.

### P13.5 — Verifikasi di dev

- [x] Waterfall trace tampil di Jaeger (`:16686`); metrik tampil di Prometheus (`:9090`); matikan worker → alert menyala.

---

## Fase 14 — Frontend: Fondasi & Komponen Bersama

### P14.1 — Konfigurasi Nuxt & Tailwind v4

- [x] `nuxt.config.ts` ARCH §8.1: `compatibilityVersion: 4`, modul `@nuxt/ui`, `routeRules` (`/login` SSR, `/dashboard/**` SPA, `/api/**` tanpa CORS), Nitro `node-server` + WebSocket, `build.transpile` paket `@sentinel/*`.
- [x] Pasang peer chart sesuai Nuxt UI v4.12 (D-05); fallback `@unovis/vue` hanya untuk korelasi lanjutan.
- [x] `main.css`: `@theme` semua token DES §3 (dark default + light cream), font Geist Mono → JetBrains Mono → IBM Plex Mono.

### P14.2 — Override komponen Nuxt UI

- [x] `app.config.ts` (D-22): tombol/input/badge/tabel/kartu bergaya terminal (font mono, `rounded-xs`, tanpa shadow, hairline 1px) memakai token semantik, bukan warna hardcode.

### P14.3 — `app.vue`, tema, mode warna

- [x] Bungkus `UApp`; Nuxt ColorMode dengan default dark dan opsi light; tombol `[THEME]`.

### P14.4 — TanStack Query & klien API

- [x] Plugin `app/plugins/vue-query.ts` (ARCH §8.2: `staleTime 10s`, `refetchOnWindowFocus`, `retry 1`).
- [x] Wrapper `$fetch` yang mengurai RFC 9457 menjadi error terstruktur; semua tipe dari `@sentinel/contracts`.
- [x] Composable query/mutation per resource (monitors, checks, incidents, metrics, settings).

### P14.5 — Komponen bersama

- [x] `StatusBadge` (5 status, `aria-label` jelas), `MetricTile`, `BracketButton`, `WsIndicator`, `ProblemAlert`, `EmptyState` (border dashed), `DestructiveConfirmModal` (ketik nama monitor), `SkeletonRows/Tiles`, `UtcTime/RelativeTime`, `CopyButton`, `Sparkline` (SVG), `LatencyChart` (`<UChart>`), `JsonViewer` (highlight), `HttpMethodBadge`.

### P14.6 — Layout & navigasi

- [x] Topbar 48 px: `[SENTINEL_]` dengan kursor berkedip, tab `[01: OVERVIEW]…[04: SETTINGS]`, `WsIndicator`, `[Ctrl+K]`, `[THEME]`, `[LOGOUT]`; breadcrumb.
- [x] `UCommandPalette` (Ctrl+K) untuk navigasi cepat.
- [x] Middleware rute: redirect ke `/login` bila tidak ada sesi; layout `login` terpisah.

**Ref:** DES §2, §3, §4, §6; ARCH §8.

---

## Fase 15 — Frontend: Layar

### P15.1 — `/login`

- [x] Kartu 380 px, `[SENTINEL::AUTH_GATE]`, field username & password (toggle visibilitas), `[ENTER SYSTEM]` (disabled saat submitting), `ProblemAlert` untuk error.

**Ref:** DES §5.1, US 1.

### P15.2 — `/dashboard` (Overview)

- [x] 4 `MetricTile`: uptime 24h/7d, rata-rata latency, insiden aktif, total monitor (menampilkan N/A, bukan 0/100%).
- [x] Grafik latency komposit (`<UChart>`) dengan tombol `[24H] [7D] [30D]`.
- [x] Feed 10 pemeriksaan terakhir real-time via WS.

**Ref:** DES §5.2, PRD §4.16.

### P15.3 — `/dashboard/monitors`

- [x] Filter pencarian + dropdown status; `[+ TAMBAH MONITOR BARU]`.
- [x] `UTable` 7 kolom (status, metode, nama+URL+salin, sparkline, uptime/latency, waktu cek terakhir, aksi).
- [x] Menu aksi: `[RUN PROBE NOW]`, `[PAUSE / RESUME]` (konfirmasi bila insiden terbuka: tetap unresolved), `[EDIT CONFIGURATION]`, `[DELETE MONITOR]`.

**Ref:** DES §5.3, US 13, 14.

### P15.4 — Form monitor (`/new` & `[id]/edit`)

- [x] `UTabs`: `[01: TARGET & SCHEDULE]`, `[02: HEADERS & AUTHENTICATION]`, `[03: RESPONSE ASSERTIONS]`.
- [x] Tab 01: nama, metode, URL, interval (1m…24h), timeout.
- [x] Tab 02: tipe auth, rahasia ter-mask + label Zero-Leak, builder header key-value, body JSON (POST/PUT/PATCH).
- [x] Tab 03: status diharapkan (sesuai D-15), assertion header, builder JSONPath + operator + nilai; validasi inline maks 10 aturan.
- [x] Footer lengket: `[> RUN TEST PROBE SEKARANG]` (modal hasil), `[BATAL]`, `[SIMPAN & AKTIFKAN MONITOR]`; validasi Zod; `version` OCC; tangani 409 (minta muat ulang).

**Ref:** DES §5.4, US 4–11.

### P15.5 — `/dashboard/monitors/[id]`

- [x] Banner (nama, URL, status, `[PAUSE] [EDIT] [TRIGGER MANUAL CHECK]`).
- [x] 3 kartu agregasi (24h, 7d, 30d: uptime + avg/P95/P99).
- [x] `<UChart>` hijau untuk sukses, titik merah untuk gagal, tooltip monospaced.
- [x] `UTable` riwayat + `[INSPECT]` → `USlideover` 480 px: kategori kegagalan, IP pinning, request/response headers (tersanitasi), cuplikan body ≤ 5 KB, checklist `[PASS]/[FAIL]` dengan alasan.

**Ref:** DES §5.5, US 16–20.

### P15.6 — `/dashboard/incidents`

- [x] Banner insiden aktif: border rose 2 px, stopwatch `DOWNTIME: hh:mm:ss`, penghitung kegagalan beruntun.
- [x] Tabel arsip: ID, monitor, mulai, pulih, durasi, penyebab, status notifikasi; badge `OPEN/RECOVERING/RESOLVED`.

**Ref:** DES §5.6, US 21–25.

### P15.7 — `/dashboard/settings`

- [x] Telegram: token ter-mask, chat ID, `[TEST PING BOT]` + toast, keterangan kebijakan zero-spam.
- [x] Ubah password pemilik (verifikasi password lama).
- [x] Ekspor: `[DOWNLOAD CSV RIWAYAT PEMERIKSAAN]` & `[DOWNLOAD CSV RIWAYAT INSIDEN]` (dengan filter monitor/rentang waktu).

**Ref:** DES §5.7, US 26–30.

---

## Fase 16 — Kualitas UX

### P16.1 — Kelengkapan 6 state

- [x] Untuk SETIAP halaman/komponen data: Loading (skeleton), Empty (dashed + CTA), Live/Success (`[● LIVE]`, kedip 500 ms), Stale/Offline (`(STALE DATA)` + `[RECONNECT]`), Error RFC 9457 (`ProblemAlert` + `[COBA LAGI]`), Destructive Confirm (ketik nama).

**Ref:** DES §7.

### P16.2 — Aksesibilitas WCAG 2.2 AA

- [x] Kontras sesuai tabel DES §8 (verifikasi dark & light).
- [x] Operasi keyboard penuh (tab bar dengan panah, fokus `outline 1px #a1a1aa`, tanpa jebakan, fokus kembali saat modal/drawer ditutup).
- [x] `aria-label` badge, `aria-live="polite"` untuk transisi insiden; target sentuh ≥ 36 px (44×44 px pada mobile).

**Ref:** DES §8.

### P16.3 — Responsif

- [x] `>1440` (container 1440), `1024–1439`, `768–1023` (grid 2×2, sembunyikan sparkline), `<768` (menu dropdown, tabel → card list, drawer `100vw`).

**Ref:** DES §9.

### P16.4 — Checklist verifikasi frontend

- [x] Jalankan seluruh daftar DES §10: stack, zero hardcoded colors, zero-leak UI, kontrak `@sentinel/contracts`, WebSocket fallback, aksesibilitas, E2E.

---

## Fase 17 — Suite Pengujian Lintas Lapisan

### P17.1 — Unit (domain & application ≥ 90%)

- [x] AssertionEngine, state machine monitor, insiden 3×/2×, reset penghitung, uptime/latency, sanitasi CSV, redaksi logger, kredensial dalam diagnostik.

**Ref:** PRD §5.1, ARCH §13.

### P17.2 — Keamanan

- [x] SSRF 100% (P6.7), tidak ada kebocoran rahasia (respons/log/CSV), CSRF (Origin salah → ditolak), timing login, rate limit tiap tier, cookie flags, security headers, penolakan tanpa sesi.

### P17.3 — Integrasi (infra ≥ 80%)

- [x] Transaksi & rollback, `FOR UPDATE SKIP LOCKED`, siklus pg-boss, enkripsi AAD mismatch, pagination & filter waktu, monitor jatuh tempo, eksekusi ganda dicegah.

### P17.4 — End-to-End (Playwright)

Dengan server target lokal yang dapat dikendalikan (OK/gagal/lambat) dan Telegram tiruan:

- [x] 1. Login (cookie `HttpOnly`).
- [x] 2. Buat monitor.
- [x] 3. Atur autentikasi & assertion.
- [x] 4. Jalankan pemeriksaan manual.
- [x] 5. Lihat hasil & riwayat.
- [x] 6. Lihat grafik uptime & latency.
- [x] 7. Simulasikan kegagalan → insiden terbuka.
- [x] 8. Simulasikan pemulihan → insiden tertutup.
- [x] 9. Atur Telegram & uji pengiriman (mock).
- [x] 10. Ekspor CSV.
- [x] 11. Halaman/endpoint terlindungi menolak akses tanpa sesi.

**Ref:** PRD §5.6.

### P17.5 — Gerbang CI

- [x] Gagalkan build bila cakupan di bawah ambang, boundary dilanggar, atau E2E gagal; simpan artefak laporan/trace Playwright.

---

## Fase 18 — Deployment, Dokumentasi, Rilis

### P18.1 — Dockerfile multi-stage

- [ ] Perbaiki `bun.lock` (D-04); stage `base`, `dependencies`, `build-web`, `web-runner`, `worker-runner`.
- [ ] Jalankan sebagai user non-root; pin tag image; verifikasi modul native (`@node-rs/argon2`, libsodium) berjalan di `node:24-alpine`.
- [ ] Verifikasi worker mengakses `packages/*` yang dibutuhkan runtime `tsx`.

**Ref:** ARCH §11.1.

### P18.2 — Docker Compose produksi

- [ ] Layanan `postgres` (healthcheck), `db-migrate` (init), `web` (3000), `worker` (3001); `depends_on` dengan `service_completed_successfully`.
- [ ] Env sensitif via variabel/secret, bukan di-commit.

**Ref:** ARCH §11.2.

### P18.3 — Reverse proxy & TLS

- [ ] Dokumentasikan TLS, `Secure` cookie, `X-Forwarded-For`/`TRUSTED_PROXIES`, upgrade WebSocket, batasi akses `/metrics`.

### P18.4 — Dokumentasi operasional

- [ ] README: arsitektur singkat, variabel lingkungan, migrasi, setup akun pemilik, menjalankan worker, workflow dev.
- [ ] Runbook: rotasi kunci zero-downtime (ARCH §11.4, 5 langkah), backup/restore, kebijakan retensi (D-23), kebijakan penghapusan monitor (D-17), catch-up scheduler, diagnosis latensi (tabel ARCH §9.5.A).
- [ ] ADR ringkas ARCH §12.2 diperbarui bila keputusan Fase 0 mengubahnya.

### P18.5 — Verifikasi kriteria keberhasilan MVP (PRD §2)

- [ ] Monitor dapat dibuat dan diperiksa manual.
- [ ] Worker tetap berjalan tanpa dashboard.
- [ ] Setiap pemeriksaan menghasilkan status & informasi kegagalan yang jelas.
- [ ] Uptime sesuai aturan terdokumentasi.
- [ ] Insiden dibuka/ditutup sesuai ambang.
- [ ] Telegram menerima notifikasi buka & pulih.
- [ ] Tidak ada notifikasi baru untuk kegagalan dalam insiden yang sama.
- [ ] Kredensial tidak bocor (respons/log/laporan).
- [ ] Fitur inti dilindungi pengujian otomatis.

### P18.6 — Tinjauan keamanan & rilis

- [ ] Tinjau terhadap OWASP SSRF Prevention & Session Management cheat sheet.
- [ ] `bun audit`/pemindaian dependensi; verifikasi CVE terkait versi pin (drizzle-orm ≥ 0.45.2).
- [ ] Pengujian integrasi manual ke bot Telegram nyata terdokumentasi.
- [ ] Tag rilis `v1.0.0-mvp`.

---

## Lampiran A — Traceability User Story → Tugas

| US | Topik | Tugas utama |
|---|---|---|
| 1 | Masuk dengan kredensial | P7.3, P7.6, P15.1 |
| 2 | Sesi aman | P7.3, P7.5, P7.6 |
| 3 | Keluar/cabut sesi | P7.3, P7.6, P14.6 |
| 4 | Nama & URL monitor | P2.3, P8.1, P15.4 |
| 5 | Metode HTTP | P2.1, P8.1, P15.4 |
| 6 | Header & body request | P2.4, P8.1, P15.4 |
| 7 | Bearer/API key/Basic/Custom | P2.4, P5.2, P6.1, P15.4 |
| 8 | Status HTTP diharapkan | P2.5, P2.6, P15.4 |
| 9 | Validasi header & JSON | P2.5, P2.6, P15.4 |
| 10 | Interval 1 menit–24 jam | P2.8, P8.1, P15.4 |
| 11 | Timeout | P2.8, P6.3, P15.4 |
| 12 | Pemeriksaan manual | P9.4, P15.5 |
| 13 | Edit/jeda/lanjut/hapus | P8.1, P8.2, P15.3 |
| 14 | Status & waktu cek terakhir | P8.3, P15.3 |
| 15 | Worker memeriksa yang jatuh tempo | P9.1, P9.2, P9.3 |
| 16 | Simpan hasil pemeriksaan | P4.5, P9.3, P11.1 |
| 17 | Riwayat per monitor | P11.1, P15.5 |
| 18 | Grafik latency 24j/7h/30h | P4.7, P11.2, P15.5 |
| 19 | Persentase uptime | P2.10, P4.7, P11.2 |
| 20 | Pembedaan kategori kegagalan | P6.5, P2.1, P15.5 |
| 21 | Buka insiden setelah 3 gagal | P2.8, P9.3 |
| 22 | Insiden tetap aktif hingga pulih | P2.8, P9.3 |
| 23 | Tutup setelah 2 sukses | P2.8, P9.3 |
| 24 | Waktu mulai/pulih/durasi insiden | P2.9, P10.1, P15.6 |
| 25 | Status monitor jelas | P3.5, P14.5, P15.6 |
| 26 | Konfigurasi bot Telegram | P10.4, P15.7 |
| 27 | Notifikasi percobaan | P10.4, P15.7 |
| 28 | Notifikasi buka & pulih | P10.2, P10.3 |
| 29 | Tanpa spam notifikasi | P10.3, P10.5 |
| 30 | Ekspor CSV | P11.3, P15.7 |

## Lampiran B — Checklist Endpoint (ARCH §9.3 + tambahan D-nn)

| Endpoint | Tugas |
|---|---|
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` | P7.6 |
| `PUT /api/settings/account/password` (D-09) | P7.6 |
| `GET/POST /api/monitors` · `GET/PATCH/DELETE /api/monitors/:id` | P8.3, P8.4 |
| `POST /api/monitors/:id/pause` · `/resume` | P8.4 |
| `POST /api/monitors/:id/check` · `POST /api/monitors/test` (D-10) | P9.4 |
| `GET /api/monitors/:id/checks` · `GET /api/checks/recent` (D-19) | P11.1 |
| `GET /api/monitors/:id/metrics` · `GET /api/metrics/summary` · `GET /api/metrics/latency` (D-19) | P11.2 |
| `GET /api/incidents` · `GET /api/incidents/:id` | P10.1 |
| `GET /api/reports/export.csv` | P11.3 |
| `GET/PUT /api/settings/telegram` · `POST /api/settings/telegram/test` | P10.4 |
| `GET /healthz` · `GET /readyz` · `GET /metrics` | P13.2, P13.3 |
| WebSocket `/api/ws` | P12.3 |

## Lampiran C — Checklist Tabel Database (ARCH §6.1)

| Tabel | Tugas |
|---|---|
| `users` (+ `uq_single_owner_guard`) | P4.2, P7.4 |
| `sessions` | P4.2, P7.3 |
| `rate_limits` | P4.2, P5.5 |
| `monitors` (+ `idx_monitors_due`) | P4.2, P4.5 |
| `incidents` (+ `uq_incidents_one_open`) | P4.2, P4.8 |
| `check_results` (partisi bulanan) | P4.3, P4.4 |
| `monitor_metrics_hourly` | P4.7, P9.5 |
| `notification_configs` | P4.2, P10.4 |
| `notification_deliveries` | P4.2, P10.3 |
| `worker_heartbeats` | P4.5, P9.1 |

## Lampiran D — Checklist Port & Use Case (ARCH §4)

| Item | Tugas |
|---|---|
| 7 repository port + 10 service port (+ port tambahan) | P3.2 |
| `AuthenticateUser`, `RevokeSession` | P7.3 |
| `Create/Update/Pause/Resume/DeleteMonitor` | P8.1, P8.2 |
| `ExecuteManualCheck`, `ExecuteScheduledCheck` | P9.3, P9.4 |
| `DispatchNotification` | P10.3 |
| `GetMonitorMetrics`, `GetMetricsSummary` | P11.2 |
| `StreamCsvReport` | P11.3 |
| Adapter: Drizzle repos, NodeHttpSsrfProbe, LibsodiumAead, TelegramBot, PgBossQueue, PgListenNotify, PostgresRateLimiter, NodeArgon2Hasher, UuidV7, SystemClock, DrizzleUoW, PinoLogger | P4, P5, P6, P9, P10 |

## Lampiran E — Di Luar Cakupan MVP (jangan dibangun)

Multi-user/organisasi, billing, public status page, integrasi Slack/Discord/email/SMS, multi-region, eksekusi skrip pengguna, pemeriksaan TCP/ICMP/DNS khusus, browser/synthetic monitoring, impor OpenAPI penuh, SLO/error budget, maintenance window kompleks, message broker terpisah (PRD §6).

## Lampiran F — Sumber Verifikasi Tambahan

- pg-boss: adapter `db` transaksi (`fromDrizzle`), `createQueue`, policy queue — dokumentasi resmi pg-boss (adapters.md, queues.md) dan release notes v10.
- Nuxt UI v4.12: komponen `Chart` dan peer dependency TanStack Charts — ui.nuxt.com/docs/components/chart dan release v4.12.0.
- Nitro: WebSocket (crossws), flag `experimental.websocket` — nitro.build/docs/websocket dan dokumentasi NuxtHub realtime.
- Drizzle: migrasi kustom dan keterbatasan tabel partisi pada drizzle-kit; versi 0.45.x/kit 0.31.x; CVE-2026-39356 (osv.dev).
- Bun: lockfile teks `bun.lock` sejak Bun 1.2.
