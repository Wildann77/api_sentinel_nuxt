# API Sentinel — Architecture Documentation

Dokumen ini mendefinisikan arsitektur sistem, struktur monorepo, batas domain (Domain-Driven Design), pola Hexagonal (Ports & Adapters), mitigasi keamanan, kontrak data, dan spesifikasi operasional untuk **API Sentinel**. Seluruh keputusan teknis pada dokumen ini diturunkan langsung dari spesifikasi [PRD.md](./PRD.md).

> **Catatan Batasan Arsitektur:**
> Dokumen ini berfokus secara eksklusif pada arsitektur sistem, domain bisnis, pola data, keamanan, dan struktur komponen frontend. Seluruh aspek estetika visual, warna, tipografi, dan mock-up antarmuka diatur secara terpisah pada `DESIGN.md`.

---

## 1. Topologi Sistem & Prinsip Desain

API Sentinel dirancang menggunakan pendekatan **Modular Monolith** dengan ekosistem **Bun Monorepo Workspaces (v1.3.14)** dan runtime eksekusi produksi berbasis **Node.js 24 LTS (v24.11.1)**. Sistem terdiri dari dua proses runtime utama yang beroperasi di atas basis kode dan database PostgreSQL yang sama:

```
                           +-----------------------------------------------+
                           |                Browser Client                 |
                           |   (Nuxt UI + TanStack Query + Cross-WS Client)|
                           +-----------------------+-----------------------+
                                                   |
                                         HTTP / WS Requests
                                                   |
                                                   v
+---------------------------------------------------------------------------------------+
| Bun Monorepo Runtime (Node.js 24 LTS / v24.11.1 Execution Environment)                 |
|                                                                                       |
|  +-------------------------------------+    +--------------------------------------+  |
|  |              apps/web               |    |             apps/worker              |  |
|  |   - Nuxt 4.6.x (Nitro node-server)  |    |   - Standalone Daemon Process        |  |
|  |   - Nitro API (Driving Adapter)     |    |   - pg-boss v12 Consumer             |  |
|  |   - Nitro Cross-WS Server Engine    |    |   - node:http SSRF IP-Pinning Probe  |  |
|  |   - Dashboard SPA & Auth Routes     |    |   - Telegram Dispatcher (Retries)    |  |
|  +------------------+------------------+    +------------------+-------------------+  |
|                     |                                          |                      |
|                     +--------------------+---------------------+                      |
|                                          |                                            |
|                                          v                                            |
|  +---------------------------------------------------------------------------------+  |
|  | packages/application                                                            |  |
|  |   - Use Cases (<Verb><Noun>UseCase: Commands & Queries)                         |  |
|  |   - Inbound Ports (Use Case Interfaces)                                         |  |
|  |   - Outbound Ports (Repository, Probe, Cipher, Queue, Metrics, Clock, UoW Ports) |  |
|  +---------------------------------------+-----------------------------------------+  |
|                                          |                                            |
|                                          v                                            |
|  +---------------------------------------------------------------------------------+  |
|  | packages/domain                                                                 |  |
|  |   - Aggregates (Monitor, Incident) & Entities (CheckResult)                     |  |
|  |   - Value Objects (AssertionRule, EndpointUrl, EncryptedSecret, UUIDv7)         |  |
|  |   - Domain Services (AssertionEngine - Safe AST without eval)                   |  |
|  |   - Domain Events (IncidentOpened, IncidentRecovered)                           |  |
|  +---------------------------------------+-----------------------------------------+  |
|                                          ^                                            |
|                                          | implements ports                           |
|  +---------------------------------------+-----------------------------------------+  |
|  | packages/infra                                                                  |  |
|  |   - Drizzle ORM Repositories (pg.Pool / node-postgres)                          |  |
|  |   - node:http SSRF-Safe Custom Agent with Socket IP Pinning (all: true)         |  |
|  |   - Libsodium XChaCha20-Poly1305-IETF AEAD Cipher with AAD Context              |  |
|  |   - Telegram Bot API Adapter with MarkdownV2 escaping                           |  |
|  |   - pg-boss Queue Engine Adapter with Transactional DB Client                   |  |
|  |   - PostgreSQL LISTEN / NOTIFY Inter-Process Event Bus                          |  |
|  +---------------------------------------+-----------------------------------------+  |
|                                          |                                            |
|  +---------------------------------------+-----------------------------------------+  |
|  | packages/contracts (Shared DTOs, API Schemas & WebSocket Payload Contracts)     |  |
|  +---------------------------------------------------------------------------------+  |
+------------------------------------------|--------------------------------------------+
                                           v
                           +-------------------------------+
                           |    PostgreSQL 17+ Database    |
                           |  - Relational Schema & Indexes|
                           |  - pg-boss v12 Job Tables     |
                           |  - LISTEN / NOTIFY Channel    |
                           |  - Monthly Partitioned Checks |
                           +-------------------------------+
```

### 1.1. Prinsip Utama (Clean Code & Hexagonal Rules)

1. **Dependency Inversion (Hexagonal Boundary):**
   - `packages/domain`: Derajat isolasi absolut. Nol dependensi ke framework, I/O, database, atau network.
   - `packages/application`: Mengatur alur logika bisnis. Hanya bergantung pada `packages/domain` dan `packages/contracts`. Semua I/O didefinisikan via Outbound Port.
   - `packages/infra`: Mengimplementasikan Outbound Ports dari `application`.
   - `packages/contracts`: Tipe DTO, schema Zod, dan antarmuka payload yang dipakai bersama oleh client, web server, dan worker.
   - `apps/web` dan `apps/worker`: Driving (Inbound) Adapters yang menginisialisasi Composition Root dan mengarahkan input eksternal ke Application Use Cases.
2. **Transactional Integrity & No Dual-Write:**
   - Perubahan data monitor, pembuatan `check_results`, transisi status `incidents`, dan antrean notifikasi dieksekusi dalam **satu transaksi database PostgreSQL tunggal** (Unit of Work). Job antrean pg-boss di-dispatch menggunakan instance transaksi database (`boss.send(..., { db: tx })`), mengeliminasi risiko *dual-write anomaly* saat proses crash.
3. **Zero-Leak Secret Architecture:**
   - Semua rahasia target (Bearer Token, Basic Auth, API Key, Custom Headers, dan Telegram Bot Token) dienkripsi simetris dengan authenticated cipher sebelum disimpan ke database.
   - Kolom headers dan body disimpan dalam bentuk terenkripsi atau disanitasi saat dibaca. Endpoint `GET` konfigurasi monitor hanya mengembalikan nama/key header, bukan nilai aslinya.
   - Log terstruktur dan serialisasi error menerapkan redaksi otomatis berbasis pola regex untuk token Telegram (`/bot\d+:[A-Za-z0-9_-]+/`), header `Authorization`, dan payload kredensial.
4. **Resilient Fail-Safe Execution:**
   - Kegagalan downstream (timeout endpoint target, respons 500, penolakan SSRF, atau API Telegram tidak dapat dihubungi) tidak boleh membatalkan penyimpanan hasil riwayat pemantauan.

### 1.2. Spesifikasi Matriks Stack Teknologi Definitif (Verified Registry)

Seluruh dependensi dan runtime telah diverifikasi langsung terhadap registry npm dan rilis ekosistem resmi:

| Layer / Kategori | Komponen & Package | Versi Definitif | Tanggung Jawab & Rasional Arsitektur |
|---|---|---|---|
| **Tooling & Workspace** | `bun` | `v1.3.14` | Package manager, workspace orchestrator, runner skrip developer lokal tercepat. |
| **Production Runtime** | `node` | `v24 LTS (v24.11.1)` | Runtime eksekusi produksi stabil untuk `apps/web` dan `apps/worker`. Menjamin kompatibilitas 100% `pg`, pg-boss, dan custom lookup `node:http`. |
| **Language** | `typescript` | `~5.9.3` (Pin 5.9.x) | `strict: true`, `verbatimModuleSyntax: true`, target ES2023. Menghindari inkompatibilitas ekosistem Nuxt/Vue dengan TS 7 (D-24). |
| **Fullstack Framework** | `nuxt` | `v4.6.2` (Nuxt 4.6.x) | Fullstack framework arsitektur modern (layout folder `app/`), hybrid rendering, Nitro engine. |
| **Server Engine** | `nitro` | Preset `node-server` | Preset server Nitro resmi untuk runtime Node.js LTS, streaming SSE/CSV stabil, Cross-WS WebSocket teruji. |
| **UI Component System** | `@nuxt/ui` | `v4.12.0` | 125+ komponen Vue 3 berbasis Reka UI & Tailwind CSS v4, wrapper `UApp`, form integrasi Standard Schema. |
| **CSS Framework** | `tailwindcss` | `v4.3.3` | Engine styling CSS-first (arsitektur `@theme`), performa kompilasi instan tanpa `tailwind.config.js`. |
| **Reactive Core** | `vue` | `v3.5.44` | Engine reaktif frontend Vue 3 Composition API. |
| **Visualisasi Grafik** | `<UChart>` (`@nuxt/ui`) | Bawaan v4.12 | Visualisasi chart latency & uptime native SVG/Canvas (@tanstack/vue-charts & @tanstack/charts optional peer dependency, D-05). |
| **Fallback Chart Kompleks** | `@unovis/vue` | `v1.7.1` | Fallback untuk visualisasi korelasi lanjutan (scatter, multi-axis latency). |
| **Frontend State & Cache** | `@tanstack/vue-query` | `v5.104.5` | Manajemen query server-state, invalidasi reaktif via WebSocket, auto-refetch window focus. Diinisialisasi via Nuxt plugin manual. |
| **Queue & Worker Engine** | `pg-boss` | `v12.38.0` | Antrean background PostgreSQL (`SKIP LOCKED`), queue policy `stately` + `singletonKey`, adapter transaksi `fromDrizzle(tx, sql)` (D-01, D-02). |
| **Database ORM** | `drizzle-orm` | `v0.45.4` | Type-safe SQL builder, migrasi skema deklaratif, bebas CVE-2026-39356 (D-03). |
| **Database Migrations** | `drizzle-kit` | `v0.31.11` | CLI runner migrasi skema terisolasi kompatibel drizzle-orm 0.45.x (`bun run db:migrate`) (D-03). |
| **Database Driver** | `pg` (`node-postgres`) | `v8.23.1` | Driver PostgreSQL tunggal untuk Drizzle (`pg.Pool`), pg-boss, dan dedicated `pg.Client` untuk `LISTEN sentinel_events`. |
| **Database Server** | `postgresql` | `v17+` (`postgres:17-alpine`) | Database relasional dengan range partitioning bulanan, `date_bin`, dan pub/sub terintegrasi. |
| **Validasi & Schema** | `zod` | `v4.6.7` | Input validation DTO, Standard Schema validator untuk form Nuxt UI, env boot validator. |
| **Password Hasher** | `@node-rs/argon2` | `v2.2.2` | Hashing password Argon2id terkompilasi native Rust NAPI, dilengkapi constant-time dummy verification. |
| **Enkripsi Rahasia** | `libsodium-wrappers-sumo` | `v0.8.4` | Kriptografi simetris AEAD XChaCha20-Poly1305-IETF dengan AAD binding (`monitorId:fieldName`) dan keyring JSON. |
| **JSONPath Evaluator** | AST parser (safe mode) | Mode `preventEval: true` | Evaluasi path JSON aman tanpa `eval()` / `Function()`, pembatasan maks 10 rules dan query $\le$ 100 char. |
| **Structured Logger** | `pino` | `v10.4.0` | Logger JSON performa tinggi dengan regex serializer redaction untuk token Telegram (`/bot<token>/`) dan auth headers. |
| **Linter & Formatter** | `@biomejs/biome` | `v2.6.2` | Tooling kualitas kode terpadu berbasis Rust (kecepatan sub-millisecond, pengganti ESLint + Prettier). |
| **Boundary Enforcer** | `dependency-cruiser` | `v18.7.0` | Penegakan aturan impor antar-layer Hexagonal di CI (mencegah `domain` mengimpor `infra` atau framework). |
| **Execution Tooling** | `tsx` | `v4.19.x` | TypeScript execute loader untuk daemon worker (`node --import tsx src/index.ts`) tanpa langkah kompilasi terpisah. |
| **Distributed Tracing** | `@opentelemetry/sdk-node` + `@opentelemetry/api` | `v0.300.0` + `v1.10.0` | Instrumentasi tracing terdistribusi W3C `traceparent` lintas Web $\leftrightarrow$ pg-boss $\leftrightarrow$ Worker $\leftrightarrow$ DB. |
| **Telemetry Exporters** | `@opentelemetry/exporter-prometheus` + `otlp-http` | `v0.300.0` | Eksposur metrik Prometheus (`/metrics`) dan pengiriman trace spans via OTLP HTTP ke Jaeger. |
| **Network Probe** | `node:http` & `node:https` | Core Node.js 24 LTS | Custom agent dengan socket-level IP pinning, parameter `{ all: true }`, pemblokiran CIDR menyeluruh. |
| **Testing Suite** | `vitest` + `playwright` | `vitest v3.x` + `playwright v1.50+` | Unit test domain (Vitest), integrasi DB via `@testcontainers/postgresql`, E2E browser flows (Playwright). |
| **Dev Observability** | `prometheus` + `jaeger` (Docker) | `prom/prometheus:v3.15.1` + `jaeger:1.76.0` | Visualisasi waterfall tracing (Jaeger) dan scraping metrik operasional (Prometheus) di dev environment. |

