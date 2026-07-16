# Implementation Plan: Table Pagination

## Overview

Migrasi tiga endpoint (`/siswa`, `/tagihan`, `/rpp`) dari cursor-based ke offset-based pagination, dan membuat komponen `TablePagination.vue` reusable untuk mengganti tombol "Muat lebih banyak". Backend sudah memiliki utility `paginate()` di `apps/api/src/common/utils/paginate.ts` — shared package perlu interface baru, lalu setiap module di-update untuk menggunakan offset pattern.

## Tasks

- [x] 1. Shared package interfaces dan barrel export
  - [x] 1.1 Tambahkan interface `OffsetPaginatedResponse<T>`, `OffsetPaginationMeta`, dan `OffsetPaginationQuery` di `packages/shared/src/interfaces/api.interface.ts`
    - Tambahkan `OffsetPaginationMeta` dengan properti `page`, `page_size`, `total_count`, `total_pages`
    - Tambahkan `OffsetPaginatedResponse<T>` dengan `data: T[]` dan `meta: OffsetPaginationMeta`
    - Tambahkan `OffsetPaginationQuery` dengan `page?: number` dan `page_size?: number`
    - Pertahankan interface cursor-based yang sudah ada (`PaginatedResponse`, `CursorPaginationQuery`) untuk backward compatibility
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 2. Backend: Update Siswa module ke offset pagination
  - [x] 2.1 Update `ListSiswaQueryDto` — ganti `cursor`/`limit` dengan `page` dan `page_size` fields menggunakan `class-validator` decorators
    - `page`: optional, default 1, `@IsInt()`, `@Min(1)`
    - `page_size`: optional, default 15, `@IsInt()`, `@IsIn([15, 50, 100])`
    - Hapus field `cursor` dan `limit` dari DTO
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.11_

  - [x] 2.2 Update `SiswaService.listSiswa` — implementasi parallel COUNT + SELECT queries dengan OFFSET/LIMIT, return via `paginate()` utility
    - Hitung offset: `(page - 1) * pageSize`
    - Jalankan `Promise.all([countQuery, dataQuery])` untuk performa
    - Gunakan `paginate()` dari `apps/api/src/common/utils/paginate.ts` untuk format response
    - Pertahankan semua filter logic yang ada (search, kelas_id, status, tahun_ajaran_id)
    - _Requirements: 1.1, 1.8, 1.9, 1.10_

- [x] 3. Backend: Update Tagihan module ke offset pagination
  - [x] 3.1 Update `ListTagihanQueryDto` — ganti `cursor`/`limit` dengan `page` dan `page_size` fields
    - Sama pattern dengan 2.1: `page` optional min 1, `page_size` optional `@IsIn([15, 50, 100])`
    - Hapus field cursor-based
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.11_

  - [x] 3.2 Update `TagihanService` list method — implementasi parallel COUNT + SELECT dengan OFFSET/LIMIT
    - Pertahankan semua filter logic (status, kelas_id, bulan, tahun, search)
    - Gunakan `paginate()` utility untuk response
    - _Requirements: 1.2, 1.8, 1.9, 1.10_

- [x] 4. Backend: Update RPP module ke offset pagination
  - [x] 4.1 Update `GetRppQueryDto` — ganti `cursor`/`limit` dengan `page` dan `page_size` fields
    - Sama pattern dengan 2.1
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.11_

  - [x] 4.2 Update `RppService.list` method — implementasi parallel COUNT + SELECT dengan OFFSET/LIMIT
    - Pertahankan filter logic (search, mapel, kategori, tahun)
    - Gunakan `paginate()` utility
    - _Requirements: 1.3, 1.8, 1.9, 1.10_

- [x] 5. Checkpoint - Backend selesai
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Frontend: Buat komponen `TablePagination.vue` reusable dengan circular design
  - [x] 6.1 Buat `apps/admin/src/components/ui/TablePagination.vue` dengan props, emits, template, dan circular pill styling
    - Props: `currentPage`, `totalPages`, `totalCount`, `pageSize`, `loading?`
    - Emits: `page-change(page: number)`, `page-size-change(size: number)`
    - Implementasi `visiblePages` computed dengan ellipsis algorithm (sama seperti AuditLogView)
    - **Circular Design Style (sesuai referensi gambar):**
      - Previous/Next buttons: pill-shaped (`rounded-full`), `bg-primary-600 text-white` saat enabled, `border border-border text-text-tertiary opacity-50` saat disabled, dengan arrow icons (← Previous / Next →)
      - Page number buttons: circular (`rounded-full w-9 h-9`), active page = `bg-primary-600 text-white`, inactive = `bg-surface-50 text-text-primary hover:bg-primary-100`
      - Ellipsis: `text-text-tertiary` tanpa background
      - Items per page dropdown: pill-shaped (`rounded-full`), `border border-border bg-white`, format "{n} Items ▼"
      - Layout: horizontal flex, centered, gap-2 antar elements
      - Info text di bawah: "Menampilkan X dari Y entri (Halaman N dari M)"
    - Disable Previous di halaman 1, disable Next di halaman terakhir
    - Sembunyikan navigasi jika `totalPages <= 1`
    - Page size dropdown dengan opsi [15, 50, 100], disabled saat loading
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.1, 3.2, 3.3, 3.6_

  - [x] 6.2 Export `TablePagination` dari `apps/admin/src/components/ui/index.ts`
    - _Requirements: 2.8_

