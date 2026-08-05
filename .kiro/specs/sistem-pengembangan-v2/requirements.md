# Requirements Document

## Introduction

Dokumen ini mendefinisikan requirements untuk batch pengembangan v2 platform **Teman Sekolah**, mencakup 12 item perbaikan dan fitur baru yang meliputi: branding & identitas sekolah di topbar, halaman detail kelas dan daftar guru, perbaikan z-index dropdown, perluasan modul inventarisasi barang, pengelolaan biaya sekolah per siswa/kelas, perbaikan bug NaN pada sisa tagihan, perbaikan Audit Trail, ekspor tagihan dan tunggakan, navigasi keuangan berbasis subpage topbar, pengaturan masa aktif token, dan single-device login dengan force logout.

Platform: multi-tenant school management SaaS (pasar Indonesia), backend NestJS 10 + Drizzle ORM + PostgreSQL + Redis, frontend admin Vue 3 (Composition API) + Tailwind CSS 4, mobile Flutter + Riverpod, auth JWT access + refresh tokens.

---

## Glossary

- **Tenant**: Satu sekolah yang terdaftar di platform Teman Sekolah.
- **Topbar**: Komponen header horizontal di bagian atas halaman admin (AppTopBar.vue).
- **Sidebar**: Komponen navigasi vertikal di sisi kiri halaman admin (AppSidebar.vue).
- **Topbar_Subpage**: Navigasi horizontal di dalam halaman keuangan yang menggantikan tab menjadi sub-route.
- **Logo_Sekolah**: Gambar logo milik tenant yang diunggah saat pembuatan tenant, disimpan sebagai URL publik di field `logo_url` pada record tenant.
- **Logo_Default**: Logo Teman Sekolah (`/logo.png`) yang digunakan apabila Logo_Sekolah kosong atau null.
- **Barang**: Entitas inventaris barang milik sekolah dalam modul `barang`.
- **Kondisi_Barang**: Status fisik barang: `bagus`, `perlu_perbaikan`, atau `rusak`.
- **Sumber_Dana**: Asal dana pengadaan barang: `yayasan`, `unit_sekolah`, atau `bos`.
- **Kategori_Barang**: Klasifikasi barang: `peralatan` atau `perlengkapan`.
- **Tagihan**: Entitas tagihan SPP siswa dalam modul `tagihan`.
- **Tunggakan**: Tagihan yang belum lunas melewati tanggal jatuh tempo.
- **Audit_Trail**: Log perubahan data pada entitas Tagihan.
- **Biaya_Sekolah**: Konfigurasi nominal SPP yang dapat berbeda per siswa atau per kelas.
- **Token_Akses**: JWT access token yang digunakan untuk mengautentikasi request API.
- **Token_Refresh**: JWT refresh token yang digunakan untuk memperbarui Token_Akses.
- **Sesi_Aktif**: Pasangan Token_Akses + Token_Refresh yang masih valid untuk satu perangkat.
- **Session_Store**: Penyimpanan sesi di Redis yang melacak Sesi_Aktif per pengguna (key: `session:{userId}`, value: `session_id`).
- **Force_Logout**: Mekanisme yang membatalkan Sesi_Aktif lama saat login baru dari perangkat berbeda.
- **Kelas**: Entitas kelas di tabel `kelas`, berisi nama, tingkat, wali kelas, dan daftar siswa.
- **Guru**: Pengguna dengan role `guru` dalam sistem, ditandai dengan `isActive = true` dan tidak dihapus.
- **Admin**: Pengguna dengan role `admin` dalam sistem.
- **Kepala_Sekolah**: Pengguna dengan role `kepala_sekolah`.
- **Bendahara**: Pengguna dengan role `bendahara`.
- **Super_Admin**: Pengguna dengan role `super_admin` yang mengelola seluruh tenant.
- **NaN**: Not a Number — nilai tidak valid yang muncul ketika operasi aritmetika dilakukan pada data `undefined` atau `null`.
- **RLS**: Row-Level Security di PostgreSQL untuk isolasi data antar tenant.

---

## Requirements

