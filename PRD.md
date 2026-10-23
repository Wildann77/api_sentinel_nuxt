# API Sentinel — Platform Pemantauan API

## 1. Pernyataan Masalah (*Problem Statement*)

Pengembang membutuhkan cara yang andal untuk mengetahui apakah API mereka tersedia, merespons dengan benar, dan memiliki performa yang stabil.

Pengujian endpoint secara manual tidak cukup untuk memantau API secara terus-menerus. Pengujian manual juga tidak menyediakan riwayat performa yang lengkap, perhitungan uptime, pelacakan insiden, atau pemberitahuan otomatis ketika API mengalami gangguan.

Respons HTTP yang berhasil belum tentu berarti API bekerja dengan benar. Sebagai contoh:

- API mengembalikan status `200 OK`, tetapi nilai JSON yang diterima tidak sesuai dengan yang diharapkan.
- API mengembalikan status `401 Unauthorized` karena token autentikasi kedaluwarsa.
- API tidak menyertakan header yang wajib tersedia.
- API merespons terlalu lambat sehingga melampaui batas waktu yang ditentukan.
- API mengalami gangguan selama beberapa menit, tetapi pengembang tidak mengetahuinya karena tidak sedang membuka dashboard.

API Sentinel dikembangkan untuk mengatasi masalah tersebut melalui platform pemantauan API yang dapat dijalankan pada server milik pengguna.

Pengguna dapat mendaftarkan endpoint, mengatur interval pemeriksaan, menentukan autentikasi dan aturan validasi respons, serta melihat riwayat pemeriksaan. Sistem akan menjalankan pemeriksaan secara otomatis, menghitung uptime dan latency, mengelola insiden, serta mengirimkan notifikasi melalui Telegram.

Proyek ini ditujukan sebagai proyek portofolio untuk memperdalam kemampuan backend, khususnya dalam pengelolaan HTTP request, penjadwalan pekerjaan, transaksi database, pemrosesan data historis, keamanan, dan pengujian otomatis.

## 2. Solusi (*Solution*)

API Sentinel akan dibangun menggunakan Nuxt.js, TypeScript, PostgreSQL, dan Drizzle ORM.

Aplikasi terdiri atas dashboard web, server API, dan proses worker terpisah. Dashboard digunakan untuk mengelola konfigurasi dan melihat hasil pemeriksaan. Worker menjalankan pemeriksaan terjadwal meskipun dashboard tidak sedang dibuka.

### Fitur utama MVP

1. Autentikasi untuk satu pemilik aplikasi.
2. Manajemen monitor API.
3. Konfigurasi metode HTTP, header, body, autentikasi, dan timeout.
4. Validasi status HTTP, header respons, dan isi JSON.
5. Interval pemeriksaan dari 1 menit hingga 24 jam.
6. Pemeriksaan manual dan otomatis.
7. Riwayat hasil pemeriksaan.
8. Grafik latency dan persentase uptime.
9. Manajemen insiden dan deteksi pemulihan.
10. Notifikasi Telegram ketika insiden dibuka dan dipulihkan.
11. Ekspor laporan dalam format CSV.
12. Perlindungan SSRF dan pengamanan kredensial.

### Kriteria keberhasilan

MVP dianggap memenuhi tujuan apabila:

- Pengguna dapat membuat monitor dan menjalankan pemeriksaan manual.
- Worker tetap menjalankan pemeriksaan tanpa bergantung pada dashboard.
- Setiap pemeriksaan menghasilkan status dan informasi kegagalan yang dapat dipahami.
- Uptime dihitung berdasarkan aturan yang terdokumentasi.
- Insiden dibuat dan ditutup berdasarkan ambang batas yang telah ditentukan.
- Telegram menerima notifikasi ketika insiden dibuka dan dipulihkan.
- Sistem tidak mengirim notifikasi insiden baru untuk setiap kegagalan yang masih termasuk insiden yang sama.
- Kredensial tidak bocor melalui respons API, log, atau laporan.
- Fitur inti dilindungi oleh pengujian otomatis.

## 3. User Stories

### A. Autentikasi dan keamanan akun

1. Sebagai pemilik aplikasi, saya ingin masuk menggunakan kredensial, agar hanya saya yang dapat mengakses konfigurasi monitor dan riwayat pemeriksaan.
2. Sebagai pengguna yang sudah masuk, saya ingin sesi autentikasi disimpan dengan aman, agar kredensial tidak mudah terekspos melalui browser.
3. Sebagai pengguna, saya ingin keluar dan membatalkan sesi, agar sesi tidak tetap berlaku setelah saya selesai menggunakan aplikasi.

### B. Manajemen monitor

4. Sebagai pengembang, saya ingin membuat monitor dengan nama dan URL tujuan, agar setiap endpoint dapat diidentifikasi.
5. Sebagai pengembang, saya ingin memilih metode HTTP, agar endpoint GET, POST, PUT, PATCH, DELETE, dan HEAD dapat diperiksa.
6. Sebagai pengembang, saya ingin mengatur header dan body request, agar pemeriksaan dapat mengikuti kontrak API yang sebenarnya.
7. Sebagai pengembang, saya ingin menggunakan Bearer Token, API key, Basic Auth, atau custom header, agar endpoint yang memerlukan autentikasi tetap dapat diperiksa.
8. Sebagai pengembang, saya ingin menentukan status HTTP yang diharapkan, agar respons dengan status yang salah dapat dianggap gagal.
9. Sebagai pengembang, saya ingin memvalidasi header dan isi JSON, agar API yang memberikan respons tidak sesuai kontrak dapat terdeteksi.
10. Sebagai pengembang, saya ingin memilih interval antara 1 menit dan 24 jam, agar frekuensi pemeriksaan dapat disesuaikan.
11. Sebagai pengembang, saya ingin mengatur timeout, agar request yang lambat tidak berjalan tanpa batas waktu.
12. Sebagai pengembang, saya ingin menjalankan pemeriksaan manual, agar konfigurasi dapat diuji sebelum digunakan secara otomatis.
13. Sebagai pengembang, saya ingin mengedit, menjeda, melanjutkan, dan menghapus monitor, agar daftar endpoint dapat dikelola.
14. Sebagai pengembang, saya ingin melihat status kesehatan dan waktu pemeriksaan terakhir, agar masalah dapat diketahui dengan cepat.

