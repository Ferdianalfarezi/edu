# Sistem Manajemen Sekolah — Project Overview

## Apa Ini?

Sebuah aplikasi digital untuk membantu sekolah mengelola operasional harian:
1. **Absensi siswa** — pencatatan kehadiran harian
2. **Pembayaran SPP** — tagihan bulanan dan konfirmasi pembayaran
3. **Komunikasi ke orang tua** — notifikasi otomatis tentang kehadiran dan pembayaran anak
4. **Rapor online** — input nilai oleh guru, finalisasi oleh wali kelas, dilihat orang tua
5. **RPP/Modul Ajar** — portal materi pembelajaran yang dibuat guru dan bisa diakses seluruh guru di sekolah

Sistem ini bisa digunakan oleh **banyak sekolah sekaligus** (multi-tenant), tapi data tiap sekolah benar-benar terpisah dan aman.

---

## Siapa yang Menggunakan?

| Pengguna | Cara Akses | Fungsi Utama |
|----------|-----------|--------------|
| **Admin Sekolah** | Website (laptop/PC) | Kelola data siswa, kelas, guru, tahun ajaran |
| **Bendahara** | Website (laptop/PC) | Buat tagihan SPP, verifikasi pembayaran, lihat tunggakan |
| **Kepala Sekolah** | Website (laptop/PC) | Lihat laporan absensi, keuangan, dan rapor |
| **Guru** | Aplikasi HP + Website | Input absensi, input nilai rapor, buat RPP, lihat jadwal |
| **Orang Tua** | Aplikasi HP | Lihat absensi anak, bayar SPP, lihat rapor, terima notifikasi |
| **Super Admin** (pemilik platform) | Website | Tambah/hapus sekolah pelanggan |

---

## Platform yang Dibangun

### 1. Aplikasi Mobile (HP Android & iPhone)
- Satu aplikasi untuk **guru** dan **orang tua**
- Tampilan otomatis menyesuaikan siapa yang login
- Guru login pakai email + password
- Orang tua login cukup pakai **nomor HP** (tanpa password, tanpa kode SMS)

### 2. Admin Panel (Website)
- Diakses lewat browser di laptop/PC
- Untuk admin, bendahara, kepala sekolah, dan guru
- Guru bisa pakai website sebagai alternatif kalau HP rusak atau lebih nyaman di layar besar

---

## Fitur Lengkap

### 📋 MODUL 1: ABSENSI

#### Bagaimana Guru Mencatat Kehadiran?
1. Guru buka aplikasi HP (atau website)
2. Sistem otomatis menampilkan **hanya kelas yang dijadwalkan** untuk guru tersebut hari ini
3. Guru pilih kelas → muncul daftar seluruh siswa
4. Guru centang status tiap siswa: **Hadir / Izin / Sakit / Alpa** (tidak hadir tanpa keterangan)
5. Semua siswa harus diisi — tidak bisa simpan kalau ada yang kosong
6. Tekan simpan → selesai
7. Kalau hari itu adalah hari libur yang sudah dikonfigurasi, sistem menampilkan peringatan tapi tetap mengizinkan input

**Aturan penting:**
- Absensi dicatat **sekali per hari per kelas** (bukan per jam pelajaran)
- Guru pertama yang buka kelas hari itu yang mengisi, guru lain di kelas yang sama hanya bisa lihat
- Kalau ada salah, guru atau kepala sekolah bisa edit kapan saja (tercatat siapa yang edit dan kapan)
- Admin **tidak bisa** edit absensi (mencegah manipulasi data)

#### Guru Pengganti
- Kalau guru berhalangan hadir, admin atau guru itu sendiri bisa menugaskan guru lain sebagai pengganti
- Guru pengganti hanya bisa input absensi untuk hari itu saja, tidak bisa edit data lama

#### Offline Mode (Tanpa Internet)
- Guru bisa input absensi **walau tidak ada internet** (di HP)
- Data disimpan lokal di HP
- Saat internet tersedia, data otomatis ter-upload ke server
- Ada indikator di layar: online ✅ atau offline ⚠️

