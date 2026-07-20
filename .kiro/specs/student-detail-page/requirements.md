# Requirements Document

## Introduction

Halaman Detail Siswa menampilkan profil lengkap siswa beserta riwayat kelas (timeline perpindahan kelas per tahun ajaran) dan riwayat rapor (rata-rata nilai per periode, dapat di-expand ke detail per mata pelajaran). Fitur ini juga mencakup perbaikan backend agar setiap perubahan kelas (create, edit manual, promosi) tercatat otomatis di tabel `riwayat_kelas` dengan field `tanggal_mulai`.

## Glossary

- **Sistem**: Keseluruhan aplikasi (backend API + frontend admin)
- **Halaman_Detail_Siswa**: View frontend yang menampilkan profil siswa, riwayat kelas, dan riwayat rapor
- **API_Detail_Siswa**: Endpoint backend yang menyediakan data profil, riwayat kelas, dan ringkasan rapor untuk satu siswa
- **Riwayat_Kelas_Service**: Modul backend yang mengelola pencatatan otomatis riwayat perpindahan kelas siswa
- **Router_Guard**: Middleware frontend yang membatasi akses halaman berdasarkan role pengguna
- **Rapor_Ringkasan**: Data rata-rata nilai siswa per periode (uts_semester_1, semester_1, uts_semester_2, semester_2) dalam satu tahun ajaran
- **Timeline_Kelas**: Urutan kronologis kelas yang pernah ditempati siswa, termasuk kelas saat ini

## Requirements

### Requirement 1: Pencatatan Otomatis Riwayat Kelas

**User Story:** Sebagai admin, saya ingin setiap perubahan kelas siswa (pembuatan siswa baru, edit manual kelas_id, dan promosi) tercatat otomatis di riwayat_kelas, sehingga timeline kelas siswa selalu lengkap.

#### Acceptance Criteria

1. WHEN siswa baru dibuat dengan kelas_id yang tidak null, THE Riwayat_Kelas_Service SHALL menyimpan record baru di tabel riwayat_kelas dengan siswa_id, kelas_id, tahun_ajaran_id yang diambil dari record kelas tersebut, dan tanggal_mulai berisi tanggal (date, format YYYY-MM-DD) saat pencatatan dilakukan
2. WHEN admin mengubah kelas_id siswa melalui endpoint PATCH /siswa/:id dari satu kelas ke kelas lain yang tidak null, THE Riwayat_Kelas_Service SHALL menyimpan record baru di tabel riwayat_kelas dengan kelas_id baru, tahun_ajaran_id yang diambil dari record kelas baru, dan tanggal_mulai berisi tanggal saat perubahan dilakukan
3. WHEN kenaikan kelas dilakukan melalui endpoint /kenaikan-kelas/execute, THE Riwayat_Kelas_Service SHALL menyimpan record riwayat_kelas untuk setiap siswa yang dipromosikan dengan kelas_id berisi kelas asal (source), tahun_ajaran_id dari kelas asal, dan tanggal_mulai berisi tanggal saat promosi dieksekusi
4. THE Riwayat_Kelas_Service SHALL menyimpan field tanggal_mulai bertipe date (YYYY-MM-DD) pada setiap record riwayat_kelas
5. IF admin mengubah kelas_id siswa menjadi null melalui endpoint PATCH /siswa/:id, THEN THE Riwayat_Kelas_Service SHALL tidak menyimpan record baru di riwayat_kelas
6. WHEN siswa dibuat melalui bulk import CSV dengan kelas_id yang tidak null, THE Riwayat_Kelas_Service SHALL menyimpan record riwayat_kelas dengan kelas_id, tahun_ajaran_id dari kelas tersebut, dan tanggal_mulai berisi tanggal saat import dieksekusi

### Requirement 2: Migrasi Database untuk Field tanggal_mulai

**User Story:** Sebagai developer, saya ingin tabel riwayat_kelas memiliki kolom tanggal_mulai, sehingga sistem dapat menampilkan kapan siswa mulai berada di suatu kelas.