### C. Pemantauan dan riwayat

15. Sebagai pengembang, saya ingin worker menjalankan pemeriksaan yang sudah jatuh tempo, agar pemantauan berjalan tanpa membuka dashboard.
16. Sebagai pengembang, saya ingin menyimpan hasil, waktu, latency, status HTTP, dan penyebab kegagalan, agar masalah dapat dianalisis.
17. Sebagai pengembang, saya ingin melihat riwayat pemeriksaan per monitor, agar saya dapat mengetahui kapan gangguan dimulai.
18. Sebagai pengembang, saya ingin melihat grafik latency selama 24 jam, 7 hari, dan 30 hari, agar perubahan performa dapat diketahui.
19. Sebagai pengembang, saya ingin melihat persentase uptime dalam rentang waktu yang sama, agar keandalan endpoint dapat dievaluasi.
20. Sebagai pengembang, saya ingin membedakan timeout, kegagalan koneksi, status HTTP yang salah, dan assertion yang gagal, agar penyebab masalah lebih mudah ditemukan.

### D. Manajemen insiden

21. Sebagai pengembang, saya ingin insiden dibuka setelah tiga kegagalan berturut-turut, agar kegagalan sementara tidak langsung menghasilkan insiden.
22. Sebagai pengembang, saya ingin insiden tetap aktif sampai kondisi pemulihan terpenuhi, agar satu respons sukses tidak langsung menutup insiden.
23. Sebagai pengembang, saya ingin insiden ditutup setelah dua pemeriksaan sukses berturut-turut, agar pemulihan lebih dapat dipercaya.
24. Sebagai pengembang, saya ingin melihat waktu mulai, waktu pulih, durasi, dan riwayat kegagalan insiden, agar dampak gangguan dapat dianalisis.
25. Sebagai pengembang, saya ingin status monitor dibedakan secara jelas, agar kondisi endpoint dapat dipahami tanpa membaca seluruh riwayat pemeriksaan.

### E. Notifikasi dan laporan

26. Sebagai pengembang, saya ingin mengatur bot Telegram dan chat tujuan, agar dapat menerima notifikasi di luar dashboard.
27. Sebagai pengembang, saya ingin mengirim notifikasi percobaan, agar konfigurasi Telegram dapat diverifikasi.
28. Sebagai pengembang, saya ingin menerima notifikasi ketika insiden dibuka dan dipulihkan, agar mengetahui gangguan dan pemulihannya.
29. Sebagai pengembang, saya ingin kegagalan berulang dalam insiden yang sama tidak menghasilkan notifikasi baru setiap kali, agar notifikasi tidak menjadi spam.
30. Sebagai pengembang, saya ingin mengekspor riwayat pemeriksaan dan insiden ke CSV, agar data dapat dianalisis lebih lanjut.

## 4. Keputusan Implementasi (*Implementation Decisions*)

### 4.1. Teknologi yang digunakan

- **Framework:** Nuxt.js dengan TypeScript.
- **Server API:** Nuxt Server Routes dengan Nitro.
- **Database:** PostgreSQL.
- **ORM:** Drizzle ORM.
- **Antarmuka:** Vue 3 dan Nuxt UI.
- **Styling:** Tailwind CSS.
- **Grafik:** Library grafik yang kompatibel dengan Vue.
- **Unit dan integration test:** Vitest.
- **End-to-end test:** Playwright.
- **Eksekusi pemeriksaan:** Worker Node.js terpisah dalam repository yang sama.
- **Notifikasi:** Telegram Bot API.

### 4.2. Arsitektur aplikasi

Aplikasi menggunakan pendekatan *modular monolith* dengan dua proses utama.

**A. Aplikasi web**

Bertanggung jawab untuk:

- Menampilkan dashboard.
- Mengelola autentikasi.
- Memvalidasi input dari pengguna.
- Menyediakan endpoint API untuk dashboard.
- Menyediakan akses terhadap konfigurasi monitor, riwayat, metrik, insiden, dan laporan.
- Melindungi operasi berdasarkan sesi pengguna.

**B. Worker pemantauan**

Bertanggung jawab untuk:

- Mencari monitor yang sudah waktunya diperiksa.
- Mengklaim pekerjaan yang akan dijalankan.
- Membuat HTTP request melalui komponen yang memiliki perlindungan SSRF.
- Memvalidasi respons.
- Menyimpan hasil pemeriksaan.
- Memperbarui status kesehatan monitor.
- Membuka atau menutup insiden.
- Menjadwalkan pemeriksaan berikutnya.
- Memproses pengiriman notifikasi.

**C. PostgreSQL**

Bertanggung jawab untuk menyimpan konfigurasi dan riwayat serta menjadi sumber data utama untuk menentukan pekerjaan yang harus dijalankan.

