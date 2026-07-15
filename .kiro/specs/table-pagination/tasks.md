# Implementation Plan: Table Pagination

## Overview

Migrasi tiga endpoint (`/siswa`, `/tagihan`, `/rpp`) dari cursor-based ke offset-based pagination, dan membuat komponen `TablePagination.vue` reusable untuk mengganti tombol "Muat lebih banyak". Backend sudah memiliki utility `paginate()` di `apps/api/src/common/utils/paginate.ts` — shared package perlu interface baru, lalu setiap module di-update untuk menggunakan offset pattern.

## Tasks

- [ ] 1. Shared package interfaces dan barrel export
  - [ ] 1.1 Tambahkan interface `OffsetPaginatedResponse<T>`, `OffsetPaginationMeta`, dan `OffsetPaginationQuery` di `packages/shared/src/interfaces/api.interface.ts`
    - Tambahkan `OffsetPaginationMeta` dengan properti `page`, `page_size`, `total_count`, `total_pages`
    - Tambahkan `OffsetPaginatedResponse<T>` dengan `data: T[]` dan `meta: OffsetPaginationMeta`
    - Tambahkan `OffsetPaginationQuery` dengan `page?: number` dan `page_size?: number`
    - Pertahankan interface cursor-based yang sudah ada (`PaginatedResponse`, `CursorPaginationQuery`) untuk backward compatibility
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 2. Backend: Update Siswa module ke offset pagination
  - [ ] 2.1 Update `ListSiswaQueryDto` — ganti `cursor`/`limit` dengan `page` dan `page_size` fields menggunakan `class-validator` decorators
    - `page`: optional, default 1, `@IsInt()`, `@Min(1)`
    - `page_size`: optional, default 15, `@IsInt()`, `@IsIn([15, 50, 100])`
    - Hapus field `cursor` dan `limit` dari DTO
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.11_

  - [ ] 2.2 Update `SiswaService.listSiswa` — implementasi parallel COUNT + SELECT queries dengan OFFSET/LIMIT, return via `paginate()` utility
    - Hitung offset: `(page - 1) * pageSize`
    - Jalankan `Promise.all([countQuery, dataQuery])` untuk performa
    - Gunakan `paginate()` dari `apps/api/src/common/utils/paginate.ts` untuk format response
    - Pertahankan semua filter logic yang ada (search, kelas_id, status, tahun_ajaran_id)
    - _Requirements: 1.1, 1.8, 1.9, 1.10_

- [ ] 3. Backend: Update Tagihan module ke offset pagination
  - [ ] 3.1 Update `ListTagihanQueryDto` — ganti `cursor`/`limit` dengan `page` dan `page_size` fields
    - Sama pattern dengan 2.1: `page` optional min 1, `page_size` optional `@IsIn([15, 50, 100])`
    - Hapus field cursor-based
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.11_

  - [ ] 3.2 Update `TagihanService` list method — implementasi parallel COUNT + SELECT dengan OFFSET/LIMIT
    - Pertahankan semua filter logic (status, kelas_id, bulan, tahun, search)
    - Gunakan `paginate()` utility untuk response
    - _Requirements: 1.2, 1.8, 1.9, 1.10_

- [ ] 4. Backend: Update RPP module ke offset pagination
  - [ ] 4.1 Update `GetRppQueryDto` — ganti `cursor`/`limit` dengan `page` dan `page_size` fields
    - Sama pattern dengan 2.1
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.11_

  - [ ] 4.2 Update `RppService.list` method — implementasi parallel COUNT + SELECT dengan OFFSET/LIMIT
    - Pertahankan filter logic (search, mapel, kategori, tahun)
    - Gunakan `paginate()` utility
    - _Requirements: 1.3, 1.8, 1.9, 1.10_

- [ ] 5. Checkpoint - Backend selesai
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Frontend: Buat komponen `TablePagination.vue` reusable
  - [ ] 6.1 Buat `apps/admin/src/components/ui/TablePagination.vue` dengan props, emits, template, dan styling
    - Props: `currentPage`, `totalPages`, `totalCount`, `pageSize`, `loading?`
    - Emits: `page-change(page: number)`, `page-size-change(size: number)`
    - Implementasi `visiblePages` computed dengan ellipsis algorithm (sama seperti AuditLogView)
    - Tombol navigasi: First (««), Prev («), page numbers, Next (»), Last (»»)
    - Disable First/Prev di halaman 1, disable Next/Last di halaman terakhir
    - Sembunyikan navigasi jika `totalPages <= 1`
    - Page size dropdown dengan opsi [15, 50, 100], disabled saat loading
    - Info text: "Menampilkan X dari Y entri (Halaman N dari M)"
    - Styling konsisten dengan pagination di AuditLogView (Tailwind)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.1, 3.2, 3.3, 3.6_

  - [ ] 6.2 Export `TablePagination` dari `apps/admin/src/components/ui/index.ts`
    - _Requirements: 2.8_