#### Acceptance Criteria

1. THE Sistem SHALL menambahkan kolom tanggal_mulai bertipe date (nullable) pada tabel riwayat_kelas
2. WHEN migrasi dijalankan pada data riwayat_kelas yang sudah ada, THE Sistem SHALL mengisi tanggal_mulai dengan nilai created_at (dikonversi ke date tanpa komponen waktu) dari record tersebut sebagai fallback
3. WHEN record riwayat_kelas baru dibuat setelah migrasi, THE Riwayat_Kelas_Service SHALL selalu mengisi tanggal_mulai dengan nilai yang tidak null

### Requirement 3: API Endpoint Detail Siswa

**User Story:** Sebagai frontend developer, saya ingin tersedia satu endpoint API yang mengembalikan data profil, riwayat kelas, dan ringkasan rapor siswa, sehingga halaman detail siswa dapat dimuat secara efisien.

#### Acceptance Criteria

1. WHEN request GET /siswa/:id/detail diterima dengan token valid, THE API_Detail_Siswa SHALL mengembalikan objek profil siswa yang berisi: id, nama, nisn, jenis_kelamin, tanggal_lahir, alamat, status, nama kelas saat ini (dari siswa.kelas_id, atau null jika siswa tidak memiliki kelas aktif), dan nama orang tua (dari relasi orang_tua_id ke tabel user, atau null jika tidak ada orang tua terdaftar)
2. WHEN request GET /siswa/:id/detail diterima, THE API_Detail_Siswa SHALL mengembalikan array riwayat_kelas yang menggabungkan kelas saat ini (dari siswa.kelas_id dengan tahun ajaran aktif) dan seluruh entri dari tabel riwayat_kelas — setiap elemen berisi: nama kelas, nama tahun ajaran, tanggal_mulai, dan tingkat — diurutkan dari tanggal_mulai terbaru ke terlama; jika tidak ada riwayat dan tidak ada kelas saat ini, array dikembalikan kosong
3. WHEN request GET /siswa/:id/detail diterima, THE API_Detail_Siswa SHALL mengembalikan array rapor_ringkasan yang berisi: nama tahun ajaran, periode (salah satu dari: uts_semester_1, semester_1, uts_semester_2, semester_2), rapor_id, rata-rata keseluruhan (mean aritmetika dari field rata_rata seluruh rapor_nilai milik siswa tersebut dalam satu rapor, dibulatkan 2 desimal), dan peringkat — diurutkan dari tahun ajaran terbaru lalu periode terbesar; jika tidak ada data rapor, array dikembalikan kosong
4. IF siswa_id tidak ditemukan dalam tenant pengguna, THEN THE API_Detail_Siswa SHALL mengembalikan response 404 Not Found dengan body berisi pesan error yang mengindikasikan siswa tidak ditemukan
5. IF pengguna tidak memiliki role admin, guru, atau kepala_sekolah, THEN THE API_Detail_Siswa SHALL mengembalikan response 403 Forbidden dengan body berisi pesan error yang mengindikasikan akses ditolak
6. WHEN request GET /siswa/:id/detail diterima dengan token valid, THE API_Detail_Siswa SHALL mengembalikan response dalam waktu maksimal 500ms pada kondisi normal (database memiliki kurang dari 100.000 record siswa per tenant)

### Requirement 4: API Endpoint Detail Rapor Per Periode

**User Story:** Sebagai admin/guru/kepala_sekolah, saya ingin dapat melihat detail nilai per mata pelajaran untuk satu periode rapor siswa, sehingga saya bisa menganalisis performa siswa secara granular.

#### Acceptance Criteria