Pekerjaan harus diklaim secara aman menggunakan transaksi dan penguncian baris yang sesuai. Jika worker lebih dari satu, dua worker tidak boleh menjalankan pekerjaan terjadwal yang sama secara bersamaan.

### 4.3. Logika autentikasi

Alur masuk:

1. Pengguna mengirim kredensial.
2. Server memvalidasi input.
3. Server mencari akun pemilik aplikasi.
4. Server memverifikasi password terhadap hash yang tersimpan.
5. Jika valid, server membuat sesi dan mengirim cookie sesi yang aman.
6. Jika tidak valid, server menolak autentikasi tanpa membocorkan apakah username atau password yang salah.
7. Percobaan login dibatasi untuk mengurangi brute force.

Alur permintaan terautentikasi:

1. Browser mengirim cookie sesi.
2. Server memvalidasi sesi dan masa berlakunya.
3. Server memeriksa izin pengguna terhadap resource yang diminta.
4. Jika sesi tidak valid atau kedaluwarsa, server mengembalikan `401 Unauthorized`.
5. Jika sesi valid, permintaan dilanjutkan.

Cookie sesi harus menggunakan `HttpOnly` dan `SameSite`. Pada produksi melalui HTTPS, cookie juga harus menggunakan `Secure`. Permintaan yang mengubah data harus mendapatkan perlindungan CSRF yang sesuai.

Karena aplikasi hanya memiliki satu pemilik, registrasi publik tidak disediakan. Akun awal dibuat melalui proses setup yang dibatasi dan didokumentasikan.

### 4.4. Logika pembuatan dan pengelolaan monitor

Setiap monitor memiliki:

- Nama monitor.
- URL tujuan.
- Metode HTTP.
- Header request.
- Body request jika diperlukan.
- Jenis autentikasi.
- Aturan validasi respons.
- Interval pemeriksaan.
- Timeout.
- Status aktif atau dijeda.
- Waktu pemeriksaan berikutnya.
- Status kesehatan terakhir.

Alur pembuatan monitor:

1. Pengguna mengisi formulir monitor.
2. Server memvalidasi nama, URL, metode, header, body, autentikasi, interval, timeout, dan assertion.
3. Server memeriksa apakah URL menggunakan HTTP atau HTTPS.
4. Server menolak konfigurasi yang tidak valid atau berbahaya.
5. Kredensial dienkripsi sebelum disimpan.
6. Monitor disimpan dengan status aktif.
7. Waktu pemeriksaan berikutnya ditentukan berdasarkan waktu aktivasi dan interval.
8. Dashboard menampilkan monitor yang berhasil dibuat.

Jika validasi gagal, monitor tidak disimpan dan server mengembalikan kesalahan validasi yang menjelaskan bagian yang perlu diperbaiki.

#### Logika menjeda, melanjutkan, dan menghapus monitor

- **Jeda:** monitor tidak menerima pemeriksaan terjadwal baru. Hasil historis tetap tersimpan.
- **Lanjutkan:** monitor kembali aktif dan waktu pemeriksaan berikutnya dijadwalkan ulang.
- **Edit:** konfigurasi baru divalidasi sebelum diterapkan. Perubahan tidak boleh merusak hasil historis.
- **Hapus:** monitor tidak menerima pekerjaan baru. Pekerjaan yang belum dimulai dibatalkan atau diabaikan dengan aman. Riwayat ditangani berdasarkan kebijakan penghapusan yang ditentukan implementasi.

Monitor yang dijeda tidak otomatis dianggap pulih hanya karena pemeriksaan berhenti berjalan.

### 4.5. Logika HTTP request executor

Komponen ini menjalankan request yang telah dikonfigurasi pengguna.

Alur pemeriksaan:

1. Worker mengambil konfigurasi monitor yang aktif.
2. Executor memvalidasi ulang konfigurasi untuk memastikan tidak ada konfigurasi berbahaya.
3. Executor memvalidasi URL dan tujuan jaringan.
4. Executor menyiapkan metode, header, body, dan autentikasi.
5. Executor memulai pengukuran waktu.
6. Request dikirim dengan timeout dan batas ukuran respons.
7. Respons diterima atau request gagal.
8. Jika respons diterima, status HTTP, header, dan body diproses.
9. Hasil diteruskan ke assertion engine.
10. Durasi, hasil, dan alasan kegagalan dicatat.

Kegagalan dibedakan menjadi:

- DNS atau koneksi gagal.
- Timeout.
- Kesalahan TLS atau protokol.
- Status HTTP tidak sesuai.
- Body JSON tidak valid.
- Assertion header gagal.
- Assertion body gagal.
- Konfigurasi atau proses eksekusi gagal.

Jika request mengalami timeout, executor harus menghentikan atau membatalkan operasi jaringan sejauh didukung library yang digunakan. Request tidak boleh berjalan tanpa batas.

### 4.6. Logika autentikasi API yang dipantau

Jenis autentikasi yang didukung:

- Bearer Token.
- API key melalui header.
- Basic Auth.
- Custom header.

Alur autentikasi:

1. Pengguna memilih metode autentikasi.
2. Pengguna mengisi kredensial yang diperlukan.
3. Server memvalidasi kelengkapan konfigurasi.
4. Kredensial dienkripsi sebelum disimpan.
5. Saat pemeriksaan berjalan, executor membaca kredensial melalui jalur internal yang aman.
6. Executor membentuk header autentikasi yang diperlukan.
7. Kredensial tidak dikembalikan ke browser dalam respons konfigurasi monitor.
8. Log dan pesan kesalahan menyamarkan informasi sensitif.