### Requirement 1: Logo Sekolah pada Tenant dan Tampilan Topbar

**User Story:** Sebagai Super_Admin, saya ingin mengunggah logo sekolah saat membuat tenant baru, agar identitas visual setiap sekolah terlihat di topbar panel admin mereka.

#### Acceptance Criteria

1. WHERE fitur upload logo tersedia, THE Tenant_Form SHALL menyediakan input file bertipe gambar (JPEG, PNG, WebP) yang bersifat opsional saat membuat tenant baru.
2. WHEN Super_Admin mengunggah file gambar yang valid (JPEG, PNG, atau WebP, ukuran ≤ 2 MB), THE Storage_Service SHALL menyimpan file tersebut dan mengembalikan URL publik yang disimpan di field `logo_url` pada record tenant.
3. IF file yang diunggah bukan bertipe JPEG, PNG, atau WebP, THEN THE Tenant_Form SHALL menampilkan pesan error "Format file tidak valid. Gunakan JPEG, PNG, atau WebP."
4. IF ukuran file yang diunggah melebihi 2 MB, THEN THE Tenant_Form SHALL menampilkan pesan error "Ukuran file maksimum 2 MB."
5. WHEN tenant aktif memiliki field `nama` tersedia di Pinia store, THE Topbar SHALL menampilkan nama sekolah di sisi kanan header.
6. WHEN `logo_url` pada record tenant aktif berisi URL yang valid (non-null dan non-empty string), THE Topbar SHALL menampilkan gambar logo di sebelah kiri nama sekolah dengan class `rounded-full` dan ukuran 32×32 piksel, beserta atribut `alt` berisi nama sekolah.
7. WHEN `logo_url` pada record tenant aktif bernilai `null`, `undefined`, atau string kosong, THE Topbar SHALL menampilkan Logo_Default (`/logo.png`) di posisi yang sama dengan atribut `alt` "Teman Sekolah".
8. THE Topbar SHALL mengambil data `logo_url` dan nama sekolah dari Pinia store yang di-populate dari respons API profil tenant saat login.

---

### Requirement 2: Branding "Teman Sekolah" pada Topbar

**User Story:** Sebagai pengguna panel admin, saya ingin melihat nama aplikasi "Teman Sekolah" di topbar atau sidebar, agar identitas platform selalu terlihat selama sesi penggunaan.

#### Acceptance Criteria

1. THE AppTopBar SHALL menampilkan gambar `logo-text.png` (dari `/logo-text.png` yang tersedia di direktori public) di sisi kiri header, sebelum judul halaman aktif, dengan tinggi 28 piksel dan lebar proporsional.
2. IF gambar `logo-text.png` gagal dimuat, THEN THE AppTopBar SHALL menampilkan teks fallback "Teman Sekolah" di posisi yang sama dengan font-weight semibold.
3. WHEN AppSidebar berada dalam state expanded (lebar penuh, ditrigger oleh hover), THE Sidebar SHALL menampilkan teks "Teman Sekolah" di bawah logo ikon (`/logo.png`) di bagian atas navigasi, dengan font-size 12px dan warna `rgba(255, 255, 255, 0.7)`.
4. WHEN AppSidebar berada dalam state collapsed, THE Sidebar SHALL tidak menampilkan teks "Teman Sekolah" (hanya ikon logo yang terlihat).
5. WHILE pengguna mengakses halaman manapun dalam panel admin dengan status terautentikasi, THE AppTopBar SHALL selalu merender elemen branding "Teman Sekolah" tanpa bergantung pada kondisi data tenant.

---

### Requirement 3: Halaman Detail Kelas dan Halaman Daftar Guru

**User Story:** Sebagai Admin atau Kepala_Sekolah, saya ingin melihat daftar siswa dalam sebuah kelas dan daftar seluruh guru aktif, agar pengelolaan data akademik lebih mudah.

#### Acceptance Criteria

