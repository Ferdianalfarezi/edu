# Requirements Document

## Introduction

Fitur Pengumuman memungkinkan admin sekolah membuat dan mengirim pengumuman ke orang tua siswa yang terdaftar di sekolah. Pengumuman dapat dikirim secara broadcast (seluruh orang tua di sekolah) atau targeted (orang tua tertentu saja). Pengumuman dikirim via push notification (FCM) dan dapat dilihat detailnya di mobile app ketika notifikasi di-tap.

Fitur ini memanfaatkan infrastruktur notifikasi yang sudah ada (`notifikasi` table, `FcmService`, `device_token`) dan menambahkan tabel `pengumuman` sebagai sumber data pengumuman serta endpoint CRUD baru di admin panel.

## Glossary

- **Admin_Sekolah**: Pengguna dengan role `admin` atau `kepala_sekolah` pada tenant tertentu yang memiliki akses untuk membuat pengumuman
- **Pengumuman**: Entitas berisi judul dan deskripsi yang dibuat oleh Admin_Sekolah untuk disampaikan ke orang tua
- **Broadcast**: Mode pengiriman pengumuman ke seluruh orang tua aktif di sekolah (tenant)
- **Targeted**: Mode pengiriman pengumuman ke orang tua tertentu berdasarkan daftar siswa yang dipilih
- **Orang_Tua**: Pengguna dengan role `orang_tua` yang menerima pengumuman di mobile app
- **Notification_Detail_Screen**: Halaman di mobile app yang menampilkan detail lengkap notifikasi/pengumuman ketika item di-tap
- **Pengumuman_Service**: Service backend yang menangani pembuatan, penyimpanan, dan pengiriman pengumuman
- **Admin_Panel**: Aplikasi web Vue 3 yang digunakan Admin_Sekolah untuk mengelola pengumuman

## Requirements

### Requirement 1: Pembuatan Pengumuman oleh Admin

**User Story:** Sebagai admin sekolah, saya ingin membuat pengumuman dengan judul dan deskripsi, sehingga saya dapat menyampaikan informasi penting ke orang tua siswa.

#### Acceptance Criteria

1. THE Admin_Panel SHALL menyediakan form pembuatan pengumuman dengan field judul (maks 255 karakter) dan deskripsi (plain text, maks 5000 karakter, tanpa rich text editor)
2. WHEN Admin_Sekolah mengirim form pembuatan pengumuman dengan data valid, THE Pengumuman_Service SHALL menyimpan pengumuman ke database dengan status `draft` dan mengembalikan response berisi ID pengumuman, judul, status, dan timestamp pembuatan
3. THE Pengumuman_Service SHALL memvalidasi bahwa judul tidak kosong (minimal 1 karakter non-whitespace) dan panjangnya antara 1–255 karakter setelah trimming
4. THE Pengumuman_Service SHALL memvalidasi bahwa deskripsi tidak kosong (minimal 1 karakter non-whitespace) dan panjangnya tidak melebihi 5000 karakter setelah trimming
5. IF field judul atau deskripsi gagal validasi (kosong, hanya whitespace, atau melebihi batas panjang), THEN THE Pengumuman_Service SHALL mengembalikan error validasi dengan pesan yang menjelaskan field mana yang tidak valid dan jenis pelanggaran validasinya

### Requirement 2: Pengiriman Broadcast ke Seluruh Orang Tua

**User Story:** Sebagai admin sekolah, saya ingin mengirim pengumuman ke seluruh orang tua yang terdaftar di sekolah, sehingga informasi penting dapat disampaikan secara massal.

#### Acceptance Criteria

1. WHEN Admin_Sekolah memilih mode broadcast, THE Pengumuman_Service SHALL mengumpulkan seluruh orang tua dengan status aktif (isActive = true) dan role `orang_tua` di tenant yang sama, tanpa duplikasi meskipun satu orang tua memiliki lebih dari satu siswa
2. WHEN pengumuman broadcast dibuat, THE Pengumuman_Service SHALL membuat satu record notifikasi untuk setiap orang tua penerima dengan status awal `pending`
3. WHEN pengumuman broadcast dibuat, THE Pengumuman_Service SHALL mengirim push notification via FCM ke seluruh device token aktif milik orang tua penerima
4. THE Pengumuman_Service SHALL memproses pengiriman FCM secara asynchronous melalui Bull queue sehingga API endpoint mengembalikan response dalam waktu maksimal 2 detik setelah request diterima
5. IF tidak ada orang tua aktif di tenant, THEN THE Pengumuman_Service SHALL tetap menyimpan pengumuman dan mengembalikan response sukses dengan jumlah penerima = 0
6. WHEN pengumuman broadcast berhasil di-queue, THE Pengumuman_Service SHALL mengembalikan response sukses berisi pengumuman_id, mode pengiriman, dan jumlah penerima yang akan dinotifikasi

