# Estimasi Biaya & Harga Jual Sistem Manajemen Sekolah

*Terakhir diperbarui: Juli 2025*
*Kurs yang digunakan: $1 = Rp 18.000*
*Semua biaya dihitung per tahun — menyesuaikan siklus pencairan dana pendidikan (BOS/yayasan).*

---

## Ringkasan Biaya Total

Ada dua jenis biaya utama untuk membangun dan menjalankan sistem ini:

1. **Biaya Development (sekali bayar)** — biaya membangun sistemnya dari nol hingga siap digunakan
2. **Biaya Operasional (per tahun)** — biaya menjalankan sistem setelah jadi (server, hosting, app store)

---

## Biaya Development (Investasi Awal, Sekali Bayar)

Ini adalah biaya untuk membangun seluruh sistem dari awal hingga siap digunakan oleh sekolah. Dihitung berdasarkan scope dan kompleksitas proyek.

### Rincian Scope Pengembangan

| No | Komponen | Penjelasan | Estimasi Nilai |
|----|----------|-----------|----------------|
| 1 | **Backend (server + API)** | Otak sistem: autentikasi, database, logika bisnis seluruh modul (absensi, tagihan, rapor, RPP, notifikasi) | Rp 20.000.000 |
| 2 | **Admin Panel (website)** | Dashboard untuk admin, bendahara, kepala sekolah, dan guru: manajemen data, laporan, input nilai | Rp 12.000.000 |
| 3 | **Aplikasi Mobile (Android + iOS)** | Satu aplikasi untuk guru (absensi + offline mode) dan orang tua (lihat absensi, bayar SPP, lihat rapor) | Rp 18.000.000 |
| 4 | **Sistem notifikasi real-time** | Pengiriman notifikasi otomatis ke HP orang tua (absensi, tagihan, rapor) | Rp 4.000.000 |
| 5 | **Sistem keamanan & multi-tenant** | Pemisahan data antar sekolah, keamanan login, proteksi dari kebocoran data | Rp 5.000.000 |
| 6 | **Offline mode & sinkronisasi** | Guru bisa input absensi tanpa internet, data otomatis tersinkron saat online | Rp 4.000.000 |
| 7 | **Testing & quality assurance** | Pengujian menyeluruh agar sistem stabil dan data akurat | Rp 5.000.000 |
| 8 | **Deployment & konfigurasi server** | Setup server, database, domain, publish ke app store, konfigurasi awal | Rp 2.000.000 |
| | | | |
| | **TOTAL BIAYA DEVELOPMENT** | | **Rp 70.000.000** |

### Penjelasan Nilai

- Estimasi di atas berdasarkan standar pasar Indonesia untuk proyek berskala serupa (44 requirement, 8 modul, 3 platform: backend + web + mobile)
- Termasuk: perancangan arsitektur, pengkodean, pengujian, dokumentasi, dan deployment pertama
- Tidak termasuk: perubahan scope setelah kesepakatan (change request dihitung terpisah)

### Perbandingan dengan Harga Pasar

| Penyedia | Estimasi Biaya | Keterangan |
|----------|---------------|------------|
| Software house lokal | Rp 150-300 juta | Tim 3-5 orang |
| Freelancer marketplace (Upwork, dll) | Rp 100-200 juta | Kualitas bervariasi |
| Agency Jakarta | Rp 250-500 juta | Overhead tinggi |
| **Proyek ini** | **Rp 70 juta** | Solo developer, efisien, kontrol kualitas langsung |

---

## Apa Saja yang Perlu Dibayar untuk Menjalankan Sistem Ini?

Setelah sistem jadi, ada biaya rutin (per tahun) untuk menjaga sistem tetap berjalan di internet. Biaya ini jauh lebih kecil dari biaya development.

---

## Biaya Operasional Per Tahun

### Skenario: 5 Sekolah (Tahun Pertama)

Ini adalah skenario paling kecil — baru mulai dengan 5 sekolah pelanggan.