Jika autentikasi tidak valid dan API mengembalikan `401` atau `403`, hasilnya diproses berdasarkan status HTTP yang diharapkan. Jika monitor mengharapkan `200`, respons tersebut berarti pemeriksaan gagal. Sistem tidak boleh menganggap setiap `401` sebagai kegagalan internal API Sentinel.

### 4.7. Logika validasi respons (*Assertion Engine*)

Assertion engine menentukan apakah respons API memenuhi aturan monitor.

Sebuah pemeriksaan dinyatakan sukses apabila:

1. Request selesai dalam batas timeout.
2. Status HTTP sesuai dengan yang diharapkan.
3. Semua assertion header yang diaktifkan lulus.
4. Semua assertion JSON yang diaktifkan lulus.

Jika satu saja kondisi wajib gagal, hasil pemeriksaan adalah gagal.

#### A. Validasi status HTTP

Contoh:

- Status yang diharapkan: `200` atau daftar status yang diizinkan (misal: `200, 204`).
- Status aktual: `200` (atau `204`).
- Hasil: lulus.

Jika status aktual `500`, hasilnya gagal karena tidak cocok dengan salah satu kode status yang diharapkan.

Sesuai keputusan rekonsiliasi D-15, konfigurasi mendukung satu kode HTTP atau multi-status code (dipisahkan koma pada form UI atau disimpan sebagai array/JSONB).

#### B. Validasi header

Operator yang didukung:

- `exists`: header harus tersedia.
- `equals`: nilai header harus sama dengan nilai yang ditentukan.
- `contains`: nilai header harus mengandung teks yang ditentukan.

Contoh:

- Header: `Content-Type`.
- Operator: `contains`.
- Nilai: `application/json`.
- Nilai aktual: `application/json; charset=utf-8`.
- Hasil: lulus.

Pencocokan nama header mengikuti aturan HTTP yang tidak membedakan huruf besar dan kecil. Perbandingan nilai mengikuti jenis assertion yang dipilih.

#### C. Validasi body JSON

JSONPath digunakan untuk mengambil nilai tertentu dari body JSON.

Contoh respons:

    {
      "status": "success",
      "data": {
        "userId": 123,
        "active": true
      }
    }

Contoh assertion:

- JSONPath: `$.status`
- Operator: `equals`
- Nilai yang diharapkan: `"success"`
- Hasil: lulus.

Contoh lain:

- JSONPath: `$.data.userId`
- Operator: `exists`
- Hasil: lulus karena properti tersedia.

Operator yang didukung (D-15):

- `exists`: nilai hasil JSONPath harus tersedia.
- `equals`: nilai aktual harus sama dengan nilai yang diharapkan.
- `not_equals`: nilai aktual tidak boleh sama dengan nilai yang ditentukan.
- `contains`: string harus mengandung teks yang ditentukan, atau array harus memiliki elemen yang cocok, sesuai tipe rule.

Perbandingan angka, string, boolean, array, dan objek harus memiliki aturan tipe yang jelas. Nilai angka `123` tidak boleh otomatis dianggap sama dengan string `"123"` tanpa aturan konversi yang eksplisit.

Jika JSON tidak valid, JSONPath tidak dapat diproses, atau nilai yang diperlukan tidak tersedia, assertion dinyatakan gagal dengan alasan yang jelas.

### 4.8. Logika perlindungan SSRF

Karena pengguna bebas memasukkan URL, API Sentinel berisiko digunakan untuk mengakses layanan internal atau jaringan yang tidak seharusnya dapat dijangkau.

Perlindungan harus mencakup:

- Hanya mengizinkan skema HTTP dan HTTPS.
- Menolak loopback, alamat privat, link-local, multicast, alamat reserved, dan alamat jaringan lain yang dilarang.
- Memeriksa alamat IPv4 dan IPv6.
- Memvalidasi hasil resolusi DNS dan tujuan koneksi yang sebenarnya.
- Memperhitungkan DNS rebinding.
- Menonaktifkan pengalihan otomatis pada MVP.
- Menolak respons redirect sebagai hasil pemeriksaan gagal atau memberikan kategori kegagalan redirect yang jelas.
- Membatasi timeout, ukuran respons, dan pemrosesan body.
- Tidak meneruskan kredensial internal aplikasi ke server tujuan.
- Tidak mengandalkan validasi formulir atau pencocokan teks URL saja.

Validasi harus diterapkan pada jalur request yang benar-benar melakukan koneksi, bukan hanya pada saat monitor dibuat.

### 4.9. Logika penjadwalan (*Scheduler*)

Setiap monitor aktif memiliki waktu pemeriksaan berikutnya.

Interval yang diperbolehkan adalah 60 sampai 86.400 detik.

Alur penjadwalan:

1. Worker mencari monitor aktif yang waktu pemeriksaannya sudah tiba.
2. Worker mengklaim pekerjaan menggunakan transaksi database.
3. Worker memastikan pekerjaan belum diklaim atau dijalankan oleh worker lain.
4. Worker menjalankan pemeriksaan.
5. Worker menyimpan hasilnya.
6. Worker menghitung waktu pemeriksaan berikutnya.
7. Worker memperbarui jadwal secara atomik.
8. Worker melanjutkan pekerjaan berikutnya.

Jika worker berhenti dan kemudian hidup kembali, monitor yang jatuh tempo harus tetap dapat ditemukan.