1. WHEN pengguna dengan role `admin` atau `kepala_sekolah` mengklik kelas pada halaman manajemen kelas, THE Router SHALL menavigasi ke halaman detail kelas di path `/kelas/:id` yang menampilkan nama kelas, tingkat, dan daftar siswa yang terdaftar di kelas tersebut.
2. THE Kelas_Detail_View SHALL menampilkan setiap siswa dengan kolom: nama siswa, NISN, dan status siswa. Nilai valid untuk status siswa adalah: `aktif`, `tidak aktif`, `pindah`, atau `lulus`.
3. THE AppSidebar SHALL menyediakan entri navigasi "Guru" di dalam grup "Akademik" yang mengarah ke path `/guru`, dan entri ini hanya terlihat untuk role `admin` dan `kepala_sekolah`.
4. THE Guru_View SHALL menampilkan seluruh pengguna dengan role `guru` yang memiliki `isActive = true` dan belum dihapus dalam tenant aktif, dengan kolom: nama lengkap, email, dan nomor telepon.
5. WHEN data kelas atau daftar guru kosong, THE halaman terkait SHALL menampilkan pesan "Tidak ada data ditemukan".

---

### Requirement 4: Perbaikan Z-Index Dropdown

**User Story:** Sebagai pengguna panel admin, saya ingin dropdown pilihan tidak terhalang oleh komponen lain di halaman, agar saya dapat memilih opsi tanpa hambatan visual.

#### Acceptance Criteria

1. WHEN SearchSelect membuka dropdown, THE SearchSelect_Dropdown SHALL dirender menggunakan `Teleport to="body"` sehingga tidak terkena `overflow:hidden` atau `overflow:clip` dari elemen induk manapun.
2. WHEN SearchSelect membuka dropdown di dalam BaseModal, THE SearchSelect_Dropdown SHALL memiliki z-index minimum `z-[9999]` yang lebih tinggi dari z-index BaseModal (`z-50`), sehingga dropdown selalu tampil di atas modal.
3. WHEN SearchSelect membuka dropdown di luar BaseModal (di halaman biasa), THE SearchSelect_Dropdown SHALL memiliki z-index minimum `z-[9999]` sehingga tampil di atas semua komponen layout termasuk sticky header dan sidebar.
4. WHEN dropdown ditampilkan via Teleport, THE SearchSelect_Dropdown SHALL mempertahankan posisi relatif terhadap trigger button dengan menggunakan perhitungan posisi absolut berdasarkan `getBoundingClientRect()` dari trigger.

---

### Requirement 5: Perluasan Modul Inventarisasi Barang

**User Story:** Sebagai Admin atau Kepala_Sekolah, saya ingin mencatat lokasi, kondisi, sumber dana, dan kategori barang inventaris serta dapat mengimpor dan mengekspor data melalui Excel, agar pengelolaan aset sekolah lebih lengkap dan efisien.

#### Acceptance Criteria

1. THE Barang_Form SHALL menyediakan field `lokasi` bertipe teks bebas yang bersifat opsional, dengan panjang maksimum 255 karakter.
2. THE Barang_Form SHALL menyediakan field `kondisi_barang` berupa dropdown yang wajib diisi dengan salah satu nilai: `bagus`, `perlu_perbaikan`, atau `rusak`.
3. THE Barang_Form SHALL menyediakan field `sumber_dana` berupa dropdown yang wajib diisi dengan salah satu nilai: `yayasan`, `unit_sekolah`, atau `bos`.
4. THE Barang_Form SHALL menyediakan field `kategori` berupa dropdown yang wajib diisi dengan salah satu nilai: `peralatan` atau `perlengkapan`.
5. IF `kondisi_barang`, `sumber_dana`, atau `kategori` tidak diisi saat submit, THEN THE Barang_Form SHALL mencegah pengiriman dan menampilkan pesan error inline per field yang kosong.
6. THE Barang_View SHALL menyediakan tombol "Ekspor Excel" yang mengunduh seluruh data barang sesuai filter aktif (tanpa batasan halaman pagination) dalam format XLSX.
7. THE Barang_View SHALL menyediakan tombol "Import Excel" yang memungkinkan pengguna mengunggah file XLSX berukuran maksimum 5 MB. File XLSX harus mengikuti template yang dapat diunduh dari halaman yang sama.
8. WHEN file XLSX yang diunggah memiliki kolom yang tidak sesuai dengan template, THEN THE Import_Processor SHALL mengembalikan daftar baris yang gagal beserta keterangan kesalahannya per baris tanpa membatalkan baris yang valid. Baris dengan nama barang yang sama dengan barang yang sudah ada di tenant SHALL dilewati (skip) dan dilaporkan sebagai duplikat.
9. IF ukuran file XLSX yang diunggah melebihi 5 MB, THEN THE Barang_View SHALL menampilkan pesan error "Ukuran file maksimum 5 MB" dan membatalkan proses upload.
10. WHEN import berhasil memproses seluruh baris (termasuk sebagian), THE Barang_View SHALL menampilkan ringkasan hasil import: jumlah baris berhasil ditambahkan dan jumlah baris yang dilewati beserta alasannya.
11. THE Barang_View SHALL menyediakan fitur pencarian nama barang (real-time, minimum 1 karakter) dan filter berdasarkan `sumber_dana`, `kondisi_barang`, dan `kategori`.
12. WHEN filter atau pencarian diubah, THE Barang_API SHALL mengembalikan daftar barang yang sesuai dengan kriteria filter yang aktif dalam waktu maksimum 2 detik.