---

## 2. Struktur Monorepo (Bun Workspaces)

Monorepo menggunakan Bun v1.3.14 sebagai package manager dan workspace manager, dengan target eksekusi Node.js 24 LTS (v24.11.1) pada production.

```
api_sentinel_nuxt/
├── package.json                 # Monorepo root workspaces & scripts
├── bunfig.toml                  # Bun manager configuration
├── tsconfig.base.json           # Base TypeScript configuration (strict: true)
├── PRD.md                       # Product Requirements Document
├── ARCHITECTURE.md              # Technical Architecture Specification
├── apps/
│   ├── web/                     # Nuxt 4.6.x Fullstack (Driving Adapter)
│   │   ├── package.json
│   │   ├── nuxt.config.ts       # Hybrid rendering, Nitro node-server, Nuxt UI v4
│   │   ├── app/                 # Vue 3 App Directory (Nuxt 4 structure)
│   │   │   ├── app.vue          # Root component wrapped with UApp
│   │   │   ├── pages/           # File-based routing (login, dashboard, monitors)
│   │   │   ├── components/      # UI components (UChart, Monitor forms, Incident badges)
│   │   │   ├── plugins/         # @tanstack/vue-query plugin initialization
│   │   │   └── composables/     # Query hooks & WebSocket event listeners
│   │   └── server/              # Nitro API Engine (HTTP & WS Driving Adapters)
│   │       ├── api/             # REST Route Handlers (RFC 9457 compliant)
│   │       ├── routes/          # Streaming endpoints (CSV export cursor)
│   │       ├── plugins/         # PG Listen listener & WS broadcast wiring
│   │       ├── middleware/      # Session auth & PostgreSQL sliding rate limiter
│   │       └── utils/           # Composition root dependency container
│   └── worker/                  # Standalone Daemon Process (Driving Adapter)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts         # Worker entrypoint, graceful shutdown & heartbeat
│           ├── scheduler.ts     # pg-boss cron publisher (FOR UPDATE SKIP LOCKED)
│           ├── jobs/            # Queue consumers (probe check, notification dispatch)
│           └── container.ts     # Worker composition root container
└── packages/
    ├── contracts/               # Shared DTOs, Zod Schemas & API Types
    │   ├── package.json
    │   └── src/
    │       ├── dtos/            # Monitor, Check, Incident, Auth request/response DTOs
    │       ├── schemas/         # Zod schemas (Standard Schema compliant)
    │       └── events/          # WebSocket & PG LISTEN/NOTIFY payload types
    ├── domain/                  # Pure Enterprise Business Rules
    │   ├── package.json
    │   └── src/
    │       ├── entities/        # Monitor, Incident, CheckResult
    │       ├── value-objects/   # EndpointUrl, AssertionRule, EncryptedSecret, UUIDv7
    │       ├── events/          # IncidentOpenedEvent, IncidentRecoveredEvent
    │       └── services/        # AssertionEngine (AST parser, preventEval: true)
    ├── application/             # Application Use Cases & Port Interfaces
    │   ├── package.json
    │   └── src/
    │       ├── ports/           # Inbound & Outbound Port interfaces
    │       │   ├── in/          # Use Case interfaces
    │       │   └── out/         # Repositories, Probe, Cipher, Queue, UoW, Clock Ports
    │       └── use-cases/       # Implementasi Use Case (<Verb><Noun>UseCase)
    └── infra/                   # Driven Adapters
        ├── package.json
        └── src/
            ├── db/              # Drizzle schema, Pool connection & Migrations
            ├── repositories/    # Drizzle ORM repository implementations
            ├── network/         # node:http SSRF-safe probe client with socket IP pinning
            ├── crypto/          # Libsodium XChaCha20-Poly1305-IETF AEAD adapter
            ├── notification/    # Telegram Bot API adapter (MarkdownV2 safe)
            ├── queue/           # pg-boss queue adapter
            └── logging/         # Pino logger with regex URL & header redactors
```

### 2.1. Tooling Kualitas Kode & Penegakan Batasan Arsitektur

Untuk menjamin Clean Architecture dan pola Hexagonal dihormati secara kaku tanpa kebocoran dependensi, monorepo mengadopsi kombinasi **Biome v2.6.2** (kecepatan lint/format) dan **dependency-cruiser v18.7.0** (verifikasi batas arsitektur kaku).

