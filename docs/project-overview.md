# Sistem Manajemen Sekolah — Project Overview

## Apa Ini?

Sebuah aplikasi digital untuk membantu sekolah mengelola tiga hal penting sehari-hari:
1. **Absensi siswa** — pencatatan kehadiran harian
2. **Pembayaran SPP** — tagihan bulanan dan konfirmasi pembayaran
3. **Komunikasi ke orang tua** — notifikasi otomatis tentang kehadiran dan pembayaran anak

Sistem ini bisa digunakan oleh **banyak sekolah sekaligus** (multi-tenant), tapi data tiap sekolah benar-benar terpisah dan aman.

---

## Siapa yang Menggunakan?

| Pengguna | Cara Akses | Fungsi Utama |
|----------|-----------|--------------|
| **Admin Sekolah** | Website (laptop/PC) | Kelola data siswa, kelas, guru, tahun ajaran |
| **Bendahara** | Website (laptop/PC) | Buat tagihan SPP, verifikasi pembayaran, lihat tunggakan |
| **Kepala Sekolah** | Website (laptop/PC) | Lihat laporan absensi dan keuangan |
| **Guru** | Aplikasi HP + Website | Input absensi siswa, lihat jadwal mengajar |
| **Orang Tua** | Aplikasi HP | Lihat absensi anak, bayar SPP, terima notifikasi |
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
- Guru bisa pakai website sebagai alternatif kalau HP-nya rusak atau lebih nyaman di layar besar

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
- **Daftar perhatian khusus**: siswa yang terlalu sering alpa (batasnya bisa diatur per sekolah)
- **Export laporan**: unduh data ke file Excel/PDF

#### Apa yang Dilihat Orang Tua?
- Kalender kehadiran anak (warna beda untuk hadir/izin/sakit/alpa)
- Ringkasan bulanan
- Kalau punya lebih dari 1 anak, data dipisah per anak

---

### 💰 MODUL 2: TAGIHAN & PEMBAYARAN SPP

#### Bagaimana Tagihan Dibuat?
1. Bendahara bisa buat tagihan **per bulan** atau **sekaligus satu tahun ajaran** (sistem otomatis generate untuk semua siswa)
2. Nominal SPP bisa berbeda per tingkat kelas (misal: kelas 1-3 = Rp 300.000, kelas 4-6 = Rp 400.000)
3. Kalau ada siswa baru masuk di tengah tahun, tagihan otomatis dibuat dari bulan masuk sampai akhir tahun ajaran

#### Bagaimana Orang Tua Membayar?
1. Orang tua buka aplikasi → lihat daftar tagihan
2. Pilih tagihan yang mau dibayar
3. Transfer uang ke rekening sekolah (di luar aplikasi — via m-banking/ATM)
4. Kembali ke aplikasi → upload **foto bukti transfer** + isi **jumlah yang dibayar**
5. Status berubah menjadi "Menunggu Verifikasi"
6. Selesai — tinggal tunggu bendahara konfirmasi

**Aturan pembayaran via upload:**
- Minimal pembayaran: Rp 10.000
- Tidak boleh bayar lebih dari sisa tagihan
- Maksimal **2 kali cicilan** per tagihan:
  - Cicilan pertama: berapa saja (minimal Rp 10.000)
  - Cicilan kedua: **harus lunasi seluruh sisa**
- Foto bukti transfer otomatis dikompres (diperkecil ukurannya) supaya tidak boros penyimpanan
- File foto dihapus otomatis setelah 3 tahun (data transaksi tetap tersimpan)

#### Bagaimana Bendahara Memverifikasi?
1. Bendahara buka halaman verifikasi di website
2. Muncul daftar pembayaran yang perlu dicek, lengkap dengan foto bukti transfer dan nominal yang diklaim orang tua
3. Bendahara cek: apakah bukti transfer valid dan jumlahnya sesuai?
4. Kalau valid → **Approve** (setuju). Status otomatis berubah:
   - Kalau jumlah = sisa tagihan → status jadi "Lunas"
   - Kalau jumlah < sisa tagihan → status jadi "Cicilan"