#### Apa yang Dilihat Kepala Sekolah?
- **Dashboard harian**: ringkasan kehadiran seluruh kelas hari ini
- **Rekap bulanan/semester**: berapa kali tiap siswa hadir, izin, sakit, alpa
- **Persentase kehadiran**: dihitung otomatis dari hari efektif (hari libur otomatis dikurangi)
- **Daftar perhatian khusus**: siswa yang terlalu sering alpa
- **Export laporan**: unduh data ke file Excel/PDF

#### Apa yang Dilihat Orang Tua?
- Kalender kehadiran anak (warna beda untuk hadir/izin/sakit/alpa)
- Ringkasan bulanan
- Kalau punya lebih dari 1 anak, data dipisah per anak

---

### 💰 MODUL 2: TAGIHAN & PEMBAYARAN SPP

#### Bagaimana Tagihan Dibuat?
1. Bendahara bisa buat tagihan **per bulan** atau **sekaligus satu tahun ajaran**
2. Nominal SPP bisa berbeda per tingkat kelas (misal: kelas 1-3 = Rp 300.000, kelas 4-6 = Rp 400.000)
3. Siswa baru masuk di tengah tahun → tagihan otomatis dibuat dari bulan masuk sampai akhir tahun ajaran
4. Orang tua otomatis terima notifikasi saat tagihan baru di-generate

#### Bagaimana Orang Tua Membayar?
1. Orang tua buka aplikasi → lihat daftar tagihan
2. Pilih tagihan yang mau dibayar
3. Transfer uang ke rekening sekolah (via m-banking/ATM)
4. Kembali ke aplikasi → upload **foto bukti transfer** + isi **jumlah yang dibayar**
5. Status berubah menjadi "Menunggu Verifikasi"
6. Tunggu bendahara konfirmasi

**Aturan pembayaran via upload:**
- Minimal pembayaran: Rp 10.000
- Tidak boleh bayar lebih dari sisa tagihan
- Maksimal **2 kali cicilan** per tagihan:
  - Cicilan pertama: berapa saja (minimal Rp 10.000)
  - Cicilan kedua: **harus lunasi seluruh sisa**
- Foto bukti transfer otomatis dikompres supaya tidak boros penyimpanan
- File foto dihapus otomatis setelah 3 tahun (data transaksi tetap tersimpan)

#### Bagaimana Bendahara Memverifikasi?
1. Bendahara buka halaman verifikasi di website
2. Muncul daftar pembayaran yang perlu dicek + foto bukti transfer + nominal
3. Kalau valid → Approve. Status otomatis: jumlah = sisa → "Lunas", jumlah < sisa → "Cicilan"
4. Kalau tidak valid → Reject + tulis alasan penolakan
5. Orang tua terima notifikasi hasilnya

#### Pembayaran Tunai di Sekolah
- Bendahara juga bisa catat pembayaran manual (cash). Lebih fleksibel: tidak ada batasan berapa kali cicilan, yang penting totalnya sesuai tagihan.

#### Kelola Tagihan
- **Hapus tagihan**: hanya bisa kalau belum ada aktivitas pembayaran
- **Edit nominal**: hanya bisa kalau belum ada pembayaran/cicilan
- **Batalkan tagihan**: untuk kasus khusus (misal beasiswa) — hanya kalau belum ada pembayaran

#### Audit Trail (Jejak Aktivitas Keuangan)
- Setiap aktivitas di modul keuangan tercatat permanen: siapa melakukan apa, kapan, dan apa yang berubah. Data ini tidak bisa dihapus oleh siapapun.

---

### 🔔 MODUL 3: NOTIFIKASI

#### Kapan Orang Tua Menerima Notifikasi?
| Event | Notifikasi dikirim? |
|-------|-------------------|
| Anak tidak hadir (izin/sakit/alpa) | ✅ Otomatis, langsung |
| Anak hadir | ⚙️ Opsional (default: mati, bisa dinyalakan) |
| Tagihan baru di-generate | ✅ Otomatis |
| Pembayaran disetujui | ✅ Otomatis |
| Pembayaran ditolak | ✅ Otomatis + alasan |
| Rapor tersedia | ✅ Otomatis |

- Notifikasi muncul sebagai push notification di HP (seperti notif WhatsApp)
- Orang tua bisa atur preferensi per anak
- Riwayat tersimpan minimal 1 tahun ajaran

