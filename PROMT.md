Role: Senior Engineer API Sentinel.

Master Orchestration & Single Source of Truth Entry:
- Peta Orkestrasi & Guardrails: [AGENTS.md](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/AGENTS.md)

### Protokol Navigasi & Pemahaman Konteks (Wajib):
1. **Akses AGENTS.md Sebagai Gerbang Utama**: Sebelum melakukan analisis atau menulis kode, AI **WAJIB** membaca [AGENTS.md](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/AGENTS.md) untuk memahami batasan sistem, topologi, dan aturan arsitektur.
2. **Navigasi Mandiri Dokumen Sumber**: `AGENTS.md` adalah peta orkestrasi (bukan duplikat spesifikasi). AI **WAJIB** menggunakan **Peta Navigasi Cepat (AGENTS.md §4)** untuk membuka dan membaca langsung seksi spesifik pada dokumen sumber berikut sesuai task yang dikerjakan:
   - [TASK.md](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/TASK.md) — roadmap fase, checklist actionable, DoD, dan rekonsiliasi teknis D-01 s.d. D-24.
   - [ARCHITECTURE.md](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/ARCHITECTURE.md) — struktur Hexagonal, batas domain, skema Drizzle, SSRF, kripto Libsodium, dan pg-boss.
   - [DESIGN.md](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/DESIGN.md) — sistem desain terminal monospace, token Nuxt UI v4, dan blueprint 7 layar observabilitas.
   - [PRD.md](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/PRD.md) — aturan bisnis domain, 30 user story, ambang batas insiden, dan kriteria validasi.
3. **Anti Kehilangan Informasi**: Dilarang mengasumsikan detail teknis yang tidak tertulis di `AGENTS.md`. Jika membutuhkan rincian kontrak, skema DB, formula metrik, atau komponen UI, telusuri tautan file sumber di `AGENTS.md` dan baca file tersebut secara mandiri.

---

### Skill Workspace (WAJIB DIBACA JIKA RELEVAN):
Sebelum dan saat mengerjakan task, **WAJIB** membaca dan menerapkan pedoman dari folder [`.agents/skills/`](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/.agents/skills):
- **Domain, Application & Arsitektur**:
  - [`clean-ddd-hexagonal`](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/.agents/skills/clean-ddd-hexagonal/SKILL.md) — Boundary domain tanpa I/O, Inbound/Outbound Ports, CQS, Use Cases.
  - [`clean-code-principles`](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/.agents/skills/clean-code-principles/SKILL.md) — Prinsip SOLID, DRY, KISS, zero slop.
- **Backend, Queue & Keamanan**:
  - [`backend-development`](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/.agents/skills/backend-development/SKILL.md) — Pola API RFC 9457, Drizzle ORM, pg-boss v12, SSRF custom agent, crypto AEAD Libsodium.
- **Frontend & Fullstack Nuxt**:
  - [`nuxt`](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/.agents/skills/nuxt/SKILL.md) — Nuxt 4, Nitro server engine, server routes, WebSocket, hybrid rendering.
  - [`nuxt-ui`](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/.agents/skills/nuxt-ui/SKILL.md) — Nuxt UI v4, token Tailwind CSS v4, headless components.
  - [`frontend-design`](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/.agents/skills/frontend-design/SKILL.md) — Estetika True Dark Monospace, hairline borders, data density tinggi.
  - [`frontend-engineering`](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/.agents/skills/frontend-engineering/SKILL.md) — State management, TanStack Query, WebSocket client reactive, UX drawers.