Sistem harus mencegah dua pemeriksaan terjadwal untuk monitor yang sama berjalan bersamaan. Jika pemeriksaan sebelumnya belum selesai, pemeriksaan baru ditunda atau dilewati sesuai kebijakan yang ditentukan, bukan menumpuk tanpa batas.

Setelah downtime, sistem tidak boleh menjalankan seluruh pemeriksaan yang tertinggal sekaligus. Monitor yang terlambat dijadwalkan ulang dengan kebijakan catch-up yang terdokumentasi untuk menghindari lonjakan request.

Pemeriksaan manual dapat berjalan terpisah dari jadwal, tetapi tetap harus memiliki batas konkurensi dan timeout.

### 4.10. Logika penyimpanan hasil pemeriksaan

Setiap pemeriksaan menyimpan:

- Identitas monitor.
- Waktu yang dijadwalkan.
- Waktu mulai dan selesai.
- Durasi request.
- Status sukses atau gagal.
- Status HTTP jika tersedia.
- Kategori kegagalan.
- Hasil setiap assertion.
- Ringkasan diagnostik yang aman.
- Identitas eksekusi atau correlation ID jika diperlukan.

Hasil pemeriksaan bersifat historis. Perubahan konfigurasi monitor tidak boleh mengubah hasil yang sudah terjadi.

Jika database gagal saat penyimpanan, worker harus menangani kegagalan tersebut secara eksplisit. Sistem tidak boleh menganggap hasil berhasil tersimpan jika transaksi gagal.

### 4.11. Logika perhitungan uptime

Uptime menunjukkan persentase pemeriksaan yang berhasil dalam rentang waktu tertentu.

Rumus:

`Uptime (%) = (jumlah pemeriksaan sukses / jumlah seluruh pemeriksaan yang memenuhi syarat) × 100`

Contoh:

- Pemeriksaan yang memenuhi syarat: 100.
- Pemeriksaan sukses: 97.
- Pemeriksaan gagal: 3.
- Uptime: 97%.

Hanya pemeriksaan yang benar-benar dieksekusi dan memenuhi syarat yang masuk perhitungan. Monitor yang dijeda dan jadwal yang tidak pernah dijalankan tidak otomatis dianggap gagal.

Jika tidak ada pemeriksaan yang memenuhi syarat, sistem harus menampilkan `N/A` atau keadaan kosong, bukan `100%`.

Perhitungan tersedia untuk:

- 24 jam terakhir.
- 7 hari terakhir.
- 30 hari terakhir.

Semua rentang dihitung berdasarkan timestamp pemeriksaan dalam UTC, lalu ditampilkan sesuai zona waktu pengguna.

### 4.12. Logika perhitungan latency

Latency adalah durasi request, diukur dalam milidetik.

Pengukuran dimulai saat executor memulai request dan berakhir ketika respons selesai diterima atau request gagal dihentikan.

Contoh:

- Request dimulai pada 10:00:00.000.
- Respons selesai pada 10:00:00.250.
- Latency: 250 ms.

Dashboard menampilkan grafik latency berdasarkan hasil historis dan rentang waktu yang dipilih.

Ketentuan:

- Durasi tidak boleh dianggap nol ketika tidak dapat diukur.
- Pemeriksaan gagal yang memiliki durasi terukur tetap dapat ditampilkan sebagai data performa, tetapi harus dibedakan dari keberhasilan.
- Pemeriksaan yang gagal sebelum request benar-benar dimulai dapat memiliki latency kosong.
- Agregasi grafik harus menggunakan aturan yang konsisten dan terdokumentasi.

### 4.13. Logika status kesehatan monitor

Status kesehatan monitor dibedakan dari status eksekusi individual.

Status yang ditampilkan:

- `UNKNOWN`: belum ada pemeriksaan yang selesai.
- `UP`: pemeriksaan terakhir sukses dan tidak ada insiden terbuka.
- `DEGRADED`: terdapat kegagalan terbaru, tetapi ambang pembukaan insiden belum terpenuhi.
- `DOWN`: terdapat insiden yang sedang terbuka.
- `PAUSED`: pemeriksaan terjadwal dinonaktifkan oleh pengguna.

Alur perubahan status:

- Monitor baru → `UNKNOWN`.
- Pemeriksaan sukses sebelum ada kegagalan → `UP`.
- Kegagalan pertama atau kedua berturut-turut → `DEGRADED`, kecuali insiden masih terbuka.
- Kegagalan ketiga berturut-turut → insiden dibuka dan status menjadi `DOWN`.
- Dua pemeriksaan sukses berturut-turut saat insiden terbuka → insiden ditutup dan status menjadi `UP`.
- Monitor dijeda → `PAUSED`.

Status kesehatan dihitung dari hasil pemeriksaan dan status monitor, bukan dari tampilan dashboard.

### 4.14. Logika manajemen insiden

Satu insiden mewakili satu periode gangguan yang berkelanjutan.

Ambang batas awal:

- Tiga kegagalan berturut-turut untuk membuka insiden.
- Dua keberhasilan berturut-turut untuk menutup insiden.

#### Alur pembukaan insiden

1. Pemeriksaan selesai dan dinyatakan gagal.
2. Sistem menyimpan hasil pemeriksaan.
3. Sistem menaikkan penghitung kegagalan berturut-turut.
4. Jika jumlah kegagalan belum mencapai tiga, monitor dapat berstatus `DEGRADED`.
5. Jika jumlah kegagalan mencapai tiga dan belum ada insiden terbuka, sistem membuat insiden.
6. Status monitor berubah menjadi `DOWN`.
7. Sistem membuat peristiwa notifikasi insiden dibuka.
8. Worker notifikasi memproses pengiriman Telegram.