---

### 📝 MODUL 4: RAPOR ONLINE

#### Bagaimana Rapor Dibuat?
1. **Guru** input nilai untuk mata pelajaran yang mereka ajar (hanya via website, layar besar lebih nyaman)
2. Guru bisa simpan sebagai draft atau langsung submit ke wali kelas
3. **Wali kelas** review seluruh nilai → isi catatan & P5 (opsional) → finalisasi
4. Saat difinalkan: ranking otomatis dihitung, rapor jadi visible ke orang tua, notifikasi terkirim

#### Periode Rapor
- UTS Semester 1 (hanya nilai wajib, deskripsi opsional)
- Semester 1 (nilai + deskripsi wajib)
- UTS Semester 2
- Semester 2

#### Apa yang Dilihat Orang Tua?
- Daftar periode rapor yang tersedia
- Nilai per mata pelajaran + deskripsi capaian
- Catatan wali kelas
- P5 (kalau diisi)
- Peringkat di kelas + rata-rata nilai

#### Konfigurasi Penilaian
- Template Kurikulum Merdeka sebagai default (bisa dicustom per sekolah)
- Admin bisa atur: skala nilai (angka/huruf/deskripsi), komponen wajib/opsional
- Export rapor ke Excel untuk laporan ke dinas

#### Kepala Sekolah
- Bisa lihat rapor semua kelas (draft + final) dengan indikator status
- Filter berdasarkan kelas, periode, tahun ajaran

---

### 📚 MODUL 5: RPP / MODUL AJAR (Portal Materi)

#### Apa Ini?
Portal internal sekolah di mana guru bisa membuat, menyimpan, dan berbagi rencana pembelajaran (RPP/Modul Ajar) dengan sesama guru.

#### Bagaimana Cara Kerjanya?
1. Guru buat RPP — bisa tulis langsung di sistem (rich text editor) ATAU upload file (PDF/Word/PPT)
2. Isi metadata: judul, mata pelajaran, kategori, tahun terbit
3. Simpan sebagai draft (hanya guru pembuat yang bisa lihat) atau langsung publish
4. Setelah publish: semua guru di sekolah bisa lihat, download, dan favorit

#### Fitur Portal
- **Search**: cari RPP berdasarkan judul
- **Filter**: kategori, mata pelajaran, tahun terbit
- **Favorit**: tandai bintang ⭐ untuk bookmark materi yang berguna
- **Download**: guru/kepsek/admin bisa download RPP yang sudah dipublish
- **Kategori**: custom per sekolah (searchable dropdown — kalau belum ada, otomatis terbuat baru)

#### Aturan
- Hanya guru pembuat yang bisa edit/hapus RPP miliknya
- RPP hanya terlihat oleh guru di sekolah yang sama (tidak lintas sekolah)
- Max upload file: 10MB

---

### 🏫 MODUL 6: ADMIN & MANAJEMEN

#### Fitur Admin Utama:
- Manajemen siswa: tambah, edit, pindah kelas, keluarkan (dengan pencarian dan filter)
- Manajemen kelas & tahun ajaran: otomatis copy kelas ke tahun baru
- Assign wali kelas (1 guru = 1 kelas, validasi tidak duplikat)
- Kenaikan kelas massal: naikkan seluruh kelas sekaligus di akhir tahun
- Jadwal pelajaran per semester: menentukan guru mana boleh absen di kelas mana
- Hari libur: admin set tanggal libur, otomatis dikurangi dari hari efektif
- Onboarding orang tua: upload Excel → orang tua langsung bisa login
- Bulk create guru: upload Excel → akun guru dibuat massal, password dikirim via email
- Deaktivasi guru: otomatis hapus dari jadwal dan wali kelas, tandai slot kosong
- Konfigurasi per sekolah: nominal SPP, batas alpa, tanggal jatuh tempo, dll

#### Login & Keamanan
| Pengguna | Cara Login | Masa Aktif Sesi |
|----------|-----------|----------------|
| Admin/Bendahara/Kepsek (web) | Email + Password | 24 jam |
| Guru (web) | Email + Password | 24 jam |
| Guru (HP) | Email + Password | 90 hari |
| Orang Tua (HP) | Nomor HP saja | 1 tahun |