---

### Requirement 6: Biaya Sekolah Berbeda per Siswa dan per Kelas

**User Story:** Sebagai Bendahara atau Admin, saya ingin mengatur nominal biaya SPP yang berbeda untuk setiap siswa atau kelas secara individual maupun massal (generate otomatis), agar penagihan dapat disesuaikan dengan kondisi masing-masing siswa.

#### Acceptance Criteria

1. WHEN pengguna dengan role `admin` atau `bendahara` mengakses halaman konfigurasi biaya, THE Konfigurasi_Biaya_View SHALL memungkinkan penetapan nominal biaya yang berbeda per kelas berdasarkan nama kelas, disimpan sebagai override pada tabel konfigurasi biaya.
2. WHEN pengguna dengan role `admin` atau `bendahara` mengakses halaman konfigurasi biaya, THE Konfigurasi_Biaya_View SHALL memungkinkan penetapan nominal biaya yang berbeda per siswa secara individual. Override per siswa menimpa override per kelas apabila keduanya ditetapkan untuk siswa yang sama.
3. IF nominal biaya yang dimasukkan bukan bilangan bulat positif (> 0) atau melebihi 999.999.999, THEN THE Konfigurasi_Biaya_Form SHALL menampilkan pesan error "Nominal harus berupa angka bulat antara 1 dan 999.999.999."
4. WHEN pengguna memilih "Generate Tagihan", THE Tagihan_Generator SHALL menentukan nominal per siswa dengan urutan prioritas: (1) override per siswa jika ada record dengan nilai > 0, (2) override per kelas jika ada record untuk kelas siswa tersebut dengan nilai > 0, (3) nominal global tenant.
5. IF tidak ada nominal yang ditetapkan pada ketiga level (per siswa, per kelas, dan global tenant), THEN THE Tagihan_Generator SHALL menolak proses generate dan menampilkan pesan error "Tidak ada nominal biaya yang dikonfigurasi. Silakan atur nominal biaya terlebih dahulu."
6. THE Konfigurasi_Biaya_API SHALL menyimpan override biaya per siswa dan per kelas dalam tabel konfigurasi yang terisolasi per tenant menggunakan RLS PostgreSQL.
7. IF override biaya per siswa dihapus, THEN THE Tagihan_Generator SHALL kembali menggunakan nominal per kelas (jika tersedia) atau nominal global tenant untuk siswa tersebut pada generate tagihan berikutnya.

---

### Requirement 7: Perbaikan Bug NaN pada Sisa Tagihan

**User Story:** Sebagai Bendahara, saya ingin kolom "Sisa Tagihan" pada tabel tunggakan menampilkan nilai numerik yang benar, agar saya dapat memantau sisa pembayaran dengan akurat.

#### Acceptance Criteria