#### Alur selama insiden berlangsung

- Kegagalan baru dikaitkan dengan insiden yang sedang terbuka.
- Sistem memperbarui riwayat kegagalan dan informasi diagnostik.
- Sistem tidak membuat insiden kedua untuk monitor yang sama selama insiden pertama masih terbuka.
- Notifikasi pembukaan tidak dikirim ulang untuk setiap kegagalan.

#### Alur pemulihan

1. Pemeriksaan berhasil ketika insiden masih terbuka.
2. Penghitung keberhasilan berturut-turut bertambah.
3. Jika belum mencapai dua keberhasilan, insiden tetap terbuka (antarmuka menampilkan indikator pemulihan sementara/`RECOVERING`).
4. Jika pemeriksaan gagal sebelum mencapai dua keberhasilan, penghitung keberhasilan kembali ke nol.
5. Setelah dua keberhasilan berturut-turut, insiden ditutup.
6. Waktu pemulihan dan durasi insiden dicatat.
7. Status monitor berubah menjadi `UP`.
8. Sistem membuat peristiwa notifikasi pemulihan.

Perubahan hasil pemeriksaan, status insiden, dan peristiwa notifikasi harus dikelola secara konsisten dalam transaksi database. Pengiriman Telegram sendiri dilakukan di luar transaksi agar gangguan Telegram tidak membatalkan penyimpanan hasil pemeriksaan.

### 4.15. Logika notifikasi Telegram

Pengguna memasukkan bot token dan chat ID, kemudian dapat menjalankan tes koneksi notifikasi.

Alur notifikasi:

1. Incident engine membuat peristiwa `INCIDENT_OPENED` atau `INCIDENT_RECOVERED`.
2. Peristiwa disimpan sebagai pekerjaan notifikasi yang belum dikirim.
3. Worker notifikasi mengambil pekerjaan tersebut.
4. Worker membentuk pesan berdasarkan data insiden.
5. Worker mengirim pesan melalui Telegram Bot API.
6. Jika berhasil, status pengiriman diperbarui menjadi terkirim.
7. Jika gagal sementara, pengiriman dapat dicoba ulang dengan batas percobaan dan jeda yang ditentukan.
8. Jika batas percobaan tercapai, status menjadi gagal dan ditampilkan pada diagnostik sistem.

Contoh notifikasi pembukaan:

    API Sentinel — INSIDEN TERBUKA

    Monitor: Payment API
    Status: DOWN
    Penyebab: Status HTTP tidak sesuai
    Waktu mulai: 2026-10-22 10:00 UTC

Contoh notifikasi pemulihan:

    API Sentinel — INSIDEN DIPULIHKAN

    Monitor: Payment API
    Status: UP
    Waktu mulai: 2026-10-22 10:00 UTC
    Waktu pulih: 2026-10-22 10:05 UTC
    Durasi: 5 menit

Token bot tidak boleh ditampilkan kembali di dashboard atau ditulis ke log.

Kegagalan pengiriman Telegram tidak boleh mengubah hasil pemeriksaan API. Sistem harus dapat mencatat hasil monitoring meskipun Telegram sedang tidak tersedia.

### 4.16. Logika dashboard

Dashboard mengambil data dari server API yang telah mengautentikasi pengguna.

Ringkasan utama:

- Jumlah monitor aktif.
- Jumlah monitor dengan status `UP`, `DEGRADED`, dan `DOWN`.
- Insiden yang sedang terbuka.
- Waktu pemeriksaan terakhir.
- Ringkasan uptime.
- Ringkasan latency.
- Kegagalan terbaru.

Halaman detail monitor menampilkan:

- Konfigurasi yang aman untuk ditampilkan.
- Status kesehatan.
- Grafik latency dan uptime.
- Riwayat pemeriksaan.
- Hasil assertion.
- Ringkasan kegagalan.

Dashboard harus membedakan data yang belum tersedia dari angka nol. Misalnya, monitor yang belum pernah diperiksa tidak boleh ditampilkan memiliki latency `0 ms` atau uptime `100%`.

### 4.17. Logika ekspor CSV

Pengguna dapat memilih monitor dan rentang waktu untuk mengekspor data.

Alur:

1. Server memvalidasi sesi dan parameter laporan.
2. Server mengambil data yang sesuai dengan filter.
3. Data disusun menjadi kolom yang konsisten.
4. Nilai sensitif dihilangkan.
5. Nilai teks yang berpotensi dieksekusi sebagai formula spreadsheet ditangani secara aman.
6. Server mengembalikan berkas CSV.

Laporan dapat mencakup waktu pemeriksaan, nama monitor, hasil, status HTTP, latency, kategori kegagalan, waktu mulai insiden, dan waktu pemulihan.

Laporan tidak boleh menyertakan password, token, API key, header autentikasi, atau kunci enkripsi.

### 4.18. Model data konseptual

**User**
- Identitas akun pemilik.
- Hash password.
- Waktu pembuatan dan pembaruan.

**Session**
- Identitas sesi atau verifier.
- Referensi akun.
- Waktu pembuatan dan kedaluwarsa.

**Monitor**
- Nama dan URL.
- Metode HTTP.
- Konfigurasi header, body, dan autentikasi.
- Aturan assertion.
- Interval dan timeout.
- Status aktif atau dijeda.
- Waktu pemeriksaan berikutnya.
- Status kesehatan terakhir.