- [ ] 7. Frontend: Integrasi `TablePagination` pada SiswaManagementView
  - [ ] 7.1 Refactor `SiswaManagementView.vue` — hapus cursor logic, tambahkan offset pagination state dan `TablePagination` component
    - Hapus variabel `cursor`, `hasNext`, fungsi `loadMore`, tombol "Muat lebih banyak"
    - Tambah state: `currentPage`, `pageSize`, `totalCount`, `totalPages`
    - Update fetch function: kirim `page` & `page_size`, replace data (bukan append)
    - Tambah handler `onPageChange` dan `onPageSizeChange`
    - Filter change (kelas, status, tahun_ajaran) → reset ke page 1 langsung
    - Search → debounce 300ms lalu reset ke page 1
    - Render `<TablePagination>` di bawah tabel
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 3.4, 3.5_

- [ ] 8. Frontend: Integrasi `TablePagination` pada TagihanView
  - [ ] 8.1 Refactor `TagihanView.vue` — hapus cursor logic, tambahkan offset pagination state dan `TablePagination` component
    - Hapus variabel `listCursor`, `listHasNext`, tombol "Muat Lebih Banyak"
    - Tambah state: `currentPage`, `pageSize`, `totalCount`, `totalPages`
    - Update fetch: kirim `page` & `page_size`, replace data
    - Filter change (status, kelas_id) → reset page 1 langsung
    - Search → debounce 300ms lalu reset page 1
    - Render `<TablePagination>` di bawah tabel
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 3.4, 3.5_

- [ ] 9. Frontend: Integrasi `TablePagination` pada RppPortalView
  - [ ] 9.1 Refactor `RppPortalView.vue` — hapus cursor logic, tambahkan offset pagination state dan `TablePagination` component
    - Hapus variabel `hasMore`, `nextCursor`, fungsi `loadMore`, tombol "Muat Lebih Banyak"
    - Tambah state: `currentPage`, `pageSize`, `totalCount`, `totalPages`
    - Update fetch: kirim `page` & `page_size`, replace data
    - Filter change (mata_pelajaran, kategori, tahun) → reset page 1 langsung
    - Search judul → debounce 300ms lalu reset page 1
    - Error handling: tampilkan pesan error, pertahankan data terakhir
    - Render `<TablePagination>` di bawah grid RPP
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 3.4, 3.5_

- [ ] 10. Checkpoint - Frontend selesai
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Property-based tests untuk pagination logic
  - [ ]* 11.1 Write property test: Pagination metadata correctness
    - **Property 1: Pagination metadata correctness**
    - Test `paginate()` utility: untuk setiap N (total items), page ≥ 1, dan page_size ∈ {15, 50, 100}, validasi bahwa meta fields dihitung dengan benar
    - Gunakan `fast-check` dengan arbitrary untuk `totalCount` (0–10000), `page` (1–500), `page_size` dari `fc.constantFrom(15, 50, 100)`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.8, 1.9**

  - [ ]* 11.2 Write property test: Invalid page_size rejection
    - **Property 2: Invalid page_size rejection**
    - Test DTO validation: setiap integer yang BUKAN {15, 50, 100} harus ditolak, setiap nilai dalam set harus diterima
    - **Validates: Requirements 1.6**

  - [ ]* 11.3 Write property test: Out-of-range page returns empty data
    - **Property 3: Out-of-range page returns empty data with correct meta**
    - Test `paginate()` utility: page > total_pages → `data` kosong tapi `total_count` dan `total_pages` tetap benar
    - **Validates: Requirements 1.10**

  - [ ]* 11.4 Write property test: Ellipsis windowing algorithm
    - **Property 4: Ellipsis windowing algorithm**
    - Test `visiblePages` computed logic (extract ke pure function): untuk totalPages > 7, selalu mengandung page 1, page totalPages, dan currentPage ± 1
    - Gunakan `fast-check` dengan `totalPages` (8–200) dan `currentPage` (1–totalPages)
    - **Validates: Requirements 2.4**

  - [ ]* 11.5 Write property test: Navigation button emit correctness
    - **Property 5: Navigation button emit correctness**
    - Test navigation logic: First → 1, Prev → currentPage-1 (jika > 1), Next → currentPage+1 (jika < totalPages), Last → totalPages
    - **Validates: Requirements 2.9**

  - [ ]* 11.6 Write property test: Pagination info text correctness
    - **Property 6: Pagination info text correctness**
    - Test info text computation: X ≤ pageSize, Y = totalCount, N = currentPage, M = totalPages
    - **Validates: Requirements 2.5**

- [ ] 12. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Backend `apps/api` sudah memiliki `paginate()` utility dan `PaginatedResponse` interface (offset-based) — TIDAK perlu dibuat ulang
- Shared `@edu/shared` masih menggunakan cursor-based `PaginatedResponse` — interface offset baru ditambahkan tanpa menghapus yang lama
- `AuditLogView.vue` digunakan sebagai referensi visual dan pattern, tapi `TablePagination.vue` menambahkan page size selector yang tidak ada di AuditLogView
- Setiap view integration task (7, 8, 9) bisa dikerjakan paralel setelah komponen `TablePagination.vue` selesai
- Property tests menggunakan `fast-check` library

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.2", "6.1"] },
    { "id": 3, "tasks": ["6.2"] },
    { "id": 4, "tasks": ["7.1", "8.1", "9.1"] },
    { "id": 5, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6"] }
  ]
}
```