### Requirement 3: Pengiriman Targeted ke Orang Tua Tertentu

**User Story:** Sebagai admin sekolah, saya ingin mengirim pengumuman ke orang tua dari siswa tertentu saja, sehingga informasi spesifik hanya sampai ke pihak yang relevan.

#### Acceptance Criteria

1. THE Admin_Panel SHALL menyediakan opsi untuk memilih 1 hingga 100 siswa sebagai target penerima pengumuman
2. WHEN Admin_Sekolah memilih mode targeted dengan daftar siswa, THE Pengumuman_Service SHALL mengidentifikasi orang tua dari siswa-siswa yang dipilih sebagai penerima, dengan mendeduplikasi orang tua yang memiliki lebih dari satu anak dalam daftar sehingga satu orang tua hanya menerima satu notifikasi per pengumuman
3. WHEN pengumuman targeted dibuat, THE Pengumuman_Service SHALL membuat record notifikasi hanya untuk orang tua dari siswa yang dipilih
4. IF daftar siswa target kosong pada mode targeted, THEN THE Pengumuman_Service SHALL mengembalikan error validasi yang menjelaskan bahwa minimal satu siswa harus dipilih
5. IF ada siswa dalam daftar yang tidak ditemukan, tidak aktif, atau tidak memiliki orang tua terhubung di tenant, THEN THE Pengumuman_Service SHALL mengabaikan siswa tersebut dan tetap mengirim ke siswa valid lainnya yang memiliki orang tua terhubung
6. IF seluruh siswa dalam daftar tidak valid atau tidak memiliki orang tua terhubung, THEN THE Pengumuman_Service SHALL mengembalikan error bahwa tidak ada penerima valid

### Requirement 4: Push Notification via FCM

**User Story:** Sebagai orang tua, saya ingin menerima push notification ketika ada pengumuman baru, sehingga saya segera mengetahui informasi dari sekolah.

#### Acceptance Criteria

1. WHEN job pengiriman pengumuman diproses dari queue, THE Pengumuman_Service SHALL mengirim push notification dengan judul pengumuman sebagai notification title dan 200 karakter pertama dari deskripsi sebagai notification body, ditambahkan "..." di akhir jika deskripsi melebihi 200 karakter
2. WHEN job pengiriman pengumuman diproses dari queue, THE Pengumuman_Service SHALL menyertakan data payload berisi `pengumuman_id` dan `tipe: pengumuman` pada setiap push notification agar mobile app dapat navigasi ke detail
3. WHEN push notification berhasil terkirim ke minimal satu device token aktif milik orang tua, THE Pengumuman_Service SHALL memperbarui status notifikasi menjadi `terkirim`
4. IF push notification gagal terkirim ke seluruh device token aktif milik orang tua setelah maksimal 3 retry attempts, THEN THE Pengumuman_Service SHALL memperbarui status notifikasi menjadi `gagal`
5. THE Pengumuman_Service SHALL mengirim push notification ke semua device token aktif milik orang tua penerima
6. IF FCM mengembalikan error token-not-registered untuk suatu device token, THEN THE Pengumuman_Service SHALL menonaktifkan device token tersebut agar tidak digunakan pada pengiriman berikutnya

### Requirement 5: Daftar Pengumuman di Admin Panel

**User Story:** Sebagai admin sekolah, saya ingin melihat daftar pengumuman yang sudah dibuat, sehingga saya dapat memantau pengumuman yang telah dikirim.

#### Acceptance Criteria