1. WHEN request GET /siswa/:id/rapor/:raporId diterima, THE API_Detail_Siswa SHALL mengembalikan array nilai per mata pelajaran yang berisi: nama mata pelajaran, komponen_nilai (array objek dengan nama komponen dan nilai), rata_rata (decimal presisi 5,2), dan nama guru, diurutkan berdasarkan nama mata pelajaran secara ascending, hanya menyertakan entri rapor_nilai yang berstatus "submitted"
2. IF rapor_id tidak ditemukan dalam tenant pengguna, atau tidak ada entri rapor_nilai untuk siswa_id dalam rapor tersebut, THEN THE API_Detail_Siswa SHALL mengembalikan response 404 Not Found
3. IF pengguna tidak memiliki role admin, guru, atau kepala_sekolah, THEN THE API_Detail_Siswa SHALL mengembalikan response 403 Forbidden
4. IF komponen_id dalam komponen_nilai merujuk ke komponen_penilaian yang tidak ditemukan, THEN THE API_Detail_Siswa SHALL tetap menyertakan entri komponen tersebut dengan nama komponen bernilai null

### Requirement 5: Navigasi dari Daftar Siswa ke Halaman Detail

**User Story:** Sebagai admin/guru/kepala_sekolah, saya ingin mengklik nama siswa di halaman daftar siswa untuk membuka halaman detail siswa, sehingga saya bisa melihat informasi lengkap tanpa langkah tambahan.

#### Acceptance Criteria

1. WHEN pengguna mengklik nama siswa di tabel SiswaManagementView, THE Aplikasi SHALL melakukan navigasi ke route /siswa/:id dengan parameter id sesuai siswa yang diklik, di mana nama siswa dirender sebagai router-link (anchor element) yang menampilkan URL tujuan pada hover
2. THE Router_Guard SHALL mengizinkan akses route /siswa/:id hanya untuk role admin, guru, dan kepala_sekolah
3. IF pengguna dengan role yang tidak termasuk dalam daftar role yang diizinkan mengakses route /siswa/:id, THEN THE Router_Guard SHALL melakukan redirect ke halaman unauthorized (/unauthorized)
4. IF parameter id pada route /siswa/:id tidak ditemukan di database, THEN THE Halaman_Detail_Siswa SHALL menampilkan pesan yang mengindikasikan data siswa tidak ditemukan beserta tautan untuk kembali ke halaman daftar siswa

### Requirement 6: Tampilan Profil Siswa

**User Story:** Sebagai admin/guru/kepala_sekolah, saya ingin melihat informasi profil dasar siswa di halaman detail, sehingga saya bisa mengetahui data identitas siswa dengan cepat.

#### Acceptance Criteria

1. WHEN halaman detail siswa dimuat, THE Halaman_Detail_Siswa SHALL menampilkan nama lengkap, NISN, jenis kelamin, tanggal lahir (format "dd MMMM yyyy", contoh: "15 Januari 2010"), alamat, status siswa, nama kelas saat ini, dan nama orang tua/wali
2. IF siswa tidak memiliki kelas saat ini (kelas_id null), THEN THE Halaman_Detail_Siswa SHALL menampilkan teks "Belum ditempatkan" pada bagian kelas
3. IF field opsional bernilai null atau kosong (NISN, jenis kelamin, tanggal lahir, alamat, atau nama orang tua/wali), THEN THE Halaman_Detail_Siswa SHALL menampilkan teks placeholder "-" pada field tersebut
4. WHEN halaman detail siswa dimuat, THE Halaman_Detail_Siswa SHALL menampilkan status siswa dalam bentuk badge berwarna dengan ketentuan: "aktif" menggunakan warna hijau, "pindah_sekolah" dan "keluar" menggunakan warna merah, dan "lulus" menggunakan warna biru
5. WHILE data sedang dimuat dari API, THE Halaman_Detail_Siswa SHALL menampilkan indikator loading (skeleton atau spinner) sebagai pengganti konten profil
6. IF request API gagal, THEN THE Halaman_Detail_Siswa SHALL menampilkan pesan error yang menjelaskan bahwa data gagal dimuat beserta tombol "Coba Lagi" yang mengulangi request API ke endpoint detail siswa