| No | Keperluan | Penjelasan Singkat | Biaya/Tahun (Rp) |
|----|-----------|-------------------|------------------|
| 1 | **Sewa server aplikasi** (Railway API) | Komputer di cloud yang menjalankan aplikasi kita 24 jam | Rp 3.240.000 |
| 2 | **Sewa server pemroses latar belakang** (Worker) | Komputer khusus untuk kirim notifikasi & proses file | Rp 1.620.000 |
| 3 | **Sewa database** (PostgreSQL — tempat simpan semua data) | Gudang penyimpanan data siswa, absensi, tagihan, dll | Rp 3.402.000 |
| 4 | **Sewa memori cepat** (Redis — penyimpanan sementara) | Memori super cepat untuk antrian notifikasi & keamanan login | Rp 1.350.000 |
| 5 | **Biaya transfer data** (Egress — data keluar dari server) | Biaya saat pengguna mengakses data dari server | Rp 216.000 |
| 6 | **Langganan platform hosting** (Railway Hobby Plan) | Biaya tetap untuk menggunakan layanan Railway | Rp 1.080.000 |
| 7 | **Penyimpanan file** (Cloudflare R2 — foto bukti transfer, file RPP) | Tempat menyimpan foto-foto dan dokumen yang diupload | Rp 0 (gratis*) |
| 8 | **Pengiriman notifikasi HP** (Firebase Cloud Messaging) | Layanan pengirim notifikasi push ke HP orang tua & guru | Rp 0 (gratis, tanpa batas) |
| 9 | **Pengiriman email** (Brevo — untuk reset password, kirim kredensial) | Layanan kirim email otomatis | Rp 0 (gratis*) |
| 10 | **Sewa nama website** (Domain .com) | Alamat website, contoh: edukita.com | Rp 270.000 |
| 11 | **Biaya publish di Apple App Store** (Apple Developer Program) | Biaya wajib tahunan agar aplikasi tetap ada di iPhone/iPad | Rp 1.782.000 |
| 12 | **Biaya publish di Google Play Store** (Google Play Console) | Biaya pendaftaran satu kali seumur hidup untuk publish di Android | Rp 450.000 |
| | | | |
| | **TOTAL TAHUN PERTAMA** | | **Rp 13.410.000** |
| | **TOTAL TAHUN KE-2 DAN SETERUSNYA** | (tanpa biaya Google Play) | **Rp 12.960.000** |

> \*Gratis selama pemakaian masih kecil (di bawah batas gratis yang disediakan layanan). Untuk 5 sekolah, pemakaian jauh di bawah batas tersebut.

---

### Skenario: 20 Sekolah

Server perlu lebih besar karena traffic lebih ramai (terutama pagi hari saat guru absen).

| No | Keperluan | Biaya/Tahun (Rp) |
|----|-----------|------------------|
| 1 | Sewa server aplikasi (lebih besar) | Rp 6.480.000 |
| 2 | Sewa server pemroses latar belakang | Rp 3.240.000 |
| 3 | Sewa database (lebih besar, data lebih banyak) | Rp 6.804.000 |
| 4 | Sewa memori cepat | Rp 1.620.000 |
| 5 | Biaya transfer data | Rp 540.000 |
| 6 | Langganan platform hosting (Pro Plan, fitur lebih lengkap) | Rp 4.320.000 |
| 7 | Penyimpanan file | Rp 0-54.000 |
| 8 | Pengiriman notifikasi HP | Rp 0 |
| 9 | Pengiriman email | Rp 0 |
| 10 | Domain | Rp 270.000 |
| 11 | Apple App Store | Rp 1.782.000 |
| | | |
| | **TOTAL/TAHUN** | **~Rp 25.110.000** |

---

### Skenario: 50 Sekolah

Perlu server tambahan agar tetap cepat di jam sibuk pagi.

| No | Keperluan | Biaya/Tahun (Rp) |
|----|-----------|------------------|
| 1 | Sewa server aplikasi (×2, untuk handle beban lebih) | Rp 12.960.000 |
| 2 | Sewa server pemroses latar belakang | Rp 3.240.000 |
| 3 | Sewa database (lebih besar lagi) | Rp 8.424.000 |
| 4 | Sewa memori cepat (lebih besar) | Rp 3.240.000 |
| 5 | Biaya transfer data | Rp 1.080.000 |
| 6 | Langganan platform hosting (Pro Plan) | Rp 4.320.000 |
| 7 | Penyimpanan file | Rp 36.000 |
| 8 | Pengiriman notifikasi HP | Rp 0 |
| 9 | Pengiriman email (mungkin perlu upgrade) | Rp 1.944.000 |
| 10 | Domain | Rp 270.000 |
| 11 | Apple App Store | Rp 1.782.000 |
| | | |
| | **TOTAL/TAHUN** | **~Rp 37.296.000** |