- [x] 7. Frontend: Integrasi `TablePagination` pada SiswaManagementView
  - [x] 7.1 Refactor `SiswaManagementView.vue` — hapus cursor logic, tambahkan offset pagination state dan `TablePagination` component
    - Hapus variabel `cursor`, `hasNext`, fungsi `loadMore`, tombol "Muat lebih banyak"
    - Tambah state: `currentPage`, `pageSize`, `totalCount`, `totalPages`
    - Update fetch function: kirim `page` & `page_size`, replace data (bukan append)
    - Tambah handler `onPageChange` dan `onPageSizeChange`
    - Filter change (kelas, status, tahun_ajaran) → reset ke page 1 langsung
    - Search → debounce 300ms lalu reset ke page 1
    - Render `<TablePagination>` di bawah tabel
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 3.4, 3.5_

- [x] 8. Frontend: Integrasi `TablePagination` pada TagihanView
  - [x] 8.1 Refactor `TagihanView.vue` — hapus cursor logic, tambahkan offset pagination state dan `TablePagination` component
    - Hapus variabel `listCursor`, `listHasNext`, tombol "Muat Lebih Banyak"
    - Tambah state: `currentPage`, `pageSize`, `totalCount`, `totalPages`
    - Update fetch: kirim `page` & `page_size`, replace data
    - Filter change (status, kelas_id) → reset page 1 langsung
    - Search → debounce 300ms lalu reset page 1
    - Render `<TablePagination>` di bawah tabel
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 3.4, 3.5_

- [x] 9. Frontend: Integrasi `TablePagination` pada RppPortalView
  - [x] 9.1 Refactor `RppPortalView.vue` — hapus cursor logic, tambahkan offset pagination state dan `TablePagination` component
    - Hapus variabel `hasMore`, `nextCursor`, fungsi `loadMore`, tombol "Muat Lebih Banyak"
    - Tambah state: `currentPage`, `pageSize`, `totalCount`, `totalPages`
    - Update fetch: kirim `page` & `page_size`, replace data
    - Filter change (mata_pelajaran, kategori, tahun) → reset page 1 langsung
    - Search judul → debounce 300ms lalu reset page 1
    - Error handling: tampilkan pesan error, pertahankan data terakhir
    - Render `<TablePagination>` di bawah grid RPP
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 3.4, 3.5_

- [x] 10. Frontend: Update pagination style di AuditLogView
  - [x] 10.1 Refactor `AuditLogView.vue` — ganti inline pagination code dengan `TablePagination` component
    - Hapus inline pagination template (tombol ««, «, page numbers, », »»)
    - Hapus fungsi `goFirst`, `goPrev`, `goNext`, `goLast`, `goToPage` dan `visiblePages` computed
    - Tambahkan import dan render `<TablePagination>` component
    - Tambah handler `onPageChange` dan `onPageSizeChange` (page size belum ada di AuditLogView, tambahkan)
    - Pertahankan semua filter dan fetch logic yang ada
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 11. Checkpoint - Frontend selesai
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Property-based tests untuk pagination logic
  - [ ]* 12.1 Write property test: Pagination metadata correctness
    - **Property 1: Pagination metadata correctness**
    - Test `paginate()` utility: untuk setiap N (total items), page ≥ 1, dan page_size ∈ {15, 50, 100}, validasi bahwa meta fields dihitung dengan benar
    - Gunakan `fast-check` dengan arbitrary untuk `totalCount` (0–10000), `page` (1–500), `page_size` dari `fc.constantFrom(15, 50, 100)`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.8, 1.9**

  - [ ]* 12.2 Write property test: Invalid page_size rejection
    - **Property 2: Invalid page_size rejection**
    - Test DTO validation: setiap integer yang BUKAN {15, 50, 100} harus ditolak, setiap nilai dalam set harus diterima
    - **Validates: Requirements 1.6**

  - [ ]* 12.3 Write property test: Out-of-range page returns empty data
    - **Property 3: Out-of-range page returns empty data with correct meta**
    - Test `paginate()` utility: page > total_pages → `data` kosong tapi `total_count` dan `total_pages` tetap benar
    - **Validates: Requirements 1.10**

  - [ ]* 12.4 Write property test: Ellipsis windowing algorithm
    - **Property 4: Ellipsis windowing algorithm**
    - Test `visiblePages` computed logic (extract ke pure function): untuk totalPages > 7, selalu mengandung page 1, page totalPages, dan currentPage ± 1
    - Gunakan `fast-check` dengan `totalPages` (8–200) dan `currentPage` (1–totalPages)
    - **Validates: Requirements 2.4**

  - [ ]* 12.5 Write property test: Navigation button emit correctness
    - **Property 5: Navigation button emit correctness**
    - Test navigation logic: First → 1, Prev → currentPage-1 (jika > 1), Next → currentPage+1 (jika < totalPages), Last → totalPages
    - **Validates: Requirements 2.9**

  - [ ]* 12.6 Write property test: Pagination info text correctness
    - **Property 6: Pagination info text correctness**
    - Test info text computation: X ≤ pageSize, Y = totalCount, N = currentPage, M = totalPages
    - **Validates: Requirements 2.5**

- [~] 13. Final checkpoint
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
    { "id": 4, "tasks": ["7.1", "8.1", "9.1", "10.1"] },
    { "id": 5, "tasks": ["12.1", "12.2", "12.3", "12.4", "12.5", "12.6"] }
  ]
}
```