1. THE Tagihan_API SHALL mengembalikan field `sisa` yang sudah dihitung di sisi server sebagai bilangan bulat non-negatif (`Math.max(0, nominal - totalDibayar)`) pada setiap item di endpoint tunggakan.
2. WHEN Tunggakan_Table merender setiap baris, THE kolom "Sisa Tagihan" SHALL menggunakan nilai `sisa` dari respons API sebagai sumber data primer untuk ditampilkan.
3. IF field `sisa` dari respons API bernilai `null`, `undefined`, atau bukan tipe number, THEN THE Tunggakan_Table SHALL melakukan kalkulasi fallback: `Math.max(0, (nominal ?? 0) - (totalDibayar ?? 0))` dan menggunakan hasilnya sebagai nilai tampilan.
4. THE Tunggakan_Table SHALL memformat nilai sisa menggunakan fungsi format Rupiah yang ada (misalnya `formatRupiah`) sehingga tampil sebagai string mata uang valid (contoh: "Rp 150.000"), bukan sebagai "NaN", "undefined", atau string kosong.

---

### Requirement 8: Perbaikan dan Penyesuaian Audit Trail

**User Story:** Sebagai Bendahara atau Admin, saya ingin log audit perubahan tagihan ditampilkan dengan format yang mudah dibaca, agar saya dapat memahami riwayat perubahan tanpa perlu menafsirkan data JSON mentah.

#### Acceptance Criteria

1. THE Audit_Trail_View SHALL menampilkan setiap entri log dengan format terstruktur yang mencakup: waktu perubahan (format `dd MMM yyyy, HH:mm WIB`), nama pengguna yang melakukan aksi, label aksi dalam Bahasa Indonesia (dari field `aksi_label`), dan ringkasan perubahan.
2. IF sebuah entri log adalah aksi UPDATE dan memiliki field `perubahan` berupa array yang tidak kosong, THEN THE Audit_Trail_View SHALL menampilkan hanya field yang berubah dalam format "Nama Field: [nilai lama] → [nilai baru]". Label nama field SHALL ditampilkan dalam Bahasa Indonesia (bukan nama kolom teknis). JSON mentah SHALL NOT ditampilkan.
3. IF sebuah entri log adalah aksi CREATE dan field `perubahan` hanya berisi `nilaiSesudah` (tanpa `nilaiSebelum`), THEN THE Audit_Trail_View SHALL menampilkan ringkasan "Data baru dibuat" beserta daftar field dan nilai awalnya.
4. THE Audit_Log_Service SHALL menyimpan setiap entri log dengan struktur: `aksi_label` (string dalam Bahasa Indonesia, maksimum 100 karakter), `perubahan` (array objek dengan field `namaField` string, `nilaiSebelum` any, `nilaiSesudah` any), dan `alasan` (string opsional).
5. IF `alasan` tersedia dan non-empty pada entri log, THEN THE Audit_Trail_View SHALL menampilkan alasan tersebut di bawah ringkasan perubahan dalam format "Alasan: [isi alasan]".

---

### Requirement 9: Ekspor Daftar Tagihan dan Tunggakan

**User Story:** Sebagai Bendahara, saya ingin mengekspor daftar tagihan dan daftar tunggakan ke format Excel atau PDF, agar saya dapat membuat laporan keuangan untuk arsip dan pelaporan ke pihak manajemen sekolah.

#### Acceptance Criteria