5. Kalau tidak valid → **Reject** (tolak) + tulis alasan (misal: "foto blur" atau "nominal tidak sesuai")
6. Orang tua terima notifikasi hasilnya

#### Pembayaran Tunai di Sekolah
- Bendahara juga bisa catat pembayaran manual (untuk orang tua yang bayar cash langsung di sekolah)
- Pembayaran manual **lebih fleksibel**: tidak ada batasan berapa kali cicilan, yang penting totalnya sesuai
- Setiap pembayaran manual juga tidak boleh melebihi sisa tagihan

#### Kelola Tagihan
- **Hapus tagihan**: hanya bisa kalau belum ada aktivitas pembayaran sama sekali
- **Edit nominal**: hanya bisa kalau belum ada pembayaran/cicilan
- **Batalkan tagihan**: untuk kasus khusus (misal siswa dapat beasiswa) — status berubah jadi "Dibatalkan" dengan alasan tercatat

#### Dashboard Tunggakan
- Bendahara bisa lihat seluruh siswa yang belum lunas, diurutkan dari yang paling lama nunggak
- Bisa filter per kelas
- Bisa export ke Excel/CSV untuk laporan ke yayasan

#### Bukti Pembayaran Digital
- Setiap pembayaran yang dikonfirmasi, sistem otomatis generate bukti bayar digital
- Orang tua bisa unduh dalam format PDF
- Berisi: nama siswa, kelas, bulan, nominal, tanggal bayar, dan nomor referensi unik

#### Audit Trail (Jejak Aktivitas Keuangan)
- **Setiap aktivitas** di modul keuangan tercatat: siapa melakukan apa, kapan, dan apa yang berubah
- Data ini **tidak bisa dihapus atau diubah** (immutable/permanen)
- Kepala sekolah bisa lihat (read-only) untuk transparansi
- Contoh yang dicatat: buat tagihan, approve pembayaran, tolak bukti, edit nominal, hapus tagihan, batalkan tagihan

---

### 🔔 MODUL 3: NOTIFIKASI

#### Kapan Orang Tua Menerima Notifikasi?
| Event | Notifikasi dikirim? |
|-------|-------------------|
| Anak tidak hadir (izin/sakit/alpa) | ✅ Otomatis, langsung |
| Anak hadir | ⚙️ Opsional (default: mati, bisa dinyalakan) |
| Pembayaran disetujui bendahara | ✅ Otomatis |
| Pembayaran ditolak bendahara | ✅ Otomatis + alasan penolakan |

**Detail teknis:**
- Notifikasi muncul sebagai push notification (seperti notif WhatsApp — muncul di layar HP walau app tidak dibuka)
- Untuk absensi online: dikirim dalam 30 detik
- Untuk absensi offline (guru input tanpa internet): dikirim setelah data berhasil sync ke server
- Isi notifikasi: nama anak, status kehadiran, tanggal, kelas, dan waktu dicatat guru
- Kalau punya banyak anak, notifikasi terpisah per anak

#### Riwayat Notifikasi
- Orang tua bisa lihat kembali seluruh notifikasi yang pernah diterima
- Tersimpan minimal 1 tahun ajaran

#### Preferensi Notifikasi
- Orang tua bisa atur sendiri: mau terima notifikasi hadir atau tidak
- Bisa diatur per anak (kalau punya lebih dari 1 anak)

---

### 🏫 MODUL 4: ADMIN & MANAJEMEN

#### Manajemen Siswa
- Admin input data siswa: nama, NISN (nomor induk), kelas, jenis kelamin, tanggal lahir, alamat, dan data orang tua (nama + nomor HP)
- Bisa pindahkan siswa ke kelas lain (tercatat riwayatnya)
- Siswa yang keluar/pindah sekolah di-soft delete (data tetap ada untuk riwayat, tapi tersembunyi dari tampilan aktif)
- **Pencarian**: cari siswa by nama atau NISN
- **Filter**: berdasarkan kelas, status (aktif/keluar), tahun ajaran