---

## Detail Biaya App Store

### Google Play Store (HP Android)

| Item | Biaya | Keterangan |
|------|-------|------------|
| Pendaftaran akun developer | Rp 450.000 | **Bayar sekali saja, berlaku selamanya** |
| Biaya publish aplikasi | Rp 0 | Gratis |
| Biaya update aplikasi | Rp 0 | Gratis |
| Potongan komisi (jika ada pembelian di dalam app) | Tidak ada | Aplikasi kita gratis, tidak ada pembelian di dalam app |

### Apple App Store (iPhone/iPad)

| Item | Biaya | Keterangan |
|------|-------|------------|
| Apple Developer Program | Rp 1.782.000/tahun | **Wajib bayar setiap tahun** |
| Biaya publish aplikasi | Rp 0 | Gratis |
| Biaya update aplikasi | Rp 0 | Gratis |
| Potongan komisi | Tidak ada | Aplikasi kita gratis |

> ⚠️ **Penting**: Jika keanggotaan Apple Developer Program tidak diperpanjang, aplikasi akan **ditarik dari App Store** — orang tua dan guru tidak bisa download lagi. Ini biaya wajib setiap tahun.

---

## Berapa Harga Minimum agar Tidak Rugi?

### Dengan 5 Sekolah

```
Total biaya setahun:              Rp 13.410.000
Dibagi 5 sekolah:                 Rp  2.682.000/sekolah/tahun

Harga minimum agar tidak rugi:    Rp  2.700.000/sekolah/tahun
```

### Dengan 3 Sekolah (skenario terburuk)

```
Total biaya setahun:              Rp 13.410.000
Dibagi 3 sekolah:                 Rp  4.470.000/sekolah/tahun

Harga minimum agar tidak rugi:    Rp  4.500.000/sekolah/tahun
```

---

## Rekomendasi Harga Jual ke Sekolah

| Paket | Untuk Sekolah | Harga/Tahun | Setara Per Bulan |
|-------|--------------|-------------|------------------|
| **Paket Dasar** | ≤300 siswa (SD kecil) | **Rp 3.600.000** | Rp 300.000 |
| **Paket Standar** | 300-600 siswa (SD/SMP) | **Rp 6.000.000** | Rp 500.000 |
| **Paket Premium** | 600+ siswa (SMA/sekolah besar) | **Rp 9.000.000** | Rp 750.000 |

> Harga di atas sudah termasuk: seluruh fitur (absensi, tagihan, rapor, RPP, notifikasi), akses unlimited untuk semua guru dan orang tua, update aplikasi gratis.

---

## Simulasi Keuntungan

### Proyeksi 3 Tahun (Termasuk Pengembalian Biaya Development)

| | Tahun 1 (5 sekolah) | Tahun 2 (20 sekolah) | Tahun 3 (50 sekolah) | **Total 3 Tahun** |
|---|---|---|---|---|
| Pemasukan | Rp 18.000.000 | Rp 120.000.000 | Rp 360.000.000 | **Rp 498.000.000** |
| Biaya operasional | Rp 13.410.000 | Rp 25.110.000 | Rp 37.296.000 | Rp 75.816.000 |
| Biaya development | Rp 70.000.000 | — | — | Rp 70.000.000 |
| **Sisa (profit)** | **(Rp 65.410.000)** | **Rp 94.890.000** | **Rp 322.704.000** | **Rp 352.184.000** |

> Tahun 1 merugi karena biaya development (investasi awal). Investasi ini terbayar lunas di pertengahan Tahun 2. Setelah itu, keuntungan bersih signifikan.

### Kapan Investasi Development Terbayar Kembali (ROI)?

```
Total investasi awal:         Rp 70.000.000 (development)
                            + Rp 13.410.000 (operasional tahun 1)
                            ─────────────────
                              Rp 83.410.000

Pendapatan tahun 1:           Rp 18.000.000
Sisa yang perlu ditutup:      Rp 65.410.000

Pendapatan tahun 2:           Rp 120.000.000
Biaya operasional tahun 2:  - Rp  25.110.000
Profit tahun 2:               Rp  94.890.000

Sisa setelah tahun 2:        LUNAS (surplus Rp 29.480.000)

TOTAL WAKTU ROI:              ~1.5 tahun (pertengahan tahun ke-2)
```

### Simulasi Harian (Tanpa Memperhitungkan Development)

