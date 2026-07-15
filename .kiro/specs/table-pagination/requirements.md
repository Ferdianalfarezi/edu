# Requirements Document

## Introduction

Fitur ini mengganti mekanisme pagination cursor-based ("Muat lebih banyak") pada semua tabel list data di aplikasi admin dengan pagination bernomor standar (halaman 1, 2, 3, dst). Perubahan mencakup backend API (NestJS) dan frontend (Vue 3) untuk tiga view: SiswaManagementView, TagihanView, dan RppPortalView. Implementasi referensi sudah ada di AuditLogView.

## Glossary

- **Sistem_Admin**: Aplikasi admin berbasis Vue 3 + TypeScript yang digunakan oleh pengelola sekolah
- **API_Server**: Backend NestJS yang menyediakan endpoint REST untuk aplikasi admin
- **Komponen_Pagination**: Komponen UI reusable yang menampilkan navigasi halaman bernomor (First, Prev, 1, 2, 3..., Next, Last)
- **Page_Size**: Jumlah item data yang ditampilkan per halaman
- **Offset_Pagination**: Metode pagination menggunakan parameter `page` dan `page_size` untuk menghitung offset data
- **PaginationMeta**: Objek metadata yang berisi informasi `page`, `page_size`, `total_count`, `total_pages`
- **View_Terpengaruh**: Tiga view yang saat ini menggunakan cursor-based pagination: SiswaManagementView, TagihanView, RppPortalView
- **Shared_Package**: Package `@edu/shared` yang menyediakan interface dan tipe bersama untuk API dan frontend

## Requirements

### Requirement 1: Migrasi Backend ke Offset Pagination

**User Story:** Sebagai developer, saya ingin endpoint API menggunakan offset-based pagination, sehingga frontend dapat menampilkan navigasi halaman bernomor.

#### Acceptance Criteria

1. WHEN parameter `page` dan `page_size` diterima pada endpoint `/siswa`, THE API_Server SHALL mengembalikan data menggunakan offset pagination dengan format `{ data: T[], meta: { page: number, page_size: number, total_count: number, total_pages: number } }`
2. WHEN parameter `page` dan `page_size` diterima pada endpoint `/tagihan`, THE API_Server SHALL mengembalikan data menggunakan offset pagination dengan format `{ data: T[], meta: { page: number, page_size: number, total_count: number, total_pages: number } }`
3. WHEN parameter `page` dan `page_size` diterima pada endpoint `/rpp`, THE API_Server SHALL mengembalikan data menggunakan offset pagination dengan format `{ data: T[], meta: { page: number, page_size: number, total_count: number, total_pages: number } }`
4. WHEN parameter `page` tidak disertakan dalam request, THE API_Server SHALL menggunakan nilai default `page = 1`
5. WHEN parameter `page_size` tidak disertakan dalam request, THE API_Server SHALL menggunakan nilai default `page_size = 15`
6. WHEN parameter `page_size` bukan salah satu dari nilai valid (15, 50, 100), THE API_Server SHALL mengembalikan HTTP 400 Bad Request dengan pesan error yang menjelaskan nilai valid
7. WHEN parameter `page` bernilai kurang dari 1, THE API_Server SHALL mengembalikan HTTP 400 Bad Request
8. THE API_Server SHALL menghitung `total_count` dari seluruh data yang sesuai filter aktif menggunakan COUNT query terpisah
9. THE API_Server SHALL menghitung `total_pages` sebagai `Math.ceil(total_count / page_size)`
10. WHEN parameter `page` melebihi `total_pages`, THE API_Server SHALL mengembalikan array `data` kosong dengan `meta` yang tetap akurat (total_count dan total_pages tetap benar)
11. THE API_Server SHALL NOT menerima parameter `cursor` pada endpoint `/siswa`, `/tagihan`, dan `/rpp`

### Requirement 2: Komponen Pagination UI

**User Story:** Sebagai pengguna admin, saya ingin melihat navigasi halaman bernomor di bawah tabel, sehingga saya dapat berpindah halaman dengan mudah.

#### Acceptance Criteria