#### Manajemen Kelas & Tahun Ajaran
- Admin buat kelas: nama (misal "1A"), tingkat (misal "1"), wali kelas, kapasitas
- Admin buat tahun ajaran: nama (misal "2024/2025"), tanggal mulai, tanggal selesai
- Hanya 1 tahun ajaran aktif per sekolah pada satu waktu
- **Saat aktifkan tahun ajaran baru**: sistem otomatis copy struktur kelas dari tahun sebelumnya (nama + tingkat sama, siswa dan wali kelas kosong). Admin tinggal edit kalau ada perubahan.
- Kelas hanya perlu dibuat manual di tahun pertama saat sekolah baru pakai sistem

#### Kenaikan Kelas Massal
- Di akhir tahun ajaran, admin bisa naikkan seluruh siswa sekaligus
- Sistem suggest kelas tujuan otomatis (tingkat +1)
- Admin bisa exclude siswa tertentu (yang tidak naik kelas)
- Siswa kelas tertinggi (misal kelas 6) ditandai "lulus" → jadi alumni
- Riwayat kelas tersimpan: "siswa X di kelas Y selama tahun ajaran Z"

#### Manajemen Guru & Mata Pelajaran
- Admin buat akun guru (nama, email, nomor HP, password)
- Admin buat daftar mata pelajaran sekolah
- Satu guru bisa mengajar lebih dari 1 mata pelajaran
- Kalau guru resign → admin deactivate → guru otomatis dihapus dari jadwal → slot yang kosong ditandai "vacant" supaya admin tahu harus assign guru baru

#### Jadwal Pelajaran
- Admin buat jadwal per kelas per semester: hari, jam mulai, jam selesai, mata pelajaran, guru
- Jadwal berlaku selama 1 semester (ada tanggal mulai dan selesai)
- Bisa diedit kapan saja selama semester berjalan
- Jadwal semester lama tersimpan sebagai arsip
- **Fungsi utama jadwal**: menentukan guru mana yang boleh input absensi di kelas mana

#### Onboarding Orang Tua
- Admin upload file Excel/CSV berisi data siswa + nomor HP orang tua
- Setelah itu, orang tua langsung bisa login di aplikasi dengan nomor HP tersebut
- Kalau nomor HP cocok dengan beberapa anak (kakak-beradik), semua anak langsung tampil
- Kalau anak ada di beberapa sekolah (misal: SD dan SMP milik yayasan yang sama), semua tampil dalam satu aplikasi tanpa perlu pindah akun

#### Login & Keamanan
| Pengguna | Cara Login | Masa Aktif Sesi |
|----------|-----------|----------------|
| Admin/Bendahara/Kepala Sekolah (website) | Email + Password | 24 jam |
| Guru (website) | Email + Password | 24 jam |
| Guru (aplikasi HP) | Email + Password | 90 hari |
| Orang Tua (aplikasi HP) | Nomor HP saja | 1 tahun |

- Password disimpan terenkripsi (tidak bisa dibaca siapapun, termasuk admin)
- 5x salah password = akun terkunci 15 menit
- Lupa password? Reset via email (tersedia di website dan aplikasi HP)

#### Multi-Tenant (Multi-Sekolah)
- Satu sistem bisa dipakai banyak sekolah
- Data sekolah A **100% terpisah** dari sekolah B
- Tidak ada kemungkinan sekolah lain melihat data yang bukan miliknya
- **Pengecualian**: orang tua yang punya anak di 2 sekolah bisa lihat data dari kedua sekolah dalam 1 aplikasi

#### Super Admin (Pemilik Platform)
- Bisa tambah sekolah baru (otomatis dibuatkan 1 akun admin sekolah)
- Bisa nonaktifkan sekolah (seluruh user sekolah tersebut tidak bisa login)
- Dashboard: lihat daftar semua sekolah, status aktif/nonaktif, jumlah user

---

### ⚙️ KONFIGURASI PER SEKOLAH

