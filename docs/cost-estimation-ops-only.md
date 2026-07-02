# Estimasi Biaya Operasional Sistem Manajemen Sekolah (Per Tahun)

*Terakhir diperbarui: Juli 2025*
*Kurs yang digunakan: $1 = Rp 18.000*
*Dokumen ini hanya berisi biaya operasional (tanpa biaya development).*

---

## Apa Saja yang Perlu Dibayar untuk Menjalankan Sistem Ini?

Sistem ini berjalan di internet (cloud), jadi ada biaya sewa "tempat" untuk menjalankan aplikasi, menyimpan data, dan mengirim notifikasi. Berikut rinciannya:

---

## Biaya Operasional Per Tahun

### Skenario: 5 Sekolah (Tahun Pertama)

Ini adalah skenario paling kecil — baru mulai dengan 5 sekolah pelanggan.

| No | Keperluan | Penjelasan Singkat | Biaya/Tahun (Rp) |
|----|-----------|-------------------|------------------|
| 1 | **Sewa server aplikasi** (komputer cloud yang menjalankan sistem 24 jam) | Tempat aplikasi berjalan agar bisa diakses oleh guru dan orang tua | Rp 3.240.000 |
| 2 | **Sewa server pemroses latar belakang** (komputer khusus untuk notifikasi & file) | Mengirim notifikasi ke HP, memproses foto bukti transfer | Rp 1.620.000 |
| 3 | **Sewa database** (gudang penyimpanan semua data sekolah) | Tempat menyimpan data siswa, absensi, tagihan, rapor, dll | Rp 3.402.000 |
| 4 | **Sewa memori cepat** (penyimpanan sementara untuk antrian & keamanan) | Antrian notifikasi yang harus terkirim cepat + keamanan login | Rp 1.350.000 |
| 5 | **Biaya transfer data** (biaya saat pengguna mengakses data dari server) | Setiap kali guru/orang tua buka app, ada data yang dikirim dari server | Rp 216.000 |
| 6 | **Langganan platform cloud** (biaya tetap untuk menggunakan layanan hosting) | Biaya berlangganan layanan Railway (tempat server berjalan) | Rp 1.080.000 |
| 7 | **Penyimpanan file** (tempat foto bukti transfer & dokumen RPP) | Foto-foto dan file yang diupload oleh pengguna | Rp 0 (gratis*) |
| 8 | **Pengiriman notifikasi HP** (layanan pengirim notifikasi ke HP orang tua & guru) | Layanan dari Google (Firebase) untuk kirim notifikasi push | Rp 0 (gratis, tanpa batas) |
| 9 | **Pengiriman email** (untuk reset password & kirim kredensial guru baru) | Layanan kirim email otomatis ke guru/admin | Rp 0 (gratis*) |
| 10 | **Sewa nama website** (alamat web, contoh: edukita.com) | Agar sistem bisa diakses lewat browser | Rp 270.000 |
| 11 | **Biaya publish di Apple App Store** (agar app tetap bisa didownload di iPhone) | Biaya wajib tahunan dari Apple | Rp 1.782.000 |
| 12 | **Biaya publish di Google Play Store** (agar app bisa didownload di Android) | Biaya pendaftaran satu kali, berlaku selamanya | Rp 450.000 |
| | | | |
| | **TOTAL TAHUN PERTAMA** | | **Rp 13.410.000** |
| | **TOTAL TAHUN KE-2 DAN SETERUSNYA** | (tanpa biaya Google Play) | **Rp 12.960.000** |

> \*Gratis selama pemakaian masih kecil (di bawah batas gratis yang disediakan layanan). Untuk 5 sekolah, pemakaian jauh di bawah batas tersebut.

---

### Skenario: 20 Sekolah

Server perlu lebih besar karena lebih banyak pengguna (terutama pagi hari saat guru absen).

| No | Keperluan | Biaya/Tahun (Rp) |
|----|-----------|------------------|
| 1 | Sewa server aplikasi (lebih besar) | Rp 6.480.000 |
| 2 | Sewa server pemroses latar belakang | Rp 3.240.000 |
| 3 | Sewa database (lebih besar, data lebih banyak) | Rp 6.804.000 |
| 4 | Sewa memori cepat | Rp 1.620.000 |
| 5 | Biaya transfer data | Rp 540.000 |
| 6 | Langganan platform cloud (paket lebih lengkap) | Rp 4.320.000 |
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
| 1 | Sewa server aplikasi (×2, untuk menangani beban lebih tinggi) | Rp 12.960.000 |
| 2 | Sewa server pemroses latar belakang | Rp 3.240.000 |
| 3 | Sewa database (lebih besar lagi) | Rp 8.424.000 |
| 4 | Sewa memori cepat (lebih besar) | Rp 3.240.000 |
| 5 | Biaya transfer data | Rp 1.080.000 |
| 6 | Langganan platform cloud | Rp 4.320.000 |
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

### Apple App Store (iPhone/iPad)

| Item | Biaya | Keterangan |
|------|-------|------------|
| Apple Developer Program | Rp 1.782.000/tahun | **Wajib bayar setiap tahun** |
| Biaya publish aplikasi | Rp 0 | Gratis |
| Biaya update aplikasi | Rp 0 | Gratis |