1. THE Tagihan_View SHALL menyediakan tombol "Ekspor Excel" pada subpage Daftar Tagihan yang mengunduh seluruh data tagihan sesuai filter aktif (tanpa batasan halaman pagination, maksimum 10.000 baris) dalam format XLSX dengan nama file `tagihan_list_YYYYMMDD.xlsx`.
2. THE Tagihan_View SHALL menyediakan tombol "Ekspor Excel" pada subpage Tunggakan yang mengunduh seluruh data tunggakan sesuai filter aktif (tanpa batasan halaman pagination, maksimum 10.000 baris) dalam format XLSX dengan nama file `tagihan_tunggakan_YYYYMMDD.xlsx`.
3. WHEN ekspor XLSX dilakukan, THE Tagihan_Export_API SHALL menghasilkan file dengan kolom berurutan: nama siswa, kelas, bulan, tahun, nominal, total dibayar, sisa, status, dan tanggal jatuh tempo.
4. THE Tagihan_View SHALL menyediakan tombol "Ekspor PDF" pada subpage Daftar Tagihan dan subpage Tunggakan yang menghasilkan file PDF berformat laporan dengan nama file `tagihan_list_YYYYMMDD.pdf` atau `tagihan_tunggakan_YYYYMMDD.pdf`. File PDF SHALL mencakup header (nama sekolah dan tanggal cetak) serta kolom data yang sama dengan ekspor XLSX, dengan maksimum 10.000 baris.
5. WHEN ekspor dimulai, THE Tagihan_View SHALL menampilkan indikator loading pada tombol ekspor dan menonaktifkan tombol tersebut hingga file siap diunduh atau terjadi error.
6. IF API ekspor mengembalikan error (status HTTP >= 400 atau network timeout), THEN THE Tagihan_View SHALL mengaktifkan kembali tombol ekspor dan menampilkan pesan notifikasi error kepada pengguna.

---

### Requirement 10: Navigasi Keuangan Berbasis Subpage Topbar

**User Story:** Sebagai Bendahara atau Admin, saya ingin menu keuangan menggunakan navigasi subpage di topbar (bukan tab horizontal di dalam halaman), agar perpindahan antar bagian keuangan lebih intuitif dan konsisten dengan pola navigasi platform.

#### Acceptance Criteria

1. THE Keuangan_Module SHALL mendefinisikan sub-route berikut dengan path yang bersifat binding: `/tagihan/generate` (Generate Tagihan), `/tagihan/list` (Daftar Tagihan), `/tagihan/verifikasi` (Verifikasi Pembayaran), `/tagihan/tunggakan` (Tunggakan), `/tagihan/audit` (Audit Trail).
2. WHEN pengguna berada di dalam modul keuangan (path aktif dimulai dengan `/tagihan`), THE AppSubNav SHALL menampilkan navigasi horizontal di bawah AppTopBar berisi item-item sub-route yang dapat diakses oleh role pengguna. Sub-route `/tagihan/generate` hanya ditampilkan untuk role `admin` dan `bendahara`.
3. WHEN pengguna mengklik item navigasi AppSubNav, THE Router SHALL menavigasi ke sub-route yang sesuai menggunakan Vue Router `router.push()` tanpa reload halaman penuh.
4. WHEN pengguna mengakses `/tagihan` atau path dengan sub-route yang tidak dikenali (seperti `/tagihan/xyz`), THE Router SHALL melakukan redirect otomatis ke `/tagihan/list`.
5. WHEN pengguna berpindah antar subpage keuangan, THE Router SHALL mempertahankan query parameter filter (seperti `status`, `bulan`, `tahun`, `kelasId`) per sub-route menggunakan `router.replace` dengan merge query params, sehingga filter tidak hilang saat pengguna kembali ke subpage yang sama dalam sesi yang sama.

---

### Requirement 11: Masa Aktif Token 1 Hari untuk Role Staff

**User Story:** Sebagai Admin sistem, saya ingin token akses untuk role admin, kepala_sekolah, guru, dan bendahara memiliki masa aktif 1 hari (24 jam), agar sesi tidak terlalu panjang dan keamanan akun terjaga.

#### Acceptance Criteria