**CheckResult**
- Referensi monitor.
- Waktu pemeriksaan.
- Durasi.
- Status sukses atau gagal.
- Status HTTP.
- Kategori kegagalan.
- Hasil assertion dan diagnostik yang aman.

**Incident**
- Referensi monitor.
- Waktu mulai.
- Waktu pemulihan.
- Status terbuka atau tertutup.
- Ringkasan gangguan.

**NotificationConfig**
- Chat ID Telegram.
- Token bot terenkripsi.
- Status notifikasi.

**NotificationDelivery**
- Referensi peristiwa atau insiden.
- Jenis notifikasi.
- Status pengiriman.
- Jumlah percobaan.
- Waktu percobaan terakhir.
- Ringkasan kesalahan yang aman.

Relasi dan indeks database harus mendukung pengambilan riwayat per monitor, daftar insiden terbuka, dan pencarian monitor yang sudah jatuh tempo. Data historis harus menggunakan pagination agar query tetap terkendali ketika jumlah pemeriksaan meningkat.

### 4.19. Kontrak API

Daftar berikut merupakan rancangan endpoint awal.

| Metode dan endpoint | Fungsi |
|---|---|
| `POST /api/auth/login` | Memvalidasi kredensial dan membuat sesi. |
| `POST /api/auth/logout` | Membatalkan sesi. |
| `GET /api/monitors` | Mengambil daftar monitor dengan filter dan pagination. |
| `POST /api/monitors` | Membuat monitor setelah validasi konfigurasi. |
| `GET /api/monitors/:id` | Mengambil detail monitor tanpa menampilkan rahasia. |
| `PATCH /api/monitors/:id` | Memperbarui konfigurasi monitor. |
| `DELETE /api/monitors/:id` | Menghapus monitor sesuai kebijakan retensi riwayat. |
| `POST /api/monitors/:id/check` | Meminta pemeriksaan manual. |
| `GET /api/monitors/:id/checks` | Mengambil riwayat pemeriksaan. |
| `GET /api/metrics/summary` | Mengambil ringkasan uptime dan latency. |
| `GET /api/incidents` | Mengambil daftar insiden. |
| `GET /api/incidents/:id` | Mengambil detail insiden. |
| `GET /api/reports/export.csv` | Mengekspor laporan. |
| `GET /api/settings/telegram` | Mengambil status konfigurasi Telegram tanpa token. |
| `PUT /api/settings/telegram` | Menyimpan atau mengganti konfigurasi Telegram. |
| `POST /api/settings/telegram/test` | Mengirim notifikasi percobaan. |

Ketentuan umum:

- Semua endpoint selain endpoint autentikasi yang memang diperlukan harus memverifikasi sesi.
- Input harus divalidasi di server.
- `400` digunakan untuk input yang tidak valid.
- `401` digunakan untuk sesi yang tidak valid.
- `403` digunakan ketika akses tidak diizinkan.
- `404` digunakan ketika resource tidak ditemukan.
- `409` dapat digunakan untuk konflik keadaan, seperti operasi yang tidak sesuai dengan status resource.
- `429` digunakan ketika batas permintaan terlampaui.
- `500` digunakan untuk kesalahan internal yang tidak diharapkan tanpa membocorkan stack trace.

Pemeriksaan manual yang membutuhkan waktu lama dapat mengembalikan ID pemeriksaan terlebih dahulu. Klien kemudian mengambil hasilnya melalui endpoint riwayat.

### 4.20. Logika observabilitas dan operasional

- Gunakan log terstruktur.
- Sertakan ID monitor, pemeriksaan, dan insiden ketika relevan.
- Samarkan kredensial dan data sensitif.
- Sediakan health check untuk aplikasi dan worker.
- Deteksi worker yang berhenti memproses pekerjaan.
- Tangani database yang tidak tersedia tanpa mengklaim hasil berhasil disimpan.
- Tangani kegagalan Telegram secara terpisah dari kegagalan monitoring.
- Dokumentasikan variabel lingkungan, migrasi database, dan cara menjalankan worker.

## 5. Keputusan Pengujian (*Testing Decisions*)

Pengujian harus memverifikasi perilaku yang terlihat dari luar, bukan bergantung pada detail implementasi internal. Karena proyek dimulai dari repository kosong, belum ada pengujian terdahulu yang harus dipertahankan.

### 5.1. Unit test

Uji:

- Validasi status HTTP, header, dan body JSON.
- JSON tidak valid dan JSONPath yang tidak menemukan nilai.
- Perhitungan uptime, termasuk periode kosong.
- Perhitungan latency.
- Perubahan status monitor.
- Pembukaan insiden setelah tiga kegagalan.
- Pemulihan insiden setelah dua keberhasilan.
- Pengaturan ulang penghitung pemulihan ketika terjadi kegagalan.
- Penyamaran kredensial dalam diagnostik.

### 5.2. Integration test

Gunakan database pengujian terisolasi untuk memverifikasi:

- Pembuatan, pengubahan, penjedaan, pelanjutan, dan penghapusan monitor.
- Penyimpanan hasil pemeriksaan.
- Konsistensi hasil pemeriksaan dan perubahan insiden.
- Rollback transaksi ketika terjadi kegagalan.
- Pagination dan filter waktu.
- Pengambilan monitor yang sudah jatuh tempo.
- Pencegahan eksekusi ganda oleh worker bersamaan.
- Penolakan permintaan tanpa autentikasi.

### 5.3. Pengujian request executor

Gunakan server pengujian lokal yang terkendali untuk memverifikasi:

- Metode, header, dan body request.
- Semua metode autentikasi yang didukung.
- Timeout.
- Kegagalan DNS, koneksi, TLS, dan protokol.
- Status HTTP yang tidak sesuai.
- Batas ukuran respons.
- Penanganan redirect.
- Pemblokiran tujuan jaringan terlarang.
- Perlindungan terhadap DNS rebinding dan perubahan alamat tujuan.

Pengujian keamanan tidak cukup hanya memeriksa teks URL. Pengujian harus mempertimbangkan alamat yang benar-benar digunakan saat koneksi dibuat.

### 5.4. Pengujian worker dan scheduler

Verifikasi bahwa:

- Monitor yang jatuh tempo dijalankan.
- Monitor yang dijeda tidak menerima pemeriksaan terjadwal.
- Worker yang hidup kembali dapat menemukan pekerjaan tertinggal.
- Dua worker tidak mengambil pekerjaan yang sama secara bersamaan.
- Request lambat tidak menyebabkan penumpukan pekerjaan tanpa batas.
- Timeout dicatat sebagai kegagalan.
- Gangguan database tidak menyebabkan pekerjaan hilang secara diam-diam.
- Pemeriksaan manual tidak merusak status penjadwalan.

### 5.5. Pengujian notifikasi

Verifikasi bahwa:

- Pembukaan insiden menghasilkan satu peristiwa notifikasi.
- Pemulihan menghasilkan satu peristiwa notifikasi.
- Kegagalan berulang pada insiden yang sama tidak menghasilkan peristiwa pembukaan baru.
- Gangguan Telegram tidak mengubah hasil pemeriksaan.
- Pengiriman ulang memiliki batas yang jelas.
- Token bot tidak muncul pada log atau respons API.

Pengujian otomatis menggunakan API Telegram tiruan. Pengiriman ke bot nyata dilakukan sebagai pengujian integrasi manual.

### 5.6. End-to-end test

Dengan Playwright, verifikasi alur berikut:

1. Login.
2. Membuat monitor.
3. Mengatur autentikasi dan assertion.
4. Menjalankan pemeriksaan manual.
5. Melihat hasil dan riwayat.
6. Melihat grafik uptime dan latency.
7. Mensimulasikan kegagalan dan memverifikasi pembukaan insiden.
8. Mensimulasikan pemulihan dan memverifikasi penutupan insiden.
9. Mengatur Telegram dan menguji pengiriman dengan API tiruan.
10. Mengekspor CSV.
11. Memastikan halaman dan endpoint yang dilindungi menolak akses tanpa sesi.

### Definition of Done

Fitur dianggap selesai apabila:

- Perilaku sesuai dengan kriteria penerimaan.
- Pengujian yang relevan lulus.
- Kesalahan ditampilkan secara jelas.
- Informasi sensitif tidak bocor.
- Perubahan konfigurasi dan prosedur operasional terdokumentasi.

## 6. Di Luar Cakupan (*Out of Scope*)

MVP tidak mencakup:

- Banyak pengguna, organisasi, dan tim.
- Billing dan sistem langganan.
- Public status page.
- Integrasi Slack, Discord, email, dan SMS.
- Monitoring multi-region.
- Eksekusi skrip buatan pengguna.
- Pemeriksaan TCP, ICMP ping, atau DNS khusus.
- Pemantauan browser dan workflow sintetis bertahap.
- Impor OpenAPI secara penuh.
- Analisis SLO tingkat lanjut dan error budget.
- Penjadwalan maintenance window yang kompleks.
- Message broker terpisah.
- Jaminan ketersediaan setingkat layanan monitoring terdistribusi.

## 7. Catatan Tambahan (*Further Notes*)

### Asumsi proyek

- Proyek dimulai dari repository kosong.
- Pengguna aplikasi hanya satu pemilik.
- Dashboard dan worker menggunakan codebase serta database yang sama.
- Pemeriksaan berjalan pada server yang dikendalikan pemilik aplikasi.
- Pengguna menyediakan token bot dan chat ID untuk mengaktifkan Telegram.
- Riwayat pemeriksaan dan insiden tersedia untuk dashboard serta ekspor.

### Urutan implementasi

1. Menyiapkan Nuxt, TypeScript, PostgreSQL, Drizzle ORM, dan infrastruktur pengujian.
2. Membangun autentikasi dan penyimpanan rahasia.
3. Membangun manajemen monitor dan validasi server.
4. Membangun request executor dan perlindungan SSRF.
5. Membangun assertion engine dan pemeriksaan manual.
6. Membangun worker dan scheduler.
7. Menyimpan riwayat serta menghitung uptime dan latency.
8. Membangun incident engine.
9. Membangun notifikasi Telegram.
10. Membangun dashboard, grafik, riwayat insiden, dan ekspor CSV.
11. Melengkapi pengujian keamanan, dokumentasi, dan deployment.

### Referensi teknis

- Nuxt Server Routes: https://github.com/nuxt/nuxt/blob/main/docs/1.getting-started/13.server.md
- PostgreSQL SELECT dan penguncian baris: https://www.postgresql.org/docs/current/sql-select.html
- Drizzle ORM Transactions: https://orm.drizzle.team/docs/transactions
- OWASP SSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- Telegram Bot API: https://core.telegram.org/bots/api
- Vitest: https://vitest.dev/guide/
- Playwright: https://playwright.dev/docs/intro

Referensi tersebut menjadi dasar keputusan teknis. Detail implementasi tetap harus diverifikasi terhadap versi library dan lingkungan deployment yang benar-benar digunakan.