### Requirement 7: Tampilan Timeline Riwayat Kelas

**User Story:** Sebagai admin/guru/kepala_sekolah, saya ingin melihat timeline kelas siswa per tahun ajaran, sehingga saya bisa memahami riwayat perpindahan kelas siswa.

#### Acceptance Criteria

1. WHEN halaman detail siswa dimuat, THE Halaman_Detail_Siswa SHALL menampilkan timeline riwayat kelas dalam urutan kronologis terbalik (terbaru di atas), diurutkan berdasarkan tanggal_mulai descending
2. THE Halaman_Detail_Siswa SHALL menampilkan setiap entri timeline dengan: nama kelas, tingkat, nama tahun ajaran, dan tanggal mulai
3. THE Halaman_Detail_Siswa SHALL menandai kelas aktif saat ini (entri yang berasal dari siswa.kelas_id) secara visual berbeda dari riwayat sebelumnya menggunakan badge "Aktif" atau indikator warna yang jelas
4. IF siswa tidak memiliki riwayat kelas dan kelas_id saat ini null, THEN THE Halaman_Detail_Siswa SHALL menampilkan pesan "Belum ada riwayat kelas"

### Requirement 8: Tampilan Ringkasan Rapor

**User Story:** Sebagai admin/guru/kepala_sekolah, saya ingin melihat ringkasan rapor siswa (rata-rata per periode), sehingga saya bisa memantau tren performa akademik siswa.

#### Acceptance Criteria

1. WHEN halaman detail siswa dimuat, THE Halaman_Detail_Siswa SHALL menampilkan daftar rapor yang berstatus final, dikelompokkan per tahun ajaran (diurutkan dari terbaru ke terlama), dengan setiap periode (uts_semester_1, semester_1, uts_semester_2, semester_2) menampilkan rata-rata nilai seluruh mata pelajaran (1 angka desimal) dan peringkat siswa dalam kelas
2. WHEN pengguna mengklik satu periode rapor, THE Halaman_Detail_Siswa SHALL memanggil GET /siswa/:id/rapor/:raporId dan menampilkan detail secara expandable (inline accordion) yang berisi: nama mata pelajaran, nilai per komponen penilaian, dan capaian pembelajaran untuk setiap mata pelajaran pada periode tersebut
3. WHILE detail rapor per mata pelajaran sedang dimuat dari API, THE Halaman_Detail_Siswa SHALL menampilkan indikator loading (spinner atau skeleton) di dalam area expand yang diklik
4. IF siswa belum memiliki rapor dengan status final, THEN THE Halaman_Detail_Siswa SHALL menampilkan pesan "Belum ada data rapor"
5. IF pemanggilan API detail rapor gagal (network error atau response non-2xx), THEN THE Halaman_Detail_Siswa SHALL menampilkan pesan error di dalam area expand dan menyediakan opsi untuk mencoba ulang tanpa menutup accordion
6. WHEN pengguna mengklik periode rapor yang sudah terbuka (expanded), THE Halaman_Detail_Siswa SHALL menutup (collapse) area detail periode tersebut

### Requirement 9: Multi-Tenant Data Isolation

**User Story:** Sebagai operator sistem multi-tenant, saya ingin data siswa terisolasi per tenant, sehingga sekolah satu tidak bisa melihat data siswa sekolah lain.

#### Acceptance Criteria

1. THE API_Detail_Siswa SHALL memfilter semua query (profil, riwayat_kelas, dan rapor) dengan tenant_id yang diambil dari JWT token pengguna yang terautentikasi
2. IF siswa_id ada di database tetapi bukan milik tenant pengguna, THEN THE API_Detail_Siswa SHALL mengembalikan response 404 Not Found (bukan 403, untuk menghindari information leakage)
3. THE Riwayat_Kelas_Service SHALL menyimpan tenant_id (diambil dari JWT token pengguna yang melakukan operasi) pada setiap record riwayat_kelas yang dibuat