1. THE Admin_Panel SHALL menampilkan daftar pengumuman dengan kolom: judul, mode pengiriman (broadcast/targeted), jumlah penerima, tanggal dibuat, dan status pengiriman (draft/terkirim/gagal)
2. THE Admin_Panel SHALL menampilkan daftar pengumuman diurutkan berdasarkan tanggal dibuat dari yang terbaru (descending)
3. THE Pengumuman_Service SHALL menyediakan endpoint daftar pengumuman dengan pagination menggunakan default 15 item per halaman dan pilihan ukuran halaman 10, 15, 25, atau 50
4. WHEN Admin_Sekolah mengakses halaman pengumuman, THE Admin_Panel SHALL hanya menampilkan pengumuman milik tenant yang sedang aktif
5. IF tidak ada pengumuman yang ditemukan untuk tenant aktif, THEN THE Admin_Panel SHALL menampilkan empty state dengan pesan yang menginformasikan belum ada pengumuman
6. IF request ke endpoint daftar pengumuman gagal, THEN THE Admin_Panel SHALL menampilkan pesan error dan tetap mempertahankan state halaman terakhir yang berhasil dimuat

### Requirement 6: Detail Notifikasi di Mobile App

**User Story:** Sebagai orang tua, saya ingin melihat detail lengkap pengumuman ketika saya mengetuk notifikasi, sehingga saya dapat membaca seluruh isi pengumuman.

#### Acceptance Criteria

1. WHEN orang tua mengetuk push notification pengumuman (dari system tray, baik saat app aktif maupun terminated), THE Mobile_App SHALL mengekstrak `pengumuman_id` dari data payload notifikasi dan menavigasi ke Notification_Detail_Screen untuk pengumuman tersebut
2. WHEN orang tua mengetuk item notifikasi bertipe `pengumuman` di riwayat notifikasi, THE Mobile_App SHALL mengekstrak `pengumuman_id` dari field data pada item notifikasi dan menavigasi ke Notification_Detail_Screen untuk pengumuman tersebut
3. WHEN Notification_Detail_Screen dibuka, THE Mobile_App SHALL menampilkan loading indicator selama data pengumuman sedang diambil dari API, kemudian menampilkan judul pengumuman, deskripsi lengkap, nama sekolah pengirim, dan tanggal pembuatan pengumuman (format: dd MMM yyyy, HH:mm)
4. IF pengumuman tidak ditemukan atau orang tua bukan penerima pengumuman tersebut, THEN THE Mobile_App SHALL menampilkan pesan error yang menjelaskan bahwa pengumuman tidak tersedia beserta tombol untuk kembali ke halaman sebelumnya
5. IF terjadi kegagalan jaringan saat mengambil detail pengumuman, THEN THE Mobile_App SHALL menampilkan pesan error koneksi beserta tombol untuk mencoba kembali (retry)
6. THE Pengumuman_Service SHALL menyediakan endpoint detail pengumuman berdasarkan ID yang hanya dapat diakses oleh orang tua yang terdaftar sebagai penerima pengumuman tersebut, mengembalikan judul, deskripsi, nama sekolah, dan tanggal pembuatan

### Requirement 7: Otorisasi dan Multi-Tenancy

**User Story:** Sebagai platform, saya ingin memastikan pengumuman hanya dapat dibuat oleh admin yang berwenang dan hanya terkirim ke orang tua di sekolah yang sama, sehingga isolasi data antar tenant terjaga.

#### Acceptance Criteria

1. THE Pengumuman_Service SHALL membatasi akses pembuatan pengumuman hanya untuk role `admin` dan `kepala_sekolah` yang memiliki tenant_id valid (tidak NULL) pada JWT token mereka
2. THE Pengumuman_Service SHALL memastikan pengumuman hanya terkirim ke orang tua yang memiliki siswa aktif di tenant yang sama dengan Admin_Sekolah pembuat, berdasarkan relasi siswa.orang_tua_id dan siswa.tenant_id
3. IF pengguna tanpa role `admin` atau `kepala_sekolah` mencoba membuat pengumuman, THEN THE Pengumuman_Service SHALL mengembalikan HTTP 403 Forbidden
4. THE Pengumuman_Service SHALL menyimpan tenant_id dari JWT token Admin_Sekolah pembuat pada setiap record pengumuman untuk mendukung RLS
5. WHEN Orang_Tua mengakses endpoint detail pengumuman, THE Pengumuman_Service SHALL hanya mengembalikan pengumuman yang tenant_id-nya termasuk dalam daftar tenants[] milik Orang_Tua tersebut
6. IF Orang_Tua mencoba mengakses pengumuman dari tenant yang tidak ada dalam daftar tenants[] mereka, THEN THE Pengumuman_Service SHALL mengembalikan HTTP 403 Forbidden