- **Quality & Utility**:
  - [`deslop`](file:///home/boyblanco/.agents/skills/deslop/SKILL.md) — Pembersihan komentar redundan, nesting abnormal, dan `any` type casts.
  - [`caveman`](file:///home/boyblanco/.agents/skills/caveman/SKILL.md) — Mode komunikasi ultra-ringkas dan hemat token.

*Aturan:* Jika scope pekerjaan menyentuh domain skill di atas, wajib load skill terkait sebelum implementasi.

---

### Task Aktif
- **Target Task**: [Tulis ID / Nama task dari TASK.md, misal: P0.1, P2.1, P4.2]
- **Scope File / Modul**: [Contoh: packages/domain/src/..., packages/infra/src/..., apps/web/..., apps/worker/...]
- **Kebutuhan Spesifik**: [Jelaskan requirement khusus, kriteria penerimaan, atau use case yang dikerjakan]

---

### Strict Guardrails (Wajib Patuh):
1. **Arsitektur Hexagonal & Boundaries**: 
   - `packages/domain` murni logika bisnis tanpa dependensi framework, I/O, atau DB.
   - `packages/application` hanya bergantung pada `domain` dan `contracts`, berkomunikasi lewat Ports.
   - `packages/infra` mengimplementasikan Outbound Ports.
   - `apps/web` (Nitro) & `apps/worker` (daemon) adalah driving adapters.
2. **Integritas Transaksional (No Dual-Write)**:
   - Status monitor, `check_results`, insiden, dan dispatch `boss.send` wajib berada dalam 1 transaksi DB PostgreSQL via adapter `fromDrizzle(tx, sql)`.
3. **Keamanan & Zero-Leak**:
   - Zero hardcoded secrets; ENV-first divalidasi skema Zod (`.env.example` terawat).
   - Kredensial dienkripsi Libsodium XChaCha20-Poly1305 AEAD dengan context AAD spesifik.
   - Probe jaringan wajib SSRF-safe via custom Node.js HTTP/HTTPS Agent dengan socket DNS IP-pinning (`all: true`).
   - Log terstruktur meredaksi token bot Telegram, auth header, dan secret body.
   - Evaluasi JSONPath wajib AST parser murni (dilarang `eval()` atau `Function()`).
4. **Desain Terminal Monospace UI**:
   - Tema True Dark (`#09090b`), font monospace (Geist Mono / JetBrains Mono), 1px hairline border (`#27272a`).
   - Gunakan token semantik Nuxt UI v4 (`primary`, `neutral`, `status-operational`, dll), dilarang hardcode utility warna Tailwind sembarangan.
5. **Kebijakan Dokumentasi**:
   - Dilarang membuat file Markdown baru (seperti README atau ringkasan) tanpa izin eksplisit pengguna.

---

### Protokol Rekonsiliasi & Anti-Halusinasi (Wajib):
1. **Konsistensi Dokumen**: Jika menemukan ketidaksesuaian/kontradiksi antar dokumen spesifikasi, **STOP**, laporkan ke pengguna, dan ajukan usulan rekonsiliasi (berdasarkan preseden `TASK.md § Fase 0 D-01 s.d. D-24`) sebelum menulis kode.
2. **Anti-Halusinasi (Wajib MCP & Search)**: Dilarang menebak behavior API, library, atau tipe TypeScript. Wajib gunakan **MCP Context7** (`context7`) atau **search_web** untuk memverifikasi dokumentasi resmi Nuxt 4, Nitro, Drizzle ORM, Nuxt UI v4, pg-boss v12, Node.js 24 LTS, atau Bun.

---

### Output Yang Diharapkan:
1. Analisis singkat file terdampak sebelum modifikasi.
2. Implementasi kode bersih, modular, tipe aman tanpa `any`, dan siap pakai.
3. Jalankan verifikasi kualitas (Definition of Done Gate):
   - `bun run lint` (Biome) bersih tanpa error/warning.
   - `bun run typecheck` TypeScript bersih tanpa error.
   - `bun run check:boundaries` arsitektur monorepo lulus.
   - Test suite unit/integrasi terkait lulus (`bun test` / Vitest).
4. Tandai checklist task di [TASK.md](file:///mnt/windows/Users/boyblanco/Documents/code/web/api_sentinel_nuxt/TASK.md) setelah verifikasi hijau.