Setelah investasi terbayar, ini profit bersih per tahun:

| Skenario | Pemasukan/tahun | Biaya ops/tahun | **Profit bersih/tahun** |
|----------|-----------------|-----------------|------------------------|
| 5 sekolah (Paket Dasar) | Rp 18.000.000 | Rp 13.410.000 | Rp 4.590.000 |
| 5 sekolah (Paket Standar) | Rp 30.000.000 | Rp 13.410.000 | Rp 16.590.000 |
| 20 sekolah (Paket Standar) | Rp 120.000.000 | Rp 25.110.000 | Rp 94.890.000 |
| 50 sekolah (campuran) | Rp 360.000.000 | Rp 37.296.000 | Rp 322.704.000 |

---

## Titik Impas (Break-Even)

### Break-Even Operasional (per tahun, tanpa memperhitungkan development)

| Jika charge per sekolah | Butuh berapa sekolah agar operasional tidak rugi? |
|-------------------------|---------------------------------------|
| Rp 2.700.000/tahun | 5 sekolah |
| Rp 3.600.000/tahun | **4 sekolah** (sudah untung dari sekolah ke-4) |
| Rp 6.000.000/tahun | **3 sekolah** (sudah untung dari sekolah ke-3) |

### Break-Even Total (termasuk pengembalian investasi development)

| Skenario pertumbuhan | Estimasi waktu ROI |
|---------------------|--------------------|
| Konservatif (5 → 15 → 30 sekolah) | ~2 tahun |
| Moderat (5 → 20 → 50 sekolah) | ~1.5 tahun |
| Agresif (10 → 40 → 80 sekolah) | ~1 tahun |

---

## Model Pembayaran yang Direkomendasikan

| Aspek | Rekomendasi | Alasan |
|-------|-------------|--------|
| **Cara bayar** | Transfer bank, bayar di muka per tahun | Sesuai siklus pencairan dana BOS/yayasan |
| **Waktu bayar** | Awal tahun ajaran (Juli) | Saat dana pendidikan baru cair |
| **Kontrak** | Minimum 1 tahun | Menjamin stabilitas pendapatan |
| **Perpanjangan** | Otomatis, kecuali sekolah minta berhenti | Mengurangi churn |
| **Diskon** | Bayar 2 tahun sekaligus = diskon 10% | Insentif komitmen jangka panjang |

---

## Kenapa Biaya Bisa Sangat Rendah?

1. **Sistem cloud bayar sesuai pemakaian** — Tidak sewa komputer utuh, hanya bayar yang terpakai
2. **Notifikasi gratis tanpa batas** — Firebase tidak mencharge per notifikasi
3. **Penyimpanan file tanpa biaya download** — Cloudflare R2 tidak charge saat orang tua download bukti bayar
4. **Satu server untuk semua sekolah** — Data dipisah secara aman, tapi infrastruktur dishare (lebih hemat)
5. **Tidak pakai payment gateway** — Orang tua upload bukti transfer manual, jadi tidak ada potongan 2-3% per transaksi

---

## Risiko yang Perlu Diperhatikan

| Risiko | Dampak | Cara Mengatasinya |
|--------|--------|-------------------|
| Hanya dapat 3 sekolah tahun pertama | Rugi ~Rp 1.6 juta jika charge Rp 3.6 juta | Naikkan harga atau cari 1 sekolah tambahan |
| Sekolah berhenti di tengah tahun | Pendapatan berkurang | Kontrak 1 tahun penuh, bayar di muka |
| Harga layanan cloud naik | Biaya operasional naik 10-30% | Margin keuntungan 26-55% sudah cukup menyerap kenaikan |
| Biaya Apple Developer naik | Tambah ~Rp 200-500rb/tahun | Dampak kecil terhadap total biaya |
| Traffic terlalu tinggi (banyak pengguna bersamaan) | Perlu server lebih besar | Buffer keuntungan bisa dipakai untuk upgrade |

---

## Catatan Penting

- **Biaya di atas BELUM termasuk**: gaji/waktu pengembang, biaya pemasaran, dan biaya support ke sekolah
- **Biaya di atas HANYA biaya infrastruktur** (server, hosting, app store)
- **Harga dapat berubah** sesuai kebijakan masing-masing layanan cloud
- **Kurs yang digunakan**: $1 = Rp 18.000

---

*Dokumen ini berisi estimasi berdasarkan harga publik layanan cloud per Juli 2025.*