Setiap sekolah bisa atur sendiri:
- **Batas alpa** untuk daftar perhatian khusus (default: 3 hari/bulan)
- **Nominal SPP** per tingkat kelas
- **Tanggal jatuh tempo** tagihan default
- **Nama dan logo** sekolah
- **Total hari efektif** per bulan (untuk hitung persentase kehadiran)

---

### 📊 FITUR TEKNIS UMUM

- **Pagination**: semua daftar data ditampilkan 20 item per halaman (tidak loading semua sekaligus, supaya cepat)
- **Kompresi gambar**: foto bukti transfer otomatis diperkecil dan dikonversi ke format WebP (lebih ringan 50-70% dari JPEG)
- **Retention policy**: file gambar dihapus setelah 3 tahun (data transaksi tetap ada)

---

## Ringkasan Jumlah Fitur

| Modul | Jumlah Requirement |
|-------|-------------------|
| Absensi | 8 (input, edit, lihat, rekap, dashboard, offline, jadwal, guru pengganti) |
| Notifikasi | 3 (real-time, riwayat, preferensi) |
| Tagihan/Billing | 9 (buat tagihan, generate setahun, upload bukti, verifikasi, manual, riwayat, dashboard tunggakan, audit trail, kelola tagihan) |
| Admin & Manajemen | 12 (siswa, kelas/tahun ajaran, user/role, login, reset password, onboarding, konfigurasi, multi-tenant, super admin, kenaikan kelas, mata pelajaran, deaktivasi guru) |
| Umum | 3 (lihat jadwal guru, pagination, export laporan) |
| **Total** | **35 requirements** |

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
Orang tua buka app → Lihat tagihan belum bayar → 
Transfer via m-banking → Kembali ke app → 
Upload foto bukti + isi nominal → Tunggu verifikasi → 
Bendahara approve → Orang tua terima notifikasi "Lunas"
```

### Awal Tahun Ajaran — Setup Sekolah
```
Admin aktifkan tahun ajaran baru → Kelas ter-copy otomatis → 
Admin edit kelas jika perlu → Proses kenaikan kelas → 
Admin buat jadwal semester baru → 
Bendahara generate tagihan setahun → Sistem siap digunakan
```

### Sekolah Baru Bergabung
```
Super Admin tambah sekolah → Akun admin sekolah otomatis dibuat → 
Admin login → Buat kelas → Upload data siswa + orang tua (Excel) → 
Buat jadwal → Bendahara buat tagihan → Orang tua langsung bisa login
```

---

## Apa yang TIDAK Dibangun (Sengaja Ditunda)

Fitur berikut **sengaja tidak dibuat sekarang** untuk menjaga fokus dan kecepatan development, tapi bisa ditambahkan di masa depan:

- ❌ Payment gateway online (QRIS/VA — orang tua bayar langsung di app)
- ❌ Absensi guru (hadir/tidak hadir guru)
- ❌ Absensi via QR code atau RFID
- ❌ Laporan keuangan ke yayasan
- ❌ Pengumuman sekolah
- ❌ Jadwal pelajaran untuk siswa/orang tua
- ❌ Integrasi Dapodik
- ❌ Multi-cabang yayasan
- ❌ Rapor online
- ❌ Verifikasi OTP via SMS (reserved, bisa diaktifkan nanti)

---

## Kenapa Sistem Ini Bernilai?

1. **Menghemat waktu**: absensi manual 30 menit → digital 2 menit per kelas
2. **Transparansi**: orang tua langsung tahu anak hadir atau tidak, tanpa tunggu rapor
3. **Mengurangi tunggakan**: orang tua bisa bayar SPP langsung dari HP, bendahara punya dashboard tunggakan yang jelas
4. **Aman**: setiap perubahan data keuangan tercatat permanen (audit trail), tidak bisa dihapus
5. **Scalable**: satu sistem untuk banyak sekolah, biaya per sekolah rendah
6. **Mobile-first**: guru dan orang tua cukup pakai HP, tidak perlu laptop

---

*Dokumen ini menjelaskan scope MVP (Minimum Viable Product — versi pertama yang layak dijual). Total 35 requirements yang mencakup seluruh fitur inti untuk operasional harian sekolah.*