- Password terenkripsi, 5x salah = lock 15 menit
- Guru baru wajib ganti password saat login pertama
- Reset dan ubah password tersedia di web + app
- Deactivate user/tenant = langsung logout (token diinvalidasi)

#### Multi-Tenant (Multi-Sekolah)
- Data 100% terpisah antar sekolah
- Orang tua lintas sekolah bisa lihat semua anak dalam 1 app
- Super admin kelola semua sekolah dari 1 dashboard

---

## Ringkasan Jumlah Fitur

| Modul | Jumlah Requirement |
|-------|-------------------|
| Absensi | 8 (input, edit, lihat, rekap, dashboard, offline, jadwal, guru pengganti) |
| Notifikasi | 3 (real-time, riwayat, preferensi) |
| Tagihan/Billing | 9 (buat, generate, upload, verifikasi, manual, riwayat, tunggakan, audit, kelola) |
| Admin & Manajemen | 13 (siswa, kelas, user, login, password, onboarding, config, tenant, super admin, kenaikan, mapel, deaktivasi, hari libur) |
| Rapor Online | 5 (config penilaian, input nilai, finalisasi, lihat orang tua, export) |
| RPP/Modul Ajar | 4 (buat, edit/hapus, portal/cari, favorit) |
| Umum | 2 (lihat jadwal guru, pagination) |
| **Total** | **44 requirements** |

---

## Flow Utama (Alur Penggunaan Harian)

### Pagi Hari — Guru Input Absensi
```
Guru buka app → Lihat kelas hari ini → Pilih kelas → 
Centang kehadiran semua siswa → Simpan → 
Orang tua terima notifikasi otomatis
```

### Orang Tua Bayar SPP
```
Buka app → Lihat tagihan → Transfer via m-banking → 
Upload foto bukti + nominal → Tunggu verifikasi → 
Bendahara approve → Terima notifikasi "Lunas"
```

### Guru Input Nilai Rapor
```
Guru login web → Pilih mapel + kelas + periode → 
Input nilai per siswa → Submit ke wali kelas → 
Wali kelas review + finalisasi → Rapor visible ke ortu + notifikasi terkirim
```

### Guru Buat RPP
```
Guru buka portal RPP → Buat baru → Tulis/upload materi → 
Pilih kategori + mapel → Publish → 
Guru lain bisa lihat, download, favorit
```

### Awal Tahun Ajaran
```
Admin buat tahun ajaran baru (status: disiapkan) → Kelas ter-copy otomatis → 
Admin edit kelas jika perlu → Proses kenaikan kelas → 
Admin aktifkan tahun ajaran baru → Buat jadwal semester → 
Bendahara generate tagihan → Sistem siap
```

---

## Apa yang TIDAK Dibangun (Ditunda)

- ❌ Payment gateway online (QRIS/VA)
- ❌ Absensi guru
- ❌ Absensi via QR code atau RFID
- ❌ Laporan keuangan ke yayasan
- ❌ Pengumuman sekolah
- ❌ Jadwal pelajaran untuk siswa/orang tua
- ❌ Integrasi Dapodik
- ❌ Multi-cabang yayasan
- ❌ Verifikasi OTP via SMS (reserved)

---

## Kenapa Sistem Ini Bernilai?

1. **Menghemat waktu**: absensi manual 30 menit → digital 2 menit per kelas
2. **Transparansi**: orang tua langsung tahu anak hadir atau tidak
3. **Mengurangi tunggakan**: bayar SPP langsung dari HP
4. **Aman**: setiap perubahan keuangan tercatat permanen (audit trail)
5. **Scalable**: satu sistem untuk banyak sekolah, biaya per sekolah rendah
6. **Mobile-first**: guru dan orang tua cukup pakai HP
7. **Knowledge sharing**: guru bisa saling berbagi materi pembelajaran via portal RPP
8. **Rapor digital**: orang tua bisa lihat rapor anak langsung di HP tanpa perlu ke sekolah

---

*Dokumen ini menjelaskan scope MVP (Minimum Viable Product — versi pertama yang layak dijual). Total 44 requirements, 8 modul, mencakup seluruh fitur inti untuk operasional harian sekolah.*