#### A. Konfigurasi Biome (`biome.json`)
Biome menggantikan ESLint dan Prettier dengan kecepatan eksekusi sub-millisecond pada runtime Bun:
```json
{
  "$schema": "https://biomejs.dev/schemas/2.6.2/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error"
      },
      "style": {
        "useConst": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

#### B. Aturan Penegakan Batas Dependency (`.dependency-cruiser.js`)
Aturan ini dieksekusi pada pipeline CI (`bun run check:boundaries`). Jika terjadi pelanggaran impor (contoh: modul domain mengimpor infra atau database), build akan langsung gagal (exit code 1):

| Dari Layer | Hanya Boleh Mengimpor | DILARANG Mengimpor |
|---|---|---|
| `packages/domain` | Standard TypeScript / Built-in Types | `packages/infra`, `packages/application`, `apps/*`, external I/O libraries |
| `packages/application` | `packages/domain`, `packages/contracts` | `packages/infra`, `apps/*` |
| `packages/contracts` | Type definitions & schema validator | `packages/domain`, `packages/infra`, `packages/application`, `apps/*` |
| `packages/infra` | `packages/application`, `packages/domain`, `packages/contracts` | `apps/*` |
| `apps/web` (Driving) | `packages/application`, `packages/infra`, `packages/contracts` | - |
| `apps/worker` (Driving) | `packages/application`, `packages/infra`, `packages/contracts` | `apps/web` |

---

## 3. Domain-Driven Design (DDD) & Boundaries

### 3.1. Bounded Contexts

| Bounded Context | Deskripsi & Batasan Tanggung Jawab |
|---|---|
| **Identity & Access** | Mengelola kredensial akun pemilik tunggal, verifikasi password Argon2id, pembuatan sesi stateful (opaque tokens), dan pembatasan laju login. |
| **Monitoring Core** | Mengelola entitas monitor, konfigurasi probe, validasi respons via Assertion Engine, isolasi kredensial target, dan pencatatan riwayat pemeriksaan. |
| **Incident Management** | Mengatur siklus hidup insiden, mengevaluasi ambang batas transisi status (`UP`, `DEGRADED`, `DOWN`, `PAUSED`), dan memastikan satu insiden terbuka per monitor. |
| **Alerting & Notification** | Mengelola pengiriman notifikasi Telegram, formatting pesan MarkdownV2, retry backoff, dan deduplikasi pesan. |

### 3.2. Aggregates & Invariants

#### 1. Aggregate: `Monitor` (Root)
`Monitor` mengontrol transactional boundary untuk evaluasi kesehatan endpoint.

- **Attributes:**
  - `id`: `UUIDv7` (di-generate di application layer via `IdGeneratorPort`)
  - `name`: `string`
  - `url`: `EndpointUrl`
  - `method`: `HttpMethod` (`GET` | `POST` | `PUT` | `PATCH` | `DELETE` | `HEAD`)
  - `encryptedHeaders`: `EncryptedSecret | null` (seluruh payload header sensitif dienkripsi)
  - `headerKeys`: `string[]` (nama header yang aman untuk dibaca publik)
  - `encryptedBody`: `EncryptedSecret | null`
  - `encryptedAuthConfig`: `EncryptedSecret | null`
  - `assertionRules`: `AssertionRule[]` (maksimum 10 rules, query $\le$ 100 karakter)
  - `intervalSeconds`: `number` (60 - 86,400)
  - `timeoutMs`: `number` (1,000 - 30,000)
  - `isActive`: `boolean`
  - `healthStatus`: `HealthStatus` (`UNKNOWN` | `UP` | `DEGRADED` | `DOWN` | `PAUSED`)
  - `consecutiveFailures`: `number`
  - `consecutiveSuccesses`: `number`
  - `currentIncidentId`: `UUIDv7 | null`
  - `version`: `number` (Optimistic locking counter)
  - `lastCheckedAt`: `Date | null`
  - `nextRunAt`: `Date`

- **State Transition & Invariants:**
  1. `recordCheckFailure(result: CheckResult): DomainEvent[]`
     - Menambah `consecutiveFailures` (+1) dan mereset `consecutiveSuccesses` ke 0.
     - Jika `healthStatus !== 'DOWN'`:
       - Jika `consecutiveFailures < 3`: Mengubah `healthStatus` menjadi `'DEGRADED'`.
       - Jika `consecutiveFailures >= 3`:
         - Mengubah `healthStatus` menjadi `'DOWN'`.
         - Menginisialisasi `currentIncidentId = IdGeneratorPort.generate()`.
         - Menghasilkan `IncidentOpenedDomainEvent(monitorId, incidentId, causeCategory, message)`.
     - Jika `healthStatus === 'DOWN'`:
       - Menjaga status `'DOWN'`.
       - Menghasilkan event internal untuk meng-update `failureCount` (+1) pada insiden aktif yang ditunjuk `currentIncidentId`.
  2. `recordCheckSuccess(result: CheckResult): DomainEvent[]`
     - Menambah `consecutiveSuccesses` (+1) dan mereset `consecutiveFailures` ke 0.
     - Jika `healthStatus === 'DOWN'`:
       - Jika `consecutiveSuccesses < 2`: Status tetap `'DOWN'`, insiden tetap terbuka (`is_resolved = false`). Lapisan UI/Presenter menurunkan status presentasi sebagai `RECOVERING` (1 dari 2 syarat pemulihan terpenuhi).
       - Jika `consecutiveSuccesses >= 2`:
         - Mengubah `healthStatus` menjadi `'UP'`.
         - Menghasilkan `IncidentRecoveredDomainEvent(monitorId, currentIncidentId)`.
         - Mengosongkan `currentIncidentId = null`.
     - Jika `healthStatus !== 'DOWN'`:
       - Mengubah `healthStatus` menjadi `'UP'`.
  3. `pause(): void`
     - Mengubah `isActive = false`, `healthStatus = 'PAUSED'`.
     - **Aturan Tegas Insiden saat Pause:** Jika status sebelum pause adalah `'DOWN'` dengan insiden terbuka, **insiden tetap berstatus terbuka** (`is_resolved = false`). Menghentikan pemeriksaan tidak membuktikan bahwa API target telah sembuh.
  4. `resume(): void`
     - Mengubah `isActive = true`.
     - Status kesehatan di-reset menjadi `'UNKNOWN'` hingga pemeriksaan terjadwal pertama selesai dijalankan.
     - Menjadwalkan ulang `nextRunAt = ClockPort.now()`.

#### 2. Entity: `Incident`
Mewakili satu siklus gangguan terus-menerus.
- `id`: `UUIDv7`
- `monitorId`: `UUIDv7`
- `startedAt`: `Date`
- `recoveredAt`: `Date | null`
- `durationSeconds`: `number | null`
- `causeCategory`: `FailureCategory`
- `initialErrorMessage`: `string`
- `failureCount`: `number`
- `isResolved`: `boolean`

#### 3. Entity: `CheckResult`
Catatan historis immutable hasil eksekusi probe.
- `id`: `UUIDv7`
- `monitorId`: `UUIDv7`
- `incidentId`: `UUIDv7 | null`
- `executedAt`: `Date`
- `durationMs`: `number` (Latency)
- `isSuccess`: `boolean`
- `statusCode`: `number | null`
- `failureCategory`: `FailureCategory | null`
- `assertionResults`: `AssertionExecutionResult[]`
- `sanitizedDiagnostic`: `string | null`

### 3.3. Domain Service: AssertionEngine (Safe AST Parser)

Untuk mengeliminasi celah Remote Code Execution (RCE) seperti CVE-2024-21534 dan CVE-2025-1302 pada evaluator ekspresi JSONPath dinamis:
- Evaluasi JSONPath dikonfigurasi dengan mode **`preventEval: true`** menggunakan recursive-descent AST parser tanpa pemanggilan `eval()` atau `Function()`.
- Batasan pertahanan berlapis (Defense-in-Depth):
  - Maksimum 10 aturan assertion per monitor.
  - Panjang string query JSONPath maksimum 100 karakter.
  - Ukuran body respons JSON maksimum 2 MB (stream diputus jika melampaui batas).
  - Tipe perbandingan ketat: nilai numerik `123` tidak setara dengan string `"123"`.

---

## 4. Hexagonal Architecture (Ports & Adapters)

### 4.1. Inbound Ports & Naming Convention

Seluruh use case mengadopsi konvensi nama terstandarisasi `<Verb><Noun>UseCase`:

| Inbound Port (Use Case) | Tipe | Deskripsi |
|---|---|---|
| `AuthenticateUserUseCase` | Command | Verifikasi kredensial Argon2id & buat session token stateful. |
| `RevokeSessionUseCase` | Command | Hapus baris session dari database. |
| `CreateMonitorUseCase` | Command | Validasi URL/aturan, enkripsi rahasia dengan AAD, simpan monitor. |
| `UpdateMonitorUseCase` | Command | Perbarui konfigurasi, re-enkripsi rahasia jika berubah. |
| `PauseMonitorUseCase` | Command | Set `isActive = false`, jadwalkan ulang antrean. |
| `ResumeMonitorUseCase` | Command | Set `isActive = true`, `healthStatus = 'UNKNOWN'`. |
| `DeleteMonitorUseCase` | Command | Hapus permanen monitor (hard delete cascade) dan batalkan pekerjaan pg-boss (D-17). |
| `ChangeOwnerPasswordUseCase` | Command | Verifikasi password lama, hash Argon2id password baru, revoke sesi lain (D-09). |
| `TestMonitorConfigUseCase` | Command | Probe uji konfigurasi form tanpa simpan DB, rate limit Tier 2 (D-10). |
| `ExecuteManualCheckUseCase` | Command | Probe langsung tanpa memengaruhi counter produksi atau status insiden (D-13). |
| `ExecuteScheduledCheckUseCase` | Command | Eksekusi probe berkala, update state monitor, buka/tutup insiden. |
| `DispatchNotificationUseCase` | Command | Kirim pesan Telegram terformat dengan retry & deduplikasi. |
| `GetRecentChecksUseCase` | Query | Feed pemeriksaan terbaru lintas monitor untuk dashboard observabilitas DES §5.2 (D-19). |
| `GetCompositeLatencyMetricsUseCase` | Query | Metrik latensi komposit multi-monitor untuk grafik dashboard DES §5.2 (D-19). |
| `GetMonitorMetricsUseCase` | Query | Query time-bucket agregasi PostgreSQL (uptime & latency per monitor). |
| `GetMetricsSummaryUseCase` | Query | Ringkasan metrik agregat dashboard (total monitor, status counts, insiden aktif, avg latency). |
| `StreamCsvReportUseCase` | Query | Stream cursor database dengan filter monitorId, from, to & sanitasi formula (D-18). |

### 4.2. Outbound Ports & Driven Adapters

```
+---------------------------------------------------------------------------------------+
|                                    OUTBOUND PORTS                                     |
+---------------------------------------------------------------------------------------+
|  Repository Ports:                                                                    |
|  - MonitorRepositoryPort          - IncidentRepositoryPort                            |
|  - CheckResultRepositoryPort      - SessionRepositoryPort                             |
|  - UserRepositoryPort             - NotificationConfigRepositoryPort                  |
|  - NotificationDeliveryRepositoryPort                                                 |
|                                                                                       |
|  Infrastructure & Service Ports:                                                      |
|  - NetworkProbePort               - CipherPort                                        |
|  - QueuePort                      - PubSubPort                                        |
|  - RateLimiterPort                - PasswordHasherPort                                |
|  - IdGeneratorPort                - ClockPort                                         |
|  - UnitOfWorkPort                 - LoggerPort                                        |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|                                    DRIVEN ADAPTERS                                    |
+---------------------------------------------------------------------------------------+
|  - DrizzlePostgresRepositories (pg.Pool / node-postgres)                              |
|  - NodeHttpSsrfProbeAdapter (node:http / node:https custom lookup agent, all: true)   |
|  - LibsodiumAeadCipherAdapter (crypto_aead_xchacha20poly1305_ietf with AAD)           |
|  - TelegramBotNotificationAdapter (MarkdownV2 escaper + 429 Retry-After)              |
|  - PgBossQueueAdapter (Transactional boss.send({ db: tx }))                           |
|  - PgListenNotifyAdapter (Dedicated pg.Client LISTEN sentinel_events)                 |
|  - PostgresRateLimiterAdapter (Sliding-window table rate_limits)                      |
|  - NodeArgon2HasherAdapter (@node-rs/argon2 with constant-time dummy verification)    |
|  - UuidV7GeneratorAdapter (Application-level UUID v7)                                 |
|  - SystemClockAdapter (Deterministic testable clock)                                  |
|  - DrizzleUnitOfWorkAdapter (PostgreSQL transaction coordinator)                      |
|  - PinoLoggerAdapter (Structured JSON logger with regex Telegram URL redact)          |
+---------------------------------------------------------------------------------------+
```

---

## 5. Keamanan & Mitigasi Risiko

### 5.1. Mitigasi SSRF & DNS Rebinding Komprehensif

Probe HTTP tidak menggunakan `fetch` Bun atau Undici bawaan, melainkan adapter khusus berbasis **`node:http`** dan **`node:https`** dengan custom `lookup` agent yang mengikat socket langsung ke IP tervalidasi.

```
       Input URL: "http://example.com:8080/health"
                           |
                           v
1. URL Parsing & Pre-Check:
   - Skema wajib 'http' atau 'https'
   - Tolak URL dengan userinfo ("http://user:pass@host")
   - Periksa IP Literals via net.isIP(hostname):
     Jika IP numerik (desimal, hex, octal), validasi langsung terhadap CIDR Blacklist.
                           |
                           v
2. Custom DNS Resolver (dns.promises.resolve4 / resolve6):
   - Parameter { all: true } untuk menangani Happy Eyeballs & multi-record A/AAAA.
                           |
                           v
3. Strict Multi-Record Validation:
   Jika SALAH SATU IP dari seluruh daftar resolusi berada dalam CIDR Blacklist,
   batalkan permintaan seketika! (Throw SSRFBlockedException).
                           |
                           v
4. Normalisasi IPv6:
   - Ekstrak IPv4-mapped IPv6 ("::ffff:127.0.0.1") menjadi IPv4 sebelum validasi.
   - Evaluasi NAT64 ("64:ff9b::/96") dan 6to4 ("2002::/16").
                           |
                           v
5. Socket-Level Pinning:
   Socket TCP dibuka langsung ke IP numerik yang telah divalidasi.
   Header 'Host' asli dan TLS SNI tetap dikirimkan sesuai nama domain asal.
   (Mencegah DNS Rebinding TOCTOU race conditions).
```

#### A. Daftar Lengkap CIDR Blacklist

```typescript
export const BLOCKED_CIDR_RANGES = [
  // IPv4
  '0.0.0.0/8',          // Current network
  '10.0.0.0/8',         // Private-use RFC 1918
  '100.64.0.0/10',      // Carrier-grade NAT RFC 6598
  '127.0.0.0/8',        // Loopback RFC 1122
  '169.254.0.0/16',     // Link-local & Cloud Metadata (AWS/GCP/Azure/DO 169.254.169.254)
  '172.16.0.0/12',      // Private-use RFC 1918
  '192.0.0.0/24',       // IETF Protocol Assignments RFC 6890
  '192.0.2.0/24',       // TEST-NET-1 documentation RFC 5737
  '192.168.0.0/16',     // Private-use RFC 1918
  '198.18.0.0/15',      // Network benchmark tests RFC 2544
  '198.51.100.0/24',    // TEST-NET-2 documentation RFC 5737
  '203.0.113.0/24',     // TEST-NET-3 documentation RFC 5737
  '224.0.0.0/4',        // Multicast RFC 5771
  '240.0.0.0/4',        // Reserved for future use RFC 1112
  '255.255.255.255/32', // Broadcast RFC 919

  // IPv6
  '::/128',             // Unspecified
  '::1/128',            // Loopback
  '::ffff:0:0/96',      // IPv4-mapped IPv6 (dinormalisasi ke IPv4)
  '64:ff9b::/96',       // IPv4/IPv6 translation RFC 6052
  '2001:db8::/32',      // Documentation RFC 3849
  '2002::/16',          // 6to4 RFC 3056
  'fc00::/7',           // Unique local address RFC 4193
  'fe80::/10',          // Link-local unicast RFC 4291
  'ff00::/8',           // Multicast RFC 4291
  'fd00:ec2::254/128'   // AWS IMDSv6 Metadata
];
```

#### B. Header Deny-List & Aturan Eksekusi
- **Dilarang Dikonfigurasi Pengguna:** Header hop-by-hop dan kontrol koneksi dilarang di-override: `Host`, `Content-Length`, `Transfer-Encoding`, `Connection`, `Keep-Alive`, `Upgrade`, `Proxy-Authorization`.
- **Userinfo Rejection:** URL dengan format `http://user:pass@domain` ditolak langsung pada validasi schema.
- **Ignore Environment Proxies:** Probe executor secara eksplisit menonaktifkan pewarisan environment variable `HTTP_PROXY`, `HTTPS_PROXY`, dan `ALL_PROXY`.
- **Gzip Bomb Guard:** Limit ukuran respons (maksimum 2 MB) dihitung pada **stream data setelah dekompresi**. Jika konfigurasi monitor tidak memerlukan evaluasi body JSON, stream body langsung di-destroy seketika setelah menerima status dan header.
- **Granular Timeouts & AbortSignal:**
  - Connect Timeout: 5,000 ms.
  - Headers Timeout: 5,000 ms.
  - Total Timeout: Sesuai nilai konfigurasi `timeoutMs` (1,000 - 30,000 ms) via `AbortSignal.timeout()`.
  - Latency mengukur durasi sejak socket connect dimulai hingga header & body selesai dibaca. Resolusi DNS dihitung secara terpisah pada diagnostik.

### 5.2. Enkripsi Rahasia (Libsodium XChaCha20-Poly1305-IETF AEAD)

1. **Algoritma:** Authenticated Encryption with Associated Data (AEAD) menggunakan **XChaCha20-Poly1305-IETF** via `libsodium-wrappers` (sumo).
2. **Context Binding (AAD):** Ciphertext diikat secara kriptografis ke konteks baris dan kolom:
   $$\text{AAD} = \text{"monitorId:"} + \text{id} + \text{":field:"} + \text{fieldName}$$
   Hal ini menjamin ciphertext tidak dapat dipindahkan atau ditukar antar row monitor atau antar kolom dalam database.
3. **Format Ciphertext Seragam:**
   $$\text{Format: } \texttt{v1:<keyId>:<hexNonce>:<hexCiphertextWithMac>}$$
   - `keyId`: Identifier kunci (misal `k2026`).
   - `hexNonce`: 24-byte random nonce (48 karakter hex).
   - `hexCiphertextWithMac`: Ciphertext yang telah dilengkapi 16-byte Poly1305 authentication tag.
4. **Key Rotation via Keyring:** Kunci enkripsi dibaca dari environment variable `APP_KEYRING` dalam format JSON:
   ```json
   {
     "activeKeyId": "k2",
     "keys": {
       "k1": "base64-encoded-32byte-key...",
       "k2": "base64-encoded-32byte-key..."
     }
   }
   ```
   Enkripsi selalu menggunakan `activeKeyId`. Dekripsi membaca `keyId` dari prefix ciphertext, memungkinkan rotasi kunci tanpa downtime.

### 5.3. Autentikasi Pemilik & Keamanan Sesi

1. **Argon2id Hashing:** Password pemilik aplikasi di-hash menggunakan `@node-rs/argon2` (atau native `node:crypto.hash('argon2id')`).
2. **Mitigasi User Enumeration & Timing Attacks:**
   Jika pengguna memasukkan username yang tidak terdaftar, server tetap mengeksekusi kalkulasi hash Argon2id dummy terhadap string konstan dengan salt acak sebelum mengembalikan pesan error generik `"Kredensial tidak valid"`. Waktu komputasi request login yang gagal selalu konsisten.
3. **Constraint Pemilik Tunggal (Single-Owner):**
   Tabel `users` dilindungi partial unique index atau check constraint untuk memastikan tabel hanya dapat memiliki maksimal 1 baris akun:
   ```sql
   CREATE UNIQUE INDEX uq_single_owner_guard ON users ((true));
   ```
4. **Stateful Opaque Token Sesi:**
   - Token acak 256-bit (`crypto.randomBytes(32)`).
   - Token mentah dikirim ke browser via cookie dengan atribut: `HttpOnly`, `SameSite=Lax`, `Path=/`, dan `Secure` (diaktifkan otomatis pada HTTPS).
   - Server hanya menyimpan hash token `SHA-256(token)` di tabel database `sessions`.
   - **Kebijakan TTL:**
     - Idle TTL: 24 jam (diperpanjang pada setiap request aktif / sliding window).
     - Absolute TTL: 7 hari (sesi wajib login ulang setelah 7 hari tanpa pengecualian).
5. **Mitigasi Brute-Force & Abuse (Multi-Tier PostgreSQL Sliding Rate Limiter):**
   Rate limiter stateful beroperasi menggunakan tabel database `rate_limits` dengan algoritma sliding-window:
   - **Tier 1 (Auth Login):** Maksimum 5 percobaan login gagal per IP (`ip:login`) dan per username (`user:login`) dalam rentang 15 menit. Melindungi akun pemilik dari brute-force terdistribusi.
   - **Tier 2 (Manual Probe Trigger):** Endpoint `POST /api/monitors/:id/check` dibatasi maksimum **1 check per 10 detik per monitor ID**, dan maksimum **20 check per menit per user**. Mencegah penyalahgunaan sistem sebagai alat penyerang (outbound DDoS / probe flooding).
   - **Tier 3 (Authenticated Global API):** Maksimum **120 requests per menit per user**. Melindungi endpoint query metrik dan dashboard dari pemanggilan agresif di luar batas wajar.
   - **Trusted Proxy Awareness:** Nitro dikonfigurasi membaca IP client asli secara aman melalui trusted reverse proxy headers (`X-Forwarded-For`).
   - **Pembersihan Otomatis:** Baris rate limit kedaluwarsa dibersihkan secara berkala setiap jam melalui scheduled job `pg-boss`.
6. **Security Headers & CSRF:**
   - Integrasi middleware keamanan header: CSP ketat, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
   - Pemeriksaan header `Origin` dan `Host` pada seluruh request mutasi HTTP (`POST`, `PATCH`, `DELETE`, `PUT`) dan handshake WebSocket.

### 5.4. Sanitasi Ekspor CSV (Anti Formula Injection)

Sanitasi dilakukan dengan urutan: netralisasi formula injection terlebih dahulu, dilanjutkan dengan standard CSV RFC 4180 quoting. Kolom angka tidak diberi prefix kutip.

```typescript
export function sanitizeCsvValue(value: unknown, isNumericColumn: boolean = false): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Jika kolom teks dan diawali karakter formula spreadsheet
  if (!isNumericColumn && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`; // Netralisasi dengan prefix single quote
  }

  // Quoting jika mengandung koma, kutip dua, newline, atau carriage return
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
```

---

## 6. Arsitektur Data & Persistensi (PostgreSQL & Drizzle)

### 6.1. Skema Database Drizzle Relasional

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE http_method AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD');
CREATE TYPE health_status AS ENUM ('UNKNOWN', 'UP', 'DEGRADED', 'DOWN', 'PAUSED');
CREATE TYPE failure_category AS ENUM (
    'DNS_RESOLUTION_FAILED',
    'SSRF_BLOCKED',
    'CONNECTION_REFUSED',
    'CONNECTION_TIMEOUT',
    'TLS_HANDSHAKE_FAILED',
    'HTTP_STATUS_MISMATCH',
    'RESPONSE_SIZE_EXCEEDED',
    'HEADER_ASSERTION_FAILED',
    'BODY_JSON_INVALID',
    'BODY_ASSERTION_FAILED',
    'REDIRECT_NOT_ALLOWED',
    'EXECUTION_ABORTED'
);
CREATE TYPE trigger_type AS ENUM ('SCHEDULED', 'MANUAL');

-- Identity & Access
CREATE TABLE users (
    id UUID PRIMARY KEY, -- Application generated UUID v7
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_single_owner_guard ON users ((true));

CREATE TABLE sessions (
    id UUID PRIMARY KEY, -- UUID v7
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- Rate Limiter Persistence
CREATE TABLE rate_limits (
    key VARCHAR(255) PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 1,
    expire_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_rate_limits_expire ON rate_limits(expire_at);

-- Monitoring Core
CREATE TABLE monitors (
    id UUID PRIMARY KEY, -- UUID v7
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    method http_method NOT NULL DEFAULT 'GET',
    encrypted_headers TEXT,          -- v1:keyId:nonce:ct (Libsodium AEAD)
    header_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    encrypted_body TEXT,             -- v1:keyId:nonce:ct
    encrypted_auth_config TEXT,      -- v1:keyId:nonce:ct
    assertion_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    interval_seconds INTEGER NOT NULL DEFAULT 300,
    timeout_ms INTEGER NOT NULL DEFAULT 10000,
    is_active BOOLEAN NOT NULL DEFAULT true,
    health_status health_status NOT NULL DEFAULT 'UNKNOWN',
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    consecutive_successes INTEGER NOT NULL DEFAULT 0,
    current_incident_id UUID,
    version INTEGER NOT NULL DEFAULT 1, -- Optimistic locking
    last_checked_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_monitor_interval CHECK (interval_seconds >= 60 AND interval_seconds <= 86400),
    CONSTRAINT chk_monitor_timeout CHECK (timeout_ms >= 1000 AND timeout_ms <= 30000)
);
CREATE INDEX idx_monitors_due ON monitors(next_run_at) WHERE is_active = true;

-- Incidents
CREATE TABLE incidents (
    id UUID PRIMARY KEY, -- UUID v7
    monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recovered_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    cause_category failure_category NOT NULL,
    initial_error_message TEXT NOT NULL,
    failure_count INTEGER NOT NULL DEFAULT 1,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Jaminan ketat: Hanya boleh ada maksimal 1 insiden terbuka per monitor!
CREATE UNIQUE INDEX uq_incidents_one_open ON incidents(monitor_id) WHERE is_resolved = false;
CREATE INDEX idx_incidents_monitor_id ON incidents(monitor_id);

-- Foreign key kembali ke monitors.current_incident_id
ALTER TABLE monitors ADD CONSTRAINT fk_monitors_current_incident 
    FOREIGN KEY (current_incident_id) REFERENCES incidents(id) ON DELETE SET NULL;

-- Historical Check Results (Range Partitioning by Month)
CREATE TABLE check_results (
    id UUID NOT NULL, -- UUID v7
    monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
    trigger_type trigger_type NOT NULL DEFAULT 'SCHEDULED', -- 'SCHEDULED' | 'MANUAL' (D-13)
    scheduled_for TIMESTAMPTZ,                              -- Waktu seharusnya dieksekusi (D-12)
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),          -- Waktu probe dimulai (D-12)
    finished_at TIMESTAMPTZ,                                -- Waktu probe selesai (D-12)
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),         -- Partition Key
    duration_ms INTEGER NOT NULL,
    is_success BOOLEAN NOT NULL,
    status_code INTEGER,
    failure_category failure_category,
    pinned_ip VARCHAR(45),                                  -- IP hasil DNS IP-pinning SSRF (D-11)
    assertion_results JSONB NOT NULL DEFAULT '[]'::jsonb,
    diagnostics JSONB,                                      -- Request/response headers disanitasi, body <= 5KB (D-11)
    sanitized_diagnostic TEXT,
    correlation_id UUID,                                    -- Correlation ID terdistribusi (D-12)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, executed_at)
) PARTITION BY RANGE (executed_at);

-- Partisi Bulanan (Dibuat via SQL Migration Khusus + Job Maintenance, D-06)
CREATE TABLE check_results_y2026m10 PARTITION OF check_results
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');
CREATE TABLE check_results_y2026m11 PARTITION OF check_results
    FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

-- Partisi DEFAULT sebagai jaring pengaman agar operasi INSERT tidak pernah crash (D-06)
CREATE TABLE check_results_default PARTITION OF check_results DEFAULT;

-- Indeks komposit optimal untuk query riwayat dan metrik
CREATE INDEX idx_check_results_metrics ON check_results(monitor_id, executed_at DESC)
    INCLUDE (is_success, duration_ms, status_code, trigger_type);
CREATE INDEX idx_check_results_incident ON check_results(incident_id);

-- Hourly Rollup Summary (Untuk performa query rentang 30 hari)
CREATE TABLE monitor_metrics_hourly (
    monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    bucket TIMESTAMPTZ NOT NULL,
    total_checks INTEGER NOT NULL,
    success_checks INTEGER NOT NULL,
    avg_latency_ms INTEGER NOT NULL,
    p95_latency_ms INTEGER NOT NULL,
    p99_latency_ms INTEGER NOT NULL,
    PRIMARY KEY (monitor_id, bucket)
);

-- Alerting Configuration
CREATE TABLE notification_configs (
    id UUID PRIMARY KEY,
    channel VARCHAR(50) NOT NULL UNIQUE DEFAULT 'TELEGRAM',
    chat_id VARCHAR(100) NOT NULL,
    encrypted_bot_token TEXT NOT NULL, -- v1:keyId:nonce:ct
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification Delivery Audit Trail (Sesuai PRD §4.18)
CREATE TYPE delivery_status AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE notification_deliveries (
    id UUID PRIMARY KEY, -- UUID v7
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL DEFAULT 'TELEGRAM',
    notification_type VARCHAR(50) NOT NULL, -- 'INCIDENT_OPENED' atau 'INCIDENT_RECOVERED'
    status delivery_status NOT NULL DEFAULT 'PENDING',
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    safe_error_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notification_deliveries_incident ON notification_deliveries(incident_id);
CREATE INDEX idx_notification_deliveries_status ON notification_deliveries(status) WHERE status = 'PENDING';

-- Worker Heartbeat Monitoring
CREATE TABLE worker_heartbeats (
    worker_id VARCHAR(100) PRIMARY KEY,
    last_seen_at TIMESTAMPTZ NOT NULL,
    running_jobs INTEGER NOT NULL DEFAULT 0
);
```

### 6.2. Agregasi Metrik SQL Time-Bucket (`date_bin` & Percentiles)

Menggunakan fungsi PostgreSQL 14+ `date_bin()` untuk bucket waktu akurat dan `percentile_cont` untuk menghitung latency p95 / p99:

```sql
-- Query agregasi bucket 24 jam (interval 5 menit)
SELECT 
    date_bin('5 minutes', executed_at, TIMESTAMPTZ '2026-01-01 00:00:00Z') AS bucket,
    COUNT(*)::integer AS total_checks,
    COUNT(*) FILTER (WHERE is_success = true)::integer AS success_checks,
    ROUND((COUNT(*) FILTER (WHERE is_success = true)::numeric / COUNT(*)::numeric) * 100, 2) AS uptime_percentage,
    ROUND(AVG(duration_ms) FILTER (WHERE is_success = true))::integer AS avg_latency_ms,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE is_success = true)::integer AS p95_latency_ms,
    percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE is_success = true)::integer AS p99_latency_ms
FROM check_results
WHERE monitor_id = :monitorId 
  AND executed_at >= NOW() - INTERVAL '24 hours'
GROUP BY bucket
ORDER BY bucket ASC;
```

### 6.3. Transaksi, ACID & Kontrol Konkurensi (Hybrid Concurrency Model)

Untuk menjamin konsistensi data absolut tanpa mengorbankan throughput sistem, API Sentinel mengimplementasikan **Hybrid Concurrency Model** dengan tingkat isolasi PostgreSQL standar `READ COMMITTED`:

```
+---------------------------------------------------------------------------------------------------+
| HYBRID CONCURRENCY ARCHITECTURE                                                                   |
|                                                                                                   |
|  [Worker Probe Run & Incident Transition]              [User CRUD Config Mutation]                |
|  - Highly concurrent, automated                        - Low frequency, browser user              |
|  - Strategy: PESSIMISTIC LOCKING                       - Strategy: OPTIMISTIC CONCURRENCY (OCC)   |
|                                                                                                   |
|  BEGIN TRANSACTION (READ COMMITTED);                   BEGIN TRANSACTION;                         |
|  SELECT * FROM monitors                                UPDATE monitors                            |
|    WHERE id = :id FOR UPDATE;                          SET name = :name,                          |
|  -- Row terkunci: cegah balapan worker                    interval_seconds = :interval,           |
|  INSERT INTO check_results (...);                         version = version + 1                   |
|  UPDATE monitors SET                                   WHERE id = :id AND version = :expVersion;  |
|    health_status = :newStatus,                         -- Jika rowsAffected === 0:                |
|    consecutive_failures = :cf,                         -- THROW ConflictException (HTTP 409)      |
|    version = version + 1;                              COMMIT;                                    |
|  IF statusChanged THEN                                                                            |
|    INSERT/UPDATE incidents (...);                                                                 |
|    // QueuePort adapter via fromDrizzle(tx, sql) (D-01, D-02)                                     |
|    await queuePort.send('notification:send', payload, {                                           |
|      singletonKey: `${incidentId}:${type}`,                                                       |
|      tx                                                                                           |
|    });                                                                                            |
|  END IF;                                                                                          |
|  COMMIT;                                                                                          |
+---------------------------------------------------------------------------------------------------+
```

#### A. Transaksi Unit of Work (UoW) Eksekusi Probe Worker
1. **Pessimistic Row Lock (`SELECT ... FOR UPDATE`):**
   Saat probe worker menyelesaikan HTTP request, worker membuka transaksi database dan mengunci baris `monitors` spesifik tersebut. Mengunci baris mencegah dua probe bersamaan (misal jadwal otomatis berkala bertabrakan dengan manual check on-demand yang ditrigger user) memperbarui counter kegagalan secara tumpang tindih.
2. **Atomisitas Transaksional Penuh (All-or-Nothing ACID):**
   Seluruh operasi persistensi hasil probe dieksekusi dalam **satu transaksi database tunggal (Unit of Work)**:
   - Penyimpanan baris riwayat ke tabel partisi `check_results`.
   - Mutasi state monitor (`health_status`, `consecutive_failures`, `consecutive_successes`, `current_incident_id`, `last_checked_at`, `next_run_at`, inkremen `version`).
   - Pembuatan atau penutupan record pada tabel `incidents` (jika ambang batas gagal/sukses tercapai).
   - Enqueue job notifikasi Telegram ke antrean `pg-boss` via `QueuePort` dengan adapter `fromDrizzle(tx, sql)` (D-01) menggunakan queue policy `stately` (D-02) (Transactional Outbox Pattern). Return `null` pada `send()` ditangani secara anggun sebagai job duplikat yang ditolak policy.
3. **Rollback Semantics:**
   Jika terjadi kegagalan sistem di tengah eksekusi (misalnya disk failure, constraint error, atau koneksi DB terputus), PostgreSQL membatalkan seluruh transaksi secara atomik. Tidak ada *ghost incident*, tidak ada data riwayat yatim (*orphaned results*), dan tidak ada notifikasi palsu yang terkirim ke antrean.

#### B. Optimistic Concurrency Control (OCC) pada Web API Mutasi User
1. Tabel `monitors` memiliki kolom `version INTEGER NOT NULL DEFAULT 1`.
2. Saat user membuka form edit di Nuxt UI, nilai `version` disertakan dalam state form.
3. Saat user menyimpan perubahan via `PATCH /api/monitors/:id`, query repository mengeksekusi conditional update:
   ```sql
   UPDATE monitors
   SET name = :name, url = :url, interval_seconds = :interval, version = version + 1, updated_at = NOW()
   WHERE id = :id AND version = :clientVersion;
   ```
4. Jika baris yang ter-update berjumlah `0`, sistem mendeteksi tabrakan mutasi konkuren (misal monitor diubah di tab browser lain secara bersamaan) dan melemparkan `ConflictException` (HTTP 409) yang meminta user me-refresh data terkini.

---

### 6.4. Audit Normalisasi Database (3NF) & Denormalisasi Pragmatis

Desain skema relasional API Sentinel mengadopsi baseline **Third Normal Form (3NF)** dengan denormalisasi terukur yang dijustifikasi secara ketat untuk performa $O(1)$ loop pemantauan:

#### A. Kepatuhan Baseline 3NF
- **First Normal Form (1NF):** Seluruh baris memiliki Primary Key unik (UUID v7 urut waktu), dan setiap kolom menyimpan nilai atomik sesuai tipe datanya (tipe data skalar Postgres, ENUM, atau ciphertext).
- **Second Normal Form (2NF):** Tidak ada ketergantungan parsial pada primary key komposit. Pada tabel partisi `check_results(id, executed_at)` dan `monitor_metrics_hourly(monitor_id, bucket)`, seluruh kolom non-key bergantung penuh secara fungsional pada keseluruhan composite key.
- **Third Normal Form (3NF):** Tidak ada ketergantungan transitif antar kolom non-key. Kunci asing (`user_id`, `monitor_id`, `incident_id`) dinormalisasi secara independen dengan constraint integritas referensial (`ON DELETE CASCADE` atau `ON DELETE SET NULL`).

#### B. Denormalisasi Pragmatis Terjustifikasi

| Kolom / Tabel | Lokasi Denormalisasi | Alasan Arsitektural & Justifikasi Performa |
|---|---|---|
| `assertion_rules` | `monitors.assertion_rules` (JSONB) | **Eliminasi JOIN $O(1)$ pada Worker Loop:** Worker mengeksekusi probe setiap detik. Mengambil aturan assertion langsung dari satu baris monitor menghindari query `JOIN` ke tabel anak pada setiap siklus eksekusi. Format JSONB juga memungkinkan penambahan tipe assertion baru tanpa perlu migrasi DDL database. Skema JSON divalidasi ketat oleh Zod di domain layer. |
| `consecutive_failures` & `consecutive_successes` | `monitors` (Kolom Langsung) | **Eliminasi Window Function Berat:** Tanpa kolom ini, worker harus melakukan agregasi `SELECT COUNT(*) FROM check_results ... ORDER BY executed_at DESC` untuk menentukan transisi insiden (UP $\leftrightarrow$ DOWN). Counter langsung memungkinkan evaluasi state machine instan dalam memori dan single-row update. |
| `monitor_metrics_hourly` | Tabel Agregasi Terpisah | **Optimasi Query Dashboard 30 Hari:** Query agregasi `percentile_cont` pada jutaan baris `check_results` partisi membutuhkan pemindaian I/O masif. Worker rollup periodik mengagregasi data per jam ke tabel ini sehingga dashboard dapat menampilkan chart latensi dan uptime 30 hari secara sub-100ms. |
| `header_keys` | `monitors.header_keys` (JSONB) | **Audit Tampilan Tanpa Dekripsi:** Menyimpan daftar nama header HTTP (misal `["Authorization", "X-Api-Key"]`) tanpa membocorkan nilai rahasianya. Memungkinkan UI menampilkan daftar header terpasang tanpa memanggil pustaka kriptografi Libsodium untuk mendekripsi ciphertext. |

---

## 7. Arsitektur Antrean & Worker (pg-boss Engine)

### 7.1. Siklus Kerja pg-boss & Pencegahan Balapan

```
+---------------------------------------------------------------------------------------+
| apps/worker Daemon Process                                                            |
|                                                                                       |
|  A. Scheduler Loop (Setiap 5 detik):                                                  |
|     1. Transaksi Database:                                                            |
|        SELECT id FROM monitors                                                        |
|        WHERE is_active = true AND next_run_at <= NOW()                                |
|        FOR UPDATE SKIP LOCKED                                                         |
|        LIMIT 50;                                                                      |
|     2. Untuk setiap monitor yang berhasil di-claim:                                    |
|        - Hitung next_run_at = NOW() + (interval_seconds * interval '1 second')        |
|          + jitter (± 5% acak untuk anti-thundering herd).                             |
|        - Update monitors SET next_run_at = :nextRunAt WHERE id = :id;                |
|        - Dispatch job ke pg-boss via QueuePort fromDrizzle(tx, sql) (D-01, D-02):     |
|          const jobId = await queuePort.send('probe:check', { monitorId: id }, {       |
|            singletonKey: id, // queue policy 'stately' menjamin max 1 active/queued   |
|            tx                                                                         |
|          });                                                                          |
|          // Jika jobId === null, job telah ada di antrean (deduplikasi policy sukses) |
|     3. Commit Transaksi.                                                              |
|                                                                                       |
|  B. Probe Worker Pool ('probe:check', concurrency: 20):                               |
|     1. pg-boss worker menerima batch jobs: work('probe:check', async (jobs) => ...).  |
|     2. Re-verify status monitor: Pastikan monitor masih aktif dan belum dihapus.      |
|     3. Eksekusi NodeHttpSsrfProbeAdapter.                                             |
|     4. Evaluasi AssertionEngine (safe AST parser).                                    |
|     5. Transaksi Unit of Work:                                                        |
|        - Kunci row monitor: SELECT * FROM monitors WHERE id = :id FOR UPDATE;         |
|        - Update counters & health status (evaluasi state machine).                    |
|        - Simpan entitas CheckResult.                                                  |
|        - Jika status berubah (Incident Opened / Recovered):                           |
|          - Buat/update record di tabel 'incidents'.                                   |
|          - Insert audit record di 'notification_deliveries' (status: 'PENDING').      |
|          - Push job 'notification:send' ke pg-boss via queuePort (fromDrizzle)        |
|            policy 'stately' + singletonKey: `${incidentId}:${type}` dengan { tx }.    |
|        - Emit PostgreSQL NOTIFY sentinel_events, '{"type":"CHECK_COMPLETED",...}'.    |
|     6. Commit Transaksi Unit of Work.                                                 |
|                                                                                       |
|  C. Notification Worker Pool ('notification:send', concurrency: 5):                   |
|     1. Ambil config bot Telegram & dekripsi token via Libsodium AAD.                  |
|     2. Format teks MarkdownV2 (nama monitor & error disanitasi).                      |
|     3. Kirim ke Telegram Bot API:                                                     |
|        - Sukses: Update 'notification_deliveries' status = 'SENT', last_attempt_at.   |
|        - Gagal: Update status = 'FAILED', retry_count++, safe_error_summary.          |
|     4. Tangani error 429: Baca header 'retry_after', set retry delay pada pg-boss.     |
+---------------------------------------------------------------------------------------+
```

### 7.2. Inter-Process Event Bus & Reconnect Resync Protocol

1. `apps/worker` menerbitkan event via PostgreSQL `NOTIFY sentinel_events, payload`.
2. `apps/web` (Nitro plugin) membuka satu dedicated connection `pg.Client` dan menjalankan `LISTEN sentinel_events`.
3. Event yang diterima di-broadcast ke browser melalui WebSocket `crossws`.
4. **Batas Payload & Resync Reconnection:**
   - PostgreSQL `NOTIFY` memiliki batas payload 8,000 byte. Payload hanya mengirimkan metadata ringan (contoh: `{ type: 'CHECK_COMPLETED', monitorId: '...', status: 'UP' }`).
   - Jika koneksi WebSocket browser atau koneksi `pg.Client` putus, event selama masa disconnect akan hilang. Oleh karena itu, pada saat koneksi WebSocket berhasil **reconnect**, client browser secara otomatis memicu invalidasi query global (`queryClient.invalidateQueries()`) untuk men-sinkronisasi ulang seluruh status dashboard dari REST API.

---

## 8. Arsitektur Web Frontend (Nuxt & Nuxt UI)

### 8.1. Strategi Rendering Hybrid & Layout

Konfigurasi `nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  compatibilityDate: '2026-10-22',
  future: {
    compatibilityVersion: 4 // Nuxt 4 structure (app/ directory layout)
  },
  modules: [
    '@nuxt/ui'
  ],
  routeRules: {
    '/login': { ssr: true },
    '/dashboard/**': { ssr: false }, // Client-Only SPA
    '/api/**': { cors: false }
  },
  nitro: {
    preset: 'node-server',
    experimental: {
      websocket: true // Cross-WS engine
    }
  },
  build: {
    transpile: [
      '@sentinel/domain',
      '@sentinel/application',
      '@sentinel/infra',
      '@sentinel/contracts'
    ]
  }
});
```

### 8.2. Integrasi State Management (TanStack Query)

Plugin manual `app/plugins/vue-query.ts` mengintegrasikan `@tanstack/vue-query`:

```typescript
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';

export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 10, // 10 detik
        refetchOnWindowFocus: true,
        retry: 1
      }
    }
  });

  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });

  return {
    provide: { queryClient }
  };
});
```

### 8.3. Visualisasi Grafik Metrik (`<UChart>`)

Visualisasi grafik latency dan persentase uptime menggunakan komponen bawaan Nuxt UI v4 **`<UChart>`** (berbasis TanStack Charts) yang terintegrasi langsung dengan design system dan mendukung render SVG responsif. Untuk visualisasi kompleks khusus (seperti visualisasi korelasi latency tingkat lanjut), fallback menggunakan Nuxt Charts (Unovis).

---

## 9. Kontrak API & Standar Respons

### 9.1. Format Error Standar (RFC 9457 Problem Details) & Hirarki Domain Exception

Untuk menjaga pemisahan boundary DDD yang bersih dan pengalaman developer yang terstandarisasi, seluruh layer `domain` dan `application` mengekspresikan kondisi kegagalan melalui **Typed Domain Exceptions** yang kemudian diterjemahkan oleh Nitro API hook menjadi representasi standar industri **RFC 9457 (`application/problem+json`)**.

#### A. Hirarki Domain Exception (`packages/domain/src/errors/`)

```typescript
// packages/domain/src/errors/DomainException.ts
export abstract class DomainException extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorType: string;
  abstract readonly title: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EntityNotFoundException extends DomainException {
  readonly statusCode = 404;
  readonly errorType = 'entity-not-found';
  readonly title = 'Entitas Tidak Ditemukan';
}

export class ValidationException extends DomainException {
  readonly statusCode = 400;
  readonly errorType = 'validation-failed';
  readonly title = 'Validasi Input Gagal';

  constructor(
    message: string,
    public readonly invalidParams: Array<{ name: string; reason: string }> = []
  ) {
    super(message);
  }
}

export class SSRFBlockedException extends DomainException {
  readonly statusCode = 422;
  readonly errorType = 'ssrf-blocked';
  readonly title = 'Kebijakan Keamanan SSRF Terlanggar';
}

export class InvalidCredentialsException extends DomainException {
  readonly statusCode = 401;
  readonly errorType = 'invalid-credentials';
  readonly title = 'Autentikasi Gagal';
}

export class ConflictException extends DomainException {
  readonly statusCode = 409;
  readonly errorType = 'conflict-version-mismatch';
  readonly title = 'Konflik Konkurensi Versi';
}

export class RateLimitExceededException extends DomainException {
  readonly statusCode = 429;
  readonly errorType = 'rate-limit-exceeded';
  readonly title = 'Batas Laju Permintaan Terlampaui';

  constructor(message: string, public readonly retryAfterSeconds: number) {
    super(message);
  }
}

export class ForbiddenException extends DomainException {
  readonly statusCode = 403;
  readonly errorType = 'forbidden-access';
  readonly title = 'Akses Dilarang';
}
```

#### B. Nitro Global Error Handler (`apps/web/server/plugins/error-handler.ts`)

Global plugin menangkap exception dari use-case layer, memetakan status HTTP, mengatur header `Content-Type: application/problem+json`, dan secara ketat menghilangkan detail internal/stack trace di mode produksi:

```typescript
import { defineNitroPlugin } from 'nitropack/runtime';
import { DomainException, ValidationException, RateLimitExceededException } from '@sentinel/domain';
import { logger } from '../utils/logger';

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', async (error, { event }) => {
    if (!event) return;

    let statusCode = 500;
    let type = 'https://api-sentinel.local/errors/internal-error';
    let title = 'Internal Server Error';
    let detail = 'Terjadi kesalahan sistem internal yang tidak terduga.';
    let invalidParams: Array<{ name: string; reason: string }> | undefined;

    if (error instanceof DomainException) {
      statusCode = error.statusCode;
      type = `https://api-sentinel.local/errors/${error.errorType}`;
      title = error.title;
      detail = error.message;

      if (error instanceof ValidationException) {
        invalidParams = error.invalidParams;
      }
      if (error instanceof RateLimitExceededException) {
        setResponseHeader(event, 'Retry-After', error.retryAfterSeconds);
      }
    } else {
      // Catat error 500 unhandled dengan Pino redactor
      logger.error({ err: error, path: event.path }, 'Unhandled server exception occurred');
    }

    setResponseStatus(event, statusCode);
    setResponseHeader(event, 'Content-Type', 'application/problem+json');

    const problemPayload: Record<string, unknown> = {
      type,
      title,
      status: statusCode,
      detail,
      instance: event.path
    };

    if (invalidParams && invalidParams.length > 0) {
      problemPayload.invalidParams = invalidParams;
    }

    // Stack trace HANYA disertakan di mode development
    if (process.env.NODE_ENV !== 'production' && error.stack) {
      problemPayload.debug = { stack: error.stack };
    }

    await send(event, JSON.stringify(problemPayload));
  });
});
```

#### C. Contoh Payload Respons RFC 9457

```json
{
  "type": "https://api-sentinel.local/errors/validation-failed",
  "title": "Validasi Input Gagal",
  "status": 400,
  "detail": "URL target berada pada rentang subnet privat yang dilarang.",
  "instance": "/api/monitors",
  "invalidParams": [
    {
      "name": "url",
      "reason": "Alamat IP privat (192.168.1.1) diblokir oleh kebijakan SSRF."
    }
  ]
}
```

### 9.2. Format Paginasi Kursor Terstandarisasi

Semua endpoint riwayat menggunakan paginasi berbasis kursor (UUID v7 / timestamp) untuk menjaga stabilitas query pada dataset jutaan baris:

```json
{
  "data": [ ... ],
  "pagination": {
    "limit": 50,
    "hasMore": true,
    "nextCursor": "0192e21b-8a21-7000-8b1a-98df76123456"
  }
}
```

### 9.3. Daftar Endpoint REST API

| Metode | Path | Deskripsi |
|---|---|---|
| `POST` | `/api/auth/login` | Login pemilik aplikasi & pemberian cookie sesi. Rate-limited. |
| `POST` | `/api/auth/logout` | Revoke sesi aktif & hapus cookie. |
| `GET` | `/api/auth/me` | Ambil status sesi aktif. |
| `GET` | `/api/monitors` | Ambil daftar monitor dengan filter status & search (menyertakan field `sparkline` 20 titik latensi per monitor, D-19). |
| `POST` | `/api/monitors` | Buat monitor baru. Validasi Zod & enkripsi rahasia. |
| `POST` | `/api/monitors/test` | Uji coba konfigurasi monitor (*dry-run*) tanpa menyimpan ke DB. Rate-limit Tier 2 (D-10). |
| `GET` | `/api/monitors/:id` | Detail monitor (kredensial disanitasi). |
| `PATCH` | `/api/monitors/:id` | Perbarui konfigurasi monitor. |
| `DELETE` | `/api/monitors/:id` | Hapus permanen monitor (hard delete cascade) & batalkan jadwal pg-boss (D-17). |
| `POST` | `/api/monitors/:id/pause` | Jeda pemantauan (batalkan jadwal, simpan riwayat data). |
| `POST` | `/api/monitors/:id/resume` | Lanjutkan pemantauan. |
| `POST` | `/api/monitors/:id/check` | Trigger pemeriksaan manual on-demand (disimpan di riwayat tapi tidak ubah status insiden, D-13). |
| `GET` | `/api/monitors/:id/checks` | Riwayat pemeriksaan terpaginasi kursor. |
| `GET` | `/api/monitors/:id/metrics` | Metrik time-bucket agregasi (24h, 7d, 30d per monitor). |
| `GET` | `/api/checks/recent` | Feed riwayat pemeriksaan terbaru lintas seluruh monitor untuk dashboard DES §5.2 (D-19). |
| `GET` | `/api/metrics/summary` | Ringkasan agregat metrik dashboard (total monitor, breakdown UP/DEGRADED/DOWN, insiden terbuka, avg uptime/latency). |
| `GET` | `/api/metrics/latency` | Metrik grafik latensi komposit multi-monitor untuk dashboard DES §5.2 (`?range=24h\|7d\|30d`, D-19). |
| `GET` | `/api/incidents` | Daftar insiden terbuka dan terselesaikan. |
| `GET` | `/api/incidents/:id` | Detail insiden & riwayat kegagalan (termasuk ringkasan status `notificationDeliveries`, D-19). |
| `GET` | `/api/reports/export.csv` | Stream file CSV via cursor PostgreSQL dengan sanitasi formula (query param: `type=checks\|incidents`, `monitorId`, `from`, `to` UTC divalidasi Zod, D-18). |
| `PUT` | `/api/settings/account/password` | Ubah password pemilik (verifikasi password lama, hash Argon2id, revoke sesi lain, D-09). |
| `GET` | `/api/settings/telegram` | Status konfigurasi Telegram (tanpa token). |
| `PUT` | `/api/settings/telegram` | Simpan/ubah token bot & chat ID (token dienkripsi). |
| `POST` | `/api/settings/telegram/test` | Kirim notifikasi percobaan ke bot Telegram. |
| `GET` | `/healthz` | Liveness check (HTTP 200 jika web process hidup). |
| `GET` | `/readyz` | Readiness check (HTTP 200 jika koneksi DB siap). |
| `GET` | `/metrics` | Prometheus metrics endpoint. |

### 9.4. Kontrak Protokol WebSocket (`/api/ws`)

Koneksi WebSocket client-to-server:
- **Handshake:** Validasi session cookie saat handshake upgrade socket.
- **Client Message:** `{ "action": "subscribe", "monitorId": "UUID" }`.
- **Server Broadcast Messages:**
  ```json
  // Check Completed
  {
    "event": "CHECK_COMPLETED",
    "monitorId": "0192e21b-8a21-7000-8b1a-98df76123456",
    "status": "UP",
    "durationMs": 142,
    "executedAt": "2026-10-22T10:00:00.000Z"
  }

  // Incident State Transition
  {
    "event": "INCIDENT_TRANSITION",
    "monitorId": "0192e21b-8a21-7000-8b1a-98df76123456",
    "incidentId": "0192e21b-8a30-7000-8b1b-123456789abc",
    "type": "OPENED", // atau "RECOVERED"
    "healthStatus": "DOWN",
    "timestamp": "2026-10-22T10:05:00.000Z"
  }
  ```

### 9.5. Arsitektur Observabilitas & Distributed Tracing (OpenTelemetry)

Untuk menjawab kebutuhan penelusuran latensi dan penentuan sumber keterlambatan (*root cause latency*), sistem mengimplementasikan **OpenTelemetry (OTel)** Node.js SDK (`@opentelemetry/sdk-node` v0.300.0) dengan propagasi konteks trace W3C (`traceparent`).

#### A. Alur Propagasi Konteks Trace (Web $\leftrightarrow$ Worker $\leftrightarrow$ DB)

```
[Browser / Nitro Web]
       |  (Manual Check Trigger / Scheduled Run)
       v
Inject W3C traceparent ("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
ke dalam payload job pg-boss: { monitorId, __traceparent: "..." }
       |
       v
[pg-boss PostgreSQL Queue]
       |
       |  (Worker memproses job dan mengekstrak __traceparent)
       v
[apps/worker Daemon]
       |
       +---> Span: "queue.wait_duration" (Waktu antre sebelum dieksekusi)
       |
       +---> Span: "probe.dns_lookup" (Waktu resolusi custom DNS IP-pinning)
       |
       +---> Span: "probe.tcp_connect" (Waktu TCP socket handshake)
       |
       +---> Span: "probe.tls_handshake" (Waktu TLS certificate negotiation)
       |
       +---> Span: "probe.response_transfer" (Waktu transfer stream body respons)
       |
       +---> Span: "assertion.evaluation" (Waktu parse JSONPath & rules)
       |
       +---> Span: "db.transaction.save" (Waktu simpan Drizzle UoW ke PostgreSQL)
       |
       +---> Span: "notification.telegram_send" (Waktu dispatch notifikasi)
```

**Diagnostik Sumber Keterlambatan:**
- `probe.response_transfer` dominan $\to$ API target memang lambat/overload.
- `queue.wait_duration` tinggi $\to$ Worker pool jenuh (kurang konkurensi atau worker crash).
- `db.transaction.save` tinggi $\to$ Disk I/O database atau lock contention pada PostgreSQL.
- `notification.telegram_send` tinggi $\to$ Latensi eksternal dari Telegram API.

#### B. Daftar Metrik Prometheus Resmi (`/metrics`)

| Nama Metrik | Tipe | Label | Deskripsi |
|---|---|---|---|
| `sentinel_probe_duration_ms` | Histogram | `monitor_id`, `status` | Distribusi durasi probe HTTP (bucket: 50, 100, 250, 500, 1000, 2500, 5000, 10000 ms). |
| `sentinel_probe_total` | Counter | `monitor_id`, `status`, `cause_category` | Total pemeriksaan yang dieksekusi per monitor dan kategori kegagalan. |
| `sentinel_incidents_active` | Gauge | `monitor_id` | Jumlah insiden yang saat ini berstatus terbuka (1 jika DOWN, 0 jika UP). |
| `sentinel_worker_job_lag_seconds` | Gauge | `queue` | Selisih detik antara `next_run_at` yang dijadwalkan dengan waktu aktual eksekusi worker. |
| `sentinel_worker_heartbeat_timestamp` | Gauge | `worker_id` | Waktu epoch heartbeat terakhir worker (untuk deteksi Dead-Man's Switch). |

#### C. Alerting & Dead-Man's Switch Rules

Proses worker (`apps/worker`) mengoperasikan listener HTTP mandiri berbasis core `node:http` pada port `3001` (dikonfigurasi via `WORKER_PORT`) untuk mengekspos rute `/metrics` dan `/healthz`. Daemon worker memancarkan detak (*heartbeat*) secara periodik setiap **15 detik** (`HEARTBEAT_INTERVAL_SECONDS=15`) ke tabel `worker_heartbeats` dan memperbarui gauge `sentinel_worker_heartbeat_timestamp`. Ambang batas evaluasi PromQL `> 60` detik memberikan toleransi kegagalan 4 siklus detak sebelum alert kritis terpicu.

Aturan PromQL untuk memicu alert jika worker mati atau terjadi backlog:
```yaml
groups:
  - name: sentinel_alerts
    rules:
      - alert: SentinelWorkerDown
        expr: (time() - sentinel_worker_heartbeat_timestamp) > 60
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Worker API Sentinel berhenti berdetak (Dead-Man's Switch)"
      - alert: SentinelHighJobLag
        expr: sentinel_worker_job_lag_seconds > 30
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Antrean pemantauan mengalami backlog lebih dari 30 detik"
```

---

## 10. Konfigurasi Environment & Validasi Boot

Aplikasi memvalidasi seluruh environment variable saat startup menggunakan Zod. Jika variabel wajib tidak ada atau tidak valid, aplikasi **gagal booting seketika (Fail-Fast)**:

```typescript
import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  WORKER_PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  APP_KEYRING: z.string().refine((val) => {
    try {
      const parsed = JSON.parse(val);
      return parsed.activeKeyId && parsed.keys && parsed.keys[parsed.activeKeyId];
    } catch {
      return false;
    }
  }, 'APP_KEYRING wajib berupa JSON valid berisi activeKeyId dan daftar keys 32-byte.'),
  // Digunakan untuk cookie signing dan HMAC-SHA256 token hash (D-20)
  SESSION_SECRET: z.string().min(32),
  TRUSTED_PROXIES: z.string().default('127.0.0.1,::1'),
  HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().default(15),
  CHECK_RETENTION_DAYS: z.coerce.number().default(90),
  TELEGRAM_API_BASE_URL: z.string().url().default('https://api.telegram.org'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default('api-sentinel'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')
});
```

### Template `.env.example`
```ini
# Environment Runtime
NODE_ENV=production
PORT=3000
WORKER_PORT=3001

# Database PostgreSQL
DATABASE_URL=postgres://sentinel_user:sentinel_password@localhost:5432/api_sentinel

# Enkripsi Simetris Libsodium (JSON Keyring berisi key 32-byte base64)
# Generate key via: bun -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
APP_KEYRING={"activeKeyId":"k1","keys":{"k1":"32ByteBase64KeyStringHere==============="}}

# Session & Security (Cookie signing + HMAC-SHA256 session token pepper)
SESSION_SECRET=min32CharactersLongCryptographicallySecureStringForCookieSigningAndHMAC
TRUSTED_PROXIES=127.0.0.1,10.0.0.0/8

# Worker & Background Tasks
HEARTBEAT_INTERVAL_SECONDS=15
CHECK_RETENTION_DAYS=90
TELEGRAM_API_BASE_URL=https://api.telegram.org

# Observability & Tracing
LOG_LEVEL=info
OTEL_SERVICE_NAME=api-sentinel
# OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```

---

## 11. Operasional, Deployment & Skalabilitas

### 11.1. Dockerfile Multi-Stage

```dockerfile
# Stage 1: Base
FROM node:24-alpine AS base
RUN corepack enable && npm install -g bun@1.3.14
WORKDIR /app

# Stage 2: Dependencies
FROM base AS dependencies
COPY package.json bun.lock bunfig.toml tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/
RUN bun install --frozen-lockfile

# Stage 3: Build Web
FROM dependencies AS build-web
WORKDIR /app/apps/web
RUN bun run build

# Stage 4: Production Web Runner
FROM node:24-alpine AS web-runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build-web /app/apps/web/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

# Stage 5: Production Worker Runner
FROM node:24-alpine AS worker-runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/packages ./packages
COPY --from=dependencies /app/apps/worker ./apps/worker
WORKDIR /app/apps/worker
EXPOSE 3001
CMD ["node", "--import", "tsx", "src/index.ts"]
```

### 11.2. Docker Compose & Urutan Boot

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: sentinel_user
      POSTGRES_PASSWORD: sentinel_password
      POSTGRES_DB: api_sentinel
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sentinel_user -d api_sentinel"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Dedicated migration init container
  db-migrate:
    build:
      context: .
      target: dependencies
    command: bun run db:migrate
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://sentinel_user:sentinel_password@postgres:5432/api_sentinel
      APP_KEYRING: ${APP_KEYRING}

  web:
    build:
      context: .
      target: web-runner
    ports:
      - "3000:3000"
    depends_on:
      db-migrate:
        condition: service_completed_successfully
    environment:
      DATABASE_URL: postgres://sentinel_user:sentinel_password@postgres:5432/api_sentinel
      APP_KEYRING: ${APP_KEYRING}
      SESSION_SECRET: ${SESSION_SECRET}

  worker:
    build:
      context: .
      target: worker-runner
    ports:
      - "3001:3001"
    depends_on:
      db-migrate:
        condition: service_completed_successfully
    environment:
      DATABASE_URL: postgres://sentinel_user:sentinel_password@postgres:5432/api_sentinel
      APP_KEYRING: ${APP_KEYRING}
      WORKER_PORT: 3001
      HEARTBEAT_INTERVAL_SECONDS: 15

volumes:
  pgdata:
```

### 11.3. Development Environment via Docker (`docker-compose.dev.yml`)

Untuk lingkungan pengembangan lokal (*developer environment*), database PostgreSQL 17, Prometheus v3.15, dan Jaeger All-In-One v1.76 dijalankan secara terisolasi via Docker:

```yaml
version: '3.8'

services:
  postgres-dev:
    image: postgres:17-alpine
    container_name: sentinel-postgres-dev
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: sentinel_user
      POSTGRES_PASSWORD: sentinel_password
      POSTGRES_DB: api_sentinel_dev
    volumes:
      - pgdata_dev:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sentinel_user -d api_sentinel_dev"]
      interval: 5s
      timeout: 5s
      retries: 5

  prometheus-dev:
    image: prom/prometheus:v3.15.1
    container_name: sentinel-prometheus-dev
    ports:
      - "9090:9090"
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--web.enable-lifecycle"
    extra_hosts:
      - "host.docker.internal:host-gateway"

  jaeger-dev:
    image: jaegertracing/all-in-one:1.76.0
    container_name: sentinel-jaeger-dev
    ports:
      - "16686:16686" # Web UI
      - "4318:4318"   # OTLP HTTP receiver
    environment:
      - COLLECTOR_OTLP_ENABLED=true

volumes:
  pgdata_dev:
```

#### File Konfigurasi Scrape Prometheus (`infra/prometheus/prometheus.yml`):
```yaml
global:
  scrape_interval: 5s
  evaluation_interval: 5s

scrape_configs:
  - job_name: "api_sentinel_web"
    metrics_path: "/metrics"
    static_configs:
      - targets: ["host.docker.internal:3000"]
        labels:
          app: "web"

  - job_name: "api_sentinel_worker"
    metrics_path: "/metrics"
    static_configs:
      - targets: ["host.docker.internal:3001"]
        labels:
          app: "worker"
```

**Workflow Pengembang Lokal:**
1. Jalankan infrastructure lokal: `docker compose -f docker-compose.dev.yml up -d` (PostgreSQL 17, Prometheus v3.15, dan Jaeger aktif).
2. Eksekusi migrasi skema database: `bun run db:migrate`.
3. Jalankan aplikasi web: `bun run dev:web` (Nuxt 4 dev server di `localhost:3000`).
4. Jalankan daemon worker: `bun run dev:worker` (Worker process di `localhost:3001`).
5. Buka `http://localhost:16686` untuk observasi waterfall tracing Jaeger dan `http://localhost:9090` untuk metrik operasional Prometheus.

### 11.4. Prosedur Rotasi Key Enkripsi (Zero-Downtime)

1. Generate key baru 32-byte base64 (misal ID `k2`).
2. Update environment variable `APP_KEYRING`:
   ```json
   {
     "activeKeyId": "k2",
     "keys": {
       "k1": "oldKeyBase64...",
       "k2": "newKeyBase64..."
     }
   }
   ```
3. Restart container web dan worker secara bergantian (rolling restart). Data lama yang ber-prefix `v1:k1:...` tetap dapat didekripsi menggunakan `k1`, sedangkan data baru akan dienkripsi menggunakan `k2`.
4. Jalankan script migrasi background untuk me-re-enkripsi seluruh kolom rahasia lama dari `k1` ke `k2`.
5. Setelah seluruh row selesai di-re-enkripsi, hapus `k1` dari `APP_KEYRING`.

---

## 12. Tata Kelola & Traceability (PRD Traceability & ADR)

### 12.1. Matriks Traceability: PRD User Stories $\to$ Komponen Arsitektur

| User Story PRD | Modul / Use Case | Port & Komponen |
|---|---|---|
| US 1-3 (Autentikasi & Sesi) | `AuthenticateUserUseCase`, `RevokeSessionUseCase` | `UserRepositoryPort`, `SessionRepositoryPort`, Argon2id Hasher, HttpOnly Cookie. |
| US 4-14 (Manajemen Monitor) | `CreateMonitorUseCase`, `UpdateMonitorUseCase`, `PauseMonitorUseCase` | `MonitorRepositoryPort`, `CipherPort` (Libsodium AEAD), Drizzle Repositories. |
| US 12 (Pemeriksaan Manual) | `ExecuteManualCheckUseCase` | `NetworkProbePort` (SSRF-Safe socket IP pinning). |
| US 15-17, 20 (Pemantauan & Riwayat) | `ExecuteScheduledCheckUseCase` | `pg-boss` Scheduler, `CheckResultRepositoryPort`, PostgreSQL Partitioned Tables. |
| US 18-19 (Metrik & Uptime Dashboard) | `GetMonitorMetricsUseCase`, `GetMetricsSummaryUseCase` | `CheckResultRepositoryPort`, `monitor_metrics_hourly` rollup, PostgreSQL `date_bin`. |
| US 21-25 (Manajemen Insiden) | `Monitor.recordCheckFailure()`, `Monitor.recordCheckSuccess()` | `IncidentRepositoryPort`, `uq_incidents_one_open` Unique Index. |
| US 26-29 (Notifikasi Telegram & Audit) | `DispatchNotificationUseCase` | `NotificationPort` (Telegram API Adapter), `NotificationDeliveryRepositoryPort` (`notification_deliveries`). |
| US 30 (Ekspor CSV) | `StreamCsvReportUseCase` | PostgreSQL Cursor Stream & `sanitizeCsvValue()`. |

### 12.2. Architectural Decision Records (ADR) Ringkas

1. **ADR 001: Pemilihan pg-boss daripada Redis / BullMQ**
   - *Konteks:* Sistem membutuhkan antrean penjadwalan berkala, retry, dan lock worker.
   - *Keputusan:* Menggunakan `pg-boss` v12 yang beroperasi di atas PostgreSQL yang sama.
   - *Konsekuensi:* Mengurangi kompleksitas operasional infrastructure (nol Redis), transaksi data monitor dan enqueue job terjadi secara atomik tanpa dual-write.
2. **ADR 002: Socket-Level IP Pinning via `node:http` untuk SSRF**
   - *Konteks:* URL user dapat memicu SSRF dan DNS rebinding. Undici dispatcher tidak kompatibel dengan fetch Bun.
   - *Keputusan:* Membangun custom agent `node:http`/`node:https` dengan parameter lookup `{ all: true }`.
   - *Konsekuensi:* Menjamin verifikasi seluruh record DNS, memutus TOCTOU DNS rebinding, dan mengabaikan environment proxy.
3. **ADR 003: XChaCha20-Poly1305-IETF dengan Associated Data (AAD)**
   - *Konteks:* Kredensial monitor harus dienkripsi dan tidak boleh ditukar antar baris atau kolom.
   - *Keputusan:* Menggunakan `libsodium-wrappers` AEAD dengan AAD `monitorId:fieldName`.
   - *Konsekuensi:* Keamanan kriptografis tertinggi, mendukung rotasi key via keyring tanpa downtime.
4. **ADR 004: Nuxt 4.6.x dengan Nitro `node-server` Preset**
   - *Konteks:* Kebutuhan SSR streaming, WebSockets `crossws`, dan stabilitas driver PostgreSQL `pg`.
   - *Keputusan:* Memilih Nuxt 4.6.x stable dengan preset `node-server` dieksekusi di Node.js 24 LTS (v24.11.1).
   - *Konsekuensi:* Menghindari bug streaming pada Bun preset, menjamin kompatibilitas `pg-boss` dan `pg.Client` LISTEN/NOTIFY.

---

## 13. Strategi Pengujian & QA

| Layer Pengujian | Target Cakupan | Framework & Tooling | Skenario Kunci |
|---|---|---|---|
| **Unit Test** | $\ge 90\%$ Domain & Application | Vitest | - AssertionEngine AST evaluator (status, header, JSONPath preventEval).<br>- Monitor Aggregate Root state transitions (3x fail $\to$ DOWN, 2x success $\to$ UP).<br>- Sanitasi CSV formula injection.<br>- Redaksi token Telegram pada Pino logger serializer. |
| **Security Test** | $100\%$ SSRF Guard | Vitest + Mock DNS Server | - Pemblokiran alamat private, link-local, cloud metadata (`169.254.169.254`).<br>- Verifikasi penolakan multi-record A/AAAA jika salah satu IP privat.<br>- Pengujian DNS Rebinding simulasi IP swap. |
| **Integration Test** | $\ge 80\%$ Infra Adapters | Vitest + Testcontainers PostgreSQL | - Transaksi Drizzle Unit of Work & rollback atomik.<br>- Penguncian baris `FOR UPDATE SKIP LOCKED` scheduler.<br>- Siklus simpan & ambil pg-boss job.<br>- Enkripsi & dekripsi Libsodium dengan validasi AAD mismatch. |
| **End-to-End (E2E)** | User Journeys Utama | Playwright | - Alur login pemilik, verifikasi cookie HttpOnly.<br>- Pembuatan monitor baru & konfigurasi assertion.<br>- Eksekusi manual check & verifikasi tampilan hasil.<br>- Simulasi insiden terbuka dan tertutup.<br>- Ekspor laporan CSV. |