1. WHEN pengguna dengan role `admin`, `kepala_sekolah`, `guru`, atau `bendahara` berhasil login melalui platform `admin_panel`, THE Auth_Service SHALL menerbitkan Token_Akses dengan masa aktif tepat 24 jam sejak waktu penerbitan.
2. WHEN pengguna dengan role `guru` berhasil login melalui platform `mobile`, THE Auth_Service SHALL menerbitkan Token_Akses dengan masa aktif 90 hari sejak waktu penerbitan (kebijakan mobile tidak berubah).
3. WHEN pengguna dengan role `admin`, `kepala_sekolah`, `guru`, atau `bendahara` berhasil login melalui platform `admin_panel`, THE Auth_Service SHALL menerbitkan Token_Refresh dengan masa aktif tepat 7 hari sejak waktu penerbitan, sehingga pengguna dapat memperbarui Token_Akses tanpa login ulang selama periode tersebut.
4. IF Token_Akses telah kedaluwarsa (claim `exp` terlampaui) saat request masuk, THEN THE API SHALL mengembalikan respons HTTP 401 dengan body JSON `{"code": "TOKEN_EXPIRED", "message": "Token akses kedaluwarsa. Silakan perbarui sesi Anda."}`.
5. IF Token_Refresh telah kedaluwarsa saat request ke endpoint refresh token, THEN THE API SHALL mengembalikan HTTP 401 dengan body JSON `{"code": "REFRESH_TOKEN_EXPIRED", "message": "Sesi berakhir. Silakan login kembali."}` sehingga klien dapat membedakan antara expired Token_Akses dan expired Token_Refresh.

---

### Requirement 12: Single Device Login dan Force Logout

**User Story:** Sebagai Admin sistem, saya ingin satu akun hanya dapat digunakan pada satu perangkat atau browser aktif dalam satu waktu, dan akun yang login di perangkat baru secara otomatis melakukan force logout pada sesi perangkat lama, agar keamanan akun terjaga dari penggunaan bersamaan.

#### Acceptance Criteria

1. THE Session_Store SHALL menyimpan satu record sesi aktif per pengguna di Redis dengan key `session:{userId}` dan value berupa `session_id` (UUID v4), dengan TTL yang identik dengan durasi Token_Refresh yang diterbitkan (7 hari untuk `admin_panel`, sesuai platform untuk `mobile`).
2. WHEN pengguna dengan role `admin`, `kepala_sekolah`, `guru`, atau `bendahara` berhasil login, THE Auth_Service SHALL: (1) membuat `session_id` baru (UUID v4), (2) menyimpannya di Session_Store menimpa nilai lama (jika ada), (3) menyematkan `session_id` di dalam payload JWT pada claim `sid` untuk Token_Akses dan Token_Refresh yang diterbitkan.
3. WHEN API menerima request yang memerlukan autentikasi dengan Token_Akses yang valid secara kriptografis, THE JWT_Guard SHALL memvalidasi bahwa claim `sid` dalam token sesuai dengan nilai `session_id` yang tersimpan di Session_Store untuk `userId` yang sama.
4. WHEN API menerima request ke endpoint refresh token dengan Token_Refresh yang valid secara kriptografis, THE JWT_Guard SHALL juga memvalidasi bahwa claim `sid` dalam Token_Refresh sesuai dengan Session_Store, sehingga refresh endpoint tidak dapat digunakan untuk membypass validasi sesi.
5. IF claim `sid` dalam Token_Akses atau Token_Refresh tidak sesuai dengan Session_Store (karena pengguna sudah login dari perangkat baru), THEN THE JWT_Guard SHALL menolak request dengan HTTP 401 dan body `{"code": "SESSION_INVALIDATED", "message": "Sesi tidak valid karena login dari perangkat lain."}`.
6. WHEN pengguna melakukan logout secara eksplisit, THE Auth_Service SHALL: (1) menghapus key `session:{userId}` dari Session_Store, (2) memasukkan `jti` (JWT ID) Token_Akses aktif ke Redis blacklist dengan TTL sisa masa aktif token.
7. IF Redis tidak dapat dijangkau saat validasi `session_id`, THEN THE JWT_Guard SHALL menolak request dengan HTTP 503 (fail-closed) untuk role `admin`, `kepala_sekolah`, `guru`, dan `bendahara`. Fail-closed dipilih untuk mencegah penggunaan sesi yang seharusnya sudah diinvalidasi.
8. THE single device login SHALL berlaku untuk role `admin`, `kepala_sekolah`, `guru`, dan `bendahara` pada platform `admin_panel` maupun `mobile`.
9. THE single device login SHALL tidak berlaku untuk role `orang_tua` karena mereka memerlukan akses dari beberapa aplikasi anak di berbeda perangkat.