1. THE Komponen_Pagination SHALL menampilkan tombol navigasi: First (««), Prev («), nomor halaman, Next (»), dan Last (»»)
2. WHILE pengguna berada di halaman pertama (currentPage === 1), THE Komponen_Pagination SHALL menonaktifkan (disable) tombol First dan Prev sehingga tombol tidak dapat diklik dan ditampilkan dengan opacity rendah
3. WHILE pengguna berada di halaman terakhir (currentPage === totalPages), THE Komponen_Pagination SHALL menonaktifkan (disable) tombol Next dan Last sehingga tombol tidak dapat diklik dan ditampilkan dengan opacity rendah
4. IF jumlah total halaman melebihi 7, THEN THE Komponen_Pagination SHALL menampilkan ellipsis (...) untuk halaman yang tidak terlihat, dengan selalu menampilkan halaman pertama, halaman terakhir, dan 3 halaman berurutan yang berpusat pada halaman aktif (current-1, current, current+1)
5. THE Komponen_Pagination SHALL menampilkan informasi "Menampilkan X dari Y entri (Halaman N dari M)" di mana X adalah jumlah item yang ditampilkan pada halaman saat ini, Y adalah totalCount, N adalah currentPage, dan M adalah totalPages
6. WHEN pengguna mengklik nomor halaman, THE Komponen_Pagination SHALL meng-emit event perubahan halaman dengan nomor halaman yang dipilih ke komponen induk
7. IF totalPages bernilai 0 atau 1, THEN THE Komponen_Pagination SHALL menyembunyikan tombol navigasi halaman (First, Prev, nomor halaman, Next, Last) dan hanya menampilkan informasi entri
8. THE Komponen_Pagination SHALL menerima props: currentPage (number), totalPages (number), totalCount (number), dan pageSize (number) dari komponen induk
9. WHEN pengguna mengklik tombol First, Prev, Next, atau Last, THE Komponen_Pagination SHALL meng-emit event perubahan halaman dengan nomor halaman tujuan yang sesuai (1 untuk First, currentPage-1 untuk Prev, currentPage+1 untuk Next, totalPages untuk Last)

### Requirement 3: Pengaturan Page Size

**User Story:** Sebagai pengguna admin, saya ingin mengubah jumlah data per halaman, sehingga saya dapat menyesuaikan tampilan sesuai kebutuhan.

#### Acceptance Criteria

1. THE Komponen_Pagination SHALL menampilkan elemen dropdown/select untuk pemilihan Page_Size dengan nilai default terpilih sebesar 15 item per halaman
2. THE Komponen_Pagination SHALL menyediakan tepat 3 pilihan Page_Size dalam dropdown: 15, 50, dan 100
3. THE Komponen_Pagination SHALL menampilkan nilai Page_Size yang sedang aktif sebagai opsi terpilih pada dropdown
4. WHEN pengguna mengubah Page_Size melalui dropdown, THE Sistem_Admin SHALL mereset halaman aktif ke halaman 1
5. WHEN pengguna mengubah Page_Size melalui dropdown, THE Sistem_Admin SHALL memuat ulang data dari API_Server dengan parameter `page_size` sesuai nilai baru yang dipilih dan parameter `page` bernilai 1
6. WHILE data sedang dimuat ulang setelah perubahan Page_Size, THE Komponen_Pagination SHALL menonaktifkan (disable) dropdown Page_Size hingga pemuatan selesai

### Requirement 4: Integrasi pada SiswaManagementView

**User Story:** Sebagai pengguna admin, saya ingin tabel siswa menggunakan pagination bernomor, sehingga saya dapat menavigasi daftar siswa dengan lebih efisien.

#### Acceptance Criteria

1. THE Sistem_Admin SHALL menghapus tombol "Muat lebih banyak" beserta logika cursor-based pagination (variabel `cursor`, `hasNext`, dan fungsi `loadMore`) dari SiswaManagementView
2. THE Sistem_Admin SHALL menampilkan Komponen_Pagination di bawah tabel siswa
3. WHEN filter pencarian berubah, THE Sistem_Admin SHALL menerapkan debounce 300 milidetik, lalu mereset halaman ke halaman 1 dan memuat ulang data
4. WHEN filter kelas, status, atau tahun ajaran berubah, THE Sistem_Admin SHALL mereset halaman ke halaman 1 dan memuat ulang data secara langsung (tanpa debounce)
5. THE Sistem_Admin SHALL mempertahankan semua filter yang sudah ada (search, kelas, status, tahun ajaran) dengan mengirimkan parameter filter bersamaan dengan parameter `page` dan `page_size` pada setiap request ke API
6. WHEN pengguna berpindah halaman, THE Sistem_Admin SHALL mengganti seluruh isi tabel siswa dengan data halaman baru (bukan menambahkan ke data sebelumnya)