> ⚠️ **Penting**: Jika keanggotaan Apple Developer Program tidak diperpanjang, aplikasi akan **ditarik dari App Store** — orang tua dan guru tidak bisa download lagi.

---

## Berapa Harga Minimum agar Tidak Rugi? (Operasional Saja)

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

## Simulasi Keuntungan (Operasional Saja, Tanpa Biaya Development)

### Jika Charge Rp 8.000.000/sekolah/tahun

| Skenario | Pendapatan/tahun | Biaya ops/tahun | **Profit/tahun** | Margin |
|----------|-----------------|-----------------|------------------|--------|
| 5 sekolah | Rp 40.000.000 | Rp 13.410.000 | **Rp 26.590.000** | 66% |
| 10 sekolah | Rp 80.000.000 | Rp 16.000.000 | **Rp 64.000.000** | 80% |
| 20 sekolah | Rp 160.000.000 | Rp 25.110.000 | **Rp 134.890.000** | 84% |
| 50 sekolah | Rp 400.000.000 | Rp 37.296.000 | **Rp 362.704.000** | 91% |

---

## Titik Impas Operasional (Break-Even)

| Jika charge per sekolah/tahun | Butuh berapa sekolah agar operasional tidak rugi? |
|-------------------------------|---------------------------------------------------|
| Rp 2.700.000 | 5 sekolah |
| Rp 3.600.000 | 4 sekolah |
| Rp 6.000.000 | 3 sekolah |
| Rp 8.000.000 | **2 sekolah** (sudah untung dari sekolah ke-2) |

---

## Biaya per Sekolah Semakin Murah Seiring Pertumbuhan

| Jumlah Sekolah | Biaya Operasional/Tahun | Biaya per Sekolah/Tahun |
|----------------|-------------------------|-------------------------|
| 5 sekolah | Rp 13.410.000 | Rp 2.682.000 |
| 20 sekolah | Rp 25.110.000 | Rp 1.256.000 |
| 50 sekolah | Rp 37.296.000 | Rp 746.000 |
| 100 sekolah | Rp 50.000.000 | Rp 500.000 |

> Biaya per sekolah turun drastis karena infrastruktur digunakan bersama (shared). Dari 5 ke 100 sekolah, biaya per-sekolah turun 5x lipat.

---

## Kapan Biaya Naik

| Pemicu | Estimasi terjadi pada | Tambahan biaya/tahun |
|--------|----------------------|---------------------|
| Upgrade ke paket hosting lebih lengkap | >5 sekolah | +Rp 2.880.000 |
| Tambah server cadangan | 50+ sekolah | +Rp 5.760.000 |
| Upgrade database | 100+ sekolah | +Rp 7.680.000 |
| Upgrade layanan email (jika volume tinggi) | >9.000 email/bulan | +Rp 1.728.000 |

---

## Model Pembayaran yang Direkomendasikan

| Aspek | Rekomendasi | Alasan |
|-------|-------------|--------|
| **Cara bayar** | Transfer bank, bayar di muka per tahun | Sesuai siklus pencairan dana BOS/yayasan |
| **Waktu bayar** | Awal tahun ajaran (Juli) | Saat dana pendidikan baru cair |
| **Kontrak** | Minimum 1 tahun | Menjamin stabilitas pendapatan |
| **Perpanjangan** | Otomatis, kecuali sekolah minta berhenti | Mengurangi kehilangan pelanggan |
| **Diskon** | Bayar 2 tahun sekaligus = diskon 10% | Insentif komitmen jangka panjang |

---

## Kenapa Biaya Bisa Sangat Rendah?

1. **Sistem cloud bayar sesuai pemakaian** — Tidak sewa komputer utuh, hanya bayar yang terpakai
2. **Notifikasi gratis tanpa batas** — Firebase (milik Google) tidak mencharge per notifikasi
3. **Penyimpanan file tanpa biaya download** — Cloudflare R2 tidak charge saat orang tua download bukti bayar
4. **Satu server untuk semua sekolah** — Data dipisah secara aman, tapi infrastruktur dishare (lebih hemat)
5. **Tidak pakai payment gateway** — Orang tua upload bukti transfer manual, jadi tidak ada potongan 2-3% per transaksi

---

## Risiko yang Perlu Diperhatikan

| Risiko | Dampak | Cara Mengatasinya |
|--------|--------|-------------------|
| Hanya dapat 1-2 sekolah | Operasional mungkin rugi | Naikkan harga atau cari sekolah tambahan |
| Sekolah berhenti di tengah tahun | Pendapatan berkurang | Kontrak 1 tahun penuh, bayar di muka |
| Harga layanan cloud naik | Biaya operasional naik 10-30% | Margin keuntungan 66-91% sudah cukup menyerap kenaikan |
| Apple menaikkan biaya developer | Tambah ~Rp 200-500rb/tahun | Dampak kecil terhadap total biaya |

---

## Catatan Penting

- **Biaya di atas HANYA biaya operasional** (server, hosting, app store)
- **TIDAK termasuk**: biaya development, gaji tim, biaya pemasaran, biaya support
- **Harga dapat berubah** sesuai kebijakan masing-masing layanan cloud
- **Kurs yang digunakan**: $1 = Rp 18.000

---

*Dokumen ini berisi estimasi berdasarkan harga publik layanan cloud per Juli 2025.*