### Requirement 5: Integrasi pada TagihanView

**User Story:** Sebagai pengguna admin, saya ingin tabel tagihan menggunakan pagination bernomor, sehingga saya dapat menavigasi daftar tagihan dengan lebih efisien.

#### Acceptance Criteria

1. THE Sistem_Admin SHALL menghapus tombol "Muat Lebih Banyak" beserta logika cursor-based pagination (variabel `listCursor`, `listHasNext`) dari TagihanView
2. THE Sistem_Admin SHALL menampilkan Komponen_Pagination di bawah tabel tagihan
3. WHEN filter status, kelas_id, atau search berubah, THE Sistem_Admin SHALL mereset halaman ke halaman 1 dan memuat ulang data, dengan pencarian menerapkan debounce 300 milidetik
4. THE Sistem_Admin SHALL mempertahankan semua filter yang sudah ada (status, kelas_id, search) dengan mengirimkan parameter filter bersamaan dengan parameter `page` dan `page_size` pada setiap request
5. WHEN pengguna berpindah halaman, THE Sistem_Admin SHALL mengganti seluruh isi tabel tagihan dengan data halaman baru (bukan menambahkan ke data sebelumnya)

### Requirement 6: Integrasi pada RppPortalView

**User Story:** Sebagai pengguna admin, saya ingin tabel RPP menggunakan pagination bernomor, sehingga saya dapat menavigasi daftar RPP dengan lebih efisien.

#### Acceptance Criteria

1. THE Sistem_Admin SHALL menghapus tombol "Muat Lebih Banyak" beserta logika cursor-based pagination (variabel `hasMore`, `nextCursor`, dan fungsi `loadMore`) dari RppPortalView
2. THE Sistem_Admin SHALL menampilkan Komponen_Pagination di bawah grid list RPP
3. WHEN filter pencarian (judul), mata pelajaran, kategori, atau tahun berubah, THE Sistem_Admin SHALL mereset halaman ke halaman 1 dan memuat ulang data, dengan pencarian judul menerapkan debounce 300 milidetik sebelum memicu pemuatan ulang
4. WHEN pengguna berpindah halaman, THE Sistem_Admin SHALL mengganti seluruh isi list RPP dengan data halaman baru (bukan menambahkan ke data yang sudah ada)
5. THE Sistem_Admin SHALL mempertahankan semua filter yang sudah ada (search judul, mata_pelajaran_id, kategori_id, tahun_terbit) bersama pagination baru, sehingga parameter filter dikirim bersamaan dengan parameter `page` dan `page_size` pada setiap request
6. IF pemuatan data halaman gagal, THEN THE Sistem_Admin SHALL menampilkan pesan error dan mempertahankan state halaman serta data terakhir yang berhasil ditampilkan

### Requirement 7: Update Interface Shared Package

**User Story:** Sebagai developer, saya ingin shared package mendukung kedua metode pagination, sehingga interface types dapat digunakan konsisten di seluruh aplikasi.

#### Acceptance Criteria

1. THE Shared_Package SHALL menyediakan interface `OffsetPaginatedResponse<T>` dengan properti `data: T[]` dan `meta: { page: number, page_size: number, total_count: number, total_pages: number }`
2. THE Shared_Package SHALL menyediakan interface `OffsetPaginationQuery` dengan properti `page?: number` (default: 1, minimum: 1) dan `page_size?: number` (default: 15, minimum: 1, maximum: 100)
3. THE Shared_Package SHALL tetap mempertahankan interface `PaginatedResponse<T>` yang sudah ada untuk backward compatibility dengan endpoint lain yang masih menggunakan cursor pagination
4. THE Shared_Package SHALL mengekspor semua interface baru (`OffsetPaginatedResponse`, `OffsetPaginationQuery`) melalui barrel file utama sehingga dapat diimpor langsung dari package root
