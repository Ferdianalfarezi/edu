# Implementation Plan: Sistem Pengembangan V2

## Overview

Implementasi 12 item pengembangan platform Teman Sekolah v2, meliputi bug fixes, fitur baru, dan peningkatan keamanan di backend NestJS, frontend Vue 3 admin panel, dan skema database PostgreSQL.

Urutan pengerjaan: foundation (DB + dependencies) → auth & security → quick fixes & branding → backend features → frontend views → keuangan refactor.

## Tasks

- [x] 1. Foundation: Database migrations dan schema changes
  - [x] 1.1 Tambah kolom baru ke schema `barang` (Req 5)
    - Edit `apps/api/src/drizzle/schema/barang.ts`: tambah 3 enum baru (`kondisi_barang`, `sumber_dana`, `kategori_barang`) dan 4 kolom baru (`lokasi`, `kondisi_barang`, `sumber_dana`, `kategori`) — semua nullable untuk backward compatibility
    - Tambah 3 index baru: `idx_barang_kondisi`, `idx_barang_sumber_dana`, `idx_barang_kategori`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 1.2 Buat schema `konfigurasi_biaya` (Req 6)
    - Buat file baru `apps/api/src/drizzle/schema/konfigurasi-biaya.ts`
    - Definisikan enum `konfigurasi_biaya_type` (`per_siswa`, `per_kelas`)
    - Definisikan tabel `konfigurasi_biaya` dengan unique constraints per tenant+siswa dan per tenant+kelas
    - Export dari `apps/api/src/drizzle/schema/index.ts`
    - _Requirements: 6.1, 6.2, 6.6_

  - [x] 1.3 Tambah kolom baru ke tabel `audit_trail` (Req 8)
    - Edit `apps/api/src/drizzle/schema/tagihan.ts`: tambah 2 kolom baru (`aksi_label` varchar 100, `perubahan` jsonb) ke tabel `audit_trail`
    - _Requirements: 8.4_

  - [x] 1.4 Generate dan run database migrations
    - Jalankan `pnpm --filter @edu/api db:generate` untuk generate migration dari perubahan 1.1–1.3
    - Verifikasi SQL yang dihasilkan benar (additive only, semua kolom baru nullable atau dengan default)
    - Jalankan `pnpm --filter @edu/api db:migrate`
    - _Requirements: 5.1–5.4, 6.6, 8.4_


- [x] 2. Auth & Security: Token error codes dan single device login (Req 11 & 12)
  - [x] 2.1 Tambah `sid` ke `JwtPayload` interface dan update `AuthService.generateTokenPair()`
    - Edit `apps/api/src/modules/auth/interfaces/jwt-payload.interface.ts`: tambah field `sid?: string`
    - Edit `apps/api/src/modules/auth/auth.service.ts`: generate UUID v4 untuk `session_id` pada role non-`orang_tua`, simpan ke Redis dengan key `session:{userId}` dan TTL identik dengan refresh token, sematkan ke claim `sid` di JWT
    - _Requirements: 12.1, 12.2_

  - [ ]* 2.2 Write property test untuk login selalu menghasilkan `sid` yang cocok dengan Session_Store
    - **Property 19: Login baru selalu menghasilkan JWT dengan `sid` yang cocok dengan Session_Store**
    - **Validates: Requirements 12.2**

  - [x] 2.3 Implementasi validasi `sid` di `JwtAuthGuard`
    - Edit `apps/api/src/common/guards/jwt-auth.guard.ts`:
      - Override `handleRequest()` untuk translate `TokenExpiredError` → 401 `TOKEN_EXPIRED`
      - Setelah validasi blacklist yang sudah ada, tambah validasi `sid` vs Redis `session:{userId}`
      - Fail-closed: jika Redis down, throw HTTP 503 untuk role staff (bukan `orang_tua`)
      - Jika `sid` mismatch → throw 401 `SESSION_INVALIDATED`
    - _Requirements: 11.4, 12.3, 12.5, 12.7_

  - [ ]* 2.4 Write property test untuk request dengan `sid` tidak cocok selalu ditolak
    - **Property 20: Request dengan `sid` tidak cocok selalu ditolak dengan SESSION_INVALIDATED**
    - **Validates: Requirements 12.3, 12.5**

  - [x] 2.5 Tambah error code `REFRESH_TOKEN_EXPIRED` di `AuthService.refresh()`
    - Edit `apps/api/src/modules/auth/auth.service.ts`: catch `TokenExpiredError` pada verify refresh token, throw 401 dengan `code: 'REFRESH_TOKEN_EXPIRED'`
    - _Requirements: 11.5_

  - [ ]* 2.6 Write property test untuk token expired error codes
    - **Property 17: Access token expired → `TOKEN_EXPIRED`**
    - **Property 18: Refresh token expired → `REFRESH_TOKEN_EXPIRED`**
    - **Validates: Requirements 11.4, 11.5**

  - [x] 2.7 Update `AuthService.logout()` untuk hapus session dari Redis
    - Edit `apps/api/src/modules/auth/auth.service.ts`: tambah `this.redisService.del('session:{userId}')` di logout untuk role non-`orang_tua`
    - _Requirements: 12.6_

  - [ ]* 2.8 Write property test untuk logout menghapus sesi dari Session_Store
    - **Property 21: Logout menghapus sesi dari Session_Store**
    - **Validates: Requirements 12.6**

  - [x] 2.9 Tambah helper session methods di `RedisService`
    - Edit `apps/api/src/modules/redis/redis.service.ts`: tambah method `setSession(userId, sessionId, ttlSeconds)` dan `getSession(userId)` dan `delSession(userId)` sebagai wrapper typed
    - _Requirements: 12.1, 12.2_

  - [x] 2.10 Update Axios interceptor frontend untuk handle error codes
    - Edit `apps/admin/src/api/client.ts`: tambah handling `TOKEN_EXPIRED` (attempt refresh), `REFRESH_TOKEN_EXPIRED` dan `SESSION_INVALIDATED` (force logout + redirect `/login`)
    - _Requirements: 11.4, 11.5, 12.5_


- [x] 3. Checkpoint — Auth & Security
  - Pastikan semua unit test dan property test untuk Req 11 & 12 lolos. Tanya user jika ada pertanyaan.

- [x] 4. Quick Fixes & Branding (Req 2, 4, 7)
  - [x] 4.1 Fix NaN sisa tagihan — tambah field `sisa` di `TagihanService`
    - Edit `apps/api/src/modules/tagihan/tagihan.service.ts`: di query tunggakan, tambah computed field `sisa: Math.max(0, t.nominal - t.totalDibayar)` ke setiap item response
    - Update interface response `TunggakanItem` dengan field `sisa: number`
    - _Requirements: 7.1_

  - [ ]* 4.2 Write property test untuk field `sisa` tagihan selalu non-negatif
    - **Property 11: Field `sisa` tagihan selalu non-negatif untuk sembarang nominal dan totalDibayar**
    - **Validates: Requirements 7.1**

  - [x] 4.3 Fix SearchSelect dropdown — Teleport + getBoundingClientRect (Req 4)
    - Edit `apps/admin/src/components/ui/SearchSelect.vue`:
      - Tambah `ref="triggerRef"` pada wrapper element, tambah state `dropdownStyle`
      - Implementasi `updateDropdownPosition()` menggunakan `getBoundingClientRect()` + `window.scrollX/Y`
      - Wrap dropdown dengan `<Teleport to="body">`, ubah class positioning ke `fixed z-9999`
      - Tambah `scroll` dan `resize` listeners pada `window` saat dropdown terbuka
      - Perbarui `handleClickOutside` agar berfungsi dengan dropdown di luar container
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 4.4 Write property test untuk posisi dropdown SearchSelect konsisten dengan trigger
    - **Property 5: Posisi dropdown SearchSelect konsisten dengan posisi trigger**
    - **Validates: Requirements 4.4**

  - [x] 4.5 Implementasi branding Teman Sekolah di AppTopBar dan AppSidebar (Req 2)
    - Edit `apps/admin/src/components/layout/AppTopBar.vue`: tambah `<img src="/logo-text.png">` di kiri header dengan fallback teks "Teman Sekolah" via `@error` handler
    - Edit `apps/admin/src/components/layout/AppSidebar.vue`: tambah `<span class="sidebar__brand-text">Teman Sekolah</span>` yang hanya visible di expanded state (`.sidebar:hover`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_


- [x] 5. Backend: Logo sekolah upload endpoint (Req 1)
  - [x] 5.1 Implementasi endpoint `PATCH /tenant/:id/logo`
    - Edit `apps/api/src/modules/tenant/tenant.controller.ts`: tambah endpoint `PATCH /:id/logo` dengan `@UseInterceptors(FileInterceptor('file'))`, Multer limits `{ fileSize: 2 * 1024 * 1024 }`, guard role `super_admin`
    - Edit `apps/api/src/modules/storage/storage.service.ts` (atau buat jika belum ada method upload logo): validasi MIME type via `file-type` atau Sharp (bukan hanya header Multer), resize ke max 512x512 dengan Sharp, upload ke S3 dengan UUID sebagai filename, kembalikan URL publik
    - Update record tenant dengan `logo_url` yang baru
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 6. Backend: Inventarisasi barang — API kolom baru + import/export XLSX (Req 5)
  - [x] 6.1 Update `BarangService` dan DTO untuk kolom baru + filter baru
    - Edit `apps/api/src/modules/barang/barang.service.ts`: update method `create()` dan `update()` untuk menerima `lokasi`, `kondisi_barang`, `sumber_dana`, `kategori`
    - Edit DTO barang: tambah validasi `@IsEnum(KondisiBarang)`, `@IsEnum(SumberDana)`, `@IsEnum(KategoriBarang)`, `@IsOptional()` untuk `lokasi`
    - Update query `findAll()` untuk support filter query params baru: `kondisi_barang`, `sumber_dana`, `kategori`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.11, 5.12_

  - [ ]* 6.2 Write property test untuk filter barang selalu menghasilkan hasil sesuai kriteria
    - **Property 8: Filter dan pencarian barang — hasil selalu sesuai semua kriteria filter aktif**
    - **Validates: Requirements 5.11**

  - [x] 6.3 Implementasi export XLSX barang di `BarangService`
    - Edit `apps/api/src/modules/barang/barang.service.ts`: tambah method `exportToXlsx(filters, tenantId)` menggunakan `exceljs`, query all matching records (tanpa pagination), generate buffer XLSX dengan kolom `nama | deskripsi | jumlah | lokasi | kondisi_barang | sumber_dana | kategori`
    - _Requirements: 5.6_

  - [x] 6.4 Implementasi import XLSX barang di `BarangService`
    - Edit `apps/api/src/modules/barang/barang.service.ts`: tambah method `importFromXlsx(buffer, tenantId)` — parse XLSX dengan `exceljs`, validasi setiap baris (enum valid, jumlah integer ≥ 0, duplikat nama case-insensitive), insert baris valid, return `ImportResult` dengan `berhasilDitambahkan` dan array `dilewati`
    - _Requirements: 5.7, 5.8, 5.9, 5.10_

  - [ ]* 6.5 Write property test untuk import XLSX — baris valid tidak ikut dibatalkan
    - **Property 7: Import XLSX — jumlah_berhasil + jumlah_dilewati = total_baris, setiap dilewati ada alasan**
    - **Validates: Requirements 5.8**

  - [x] 6.6 Tambah endpoint import/export di `BarangController`
    - Edit `apps/api/src/modules/barang/barang.controller.ts`:
      - `GET /barang/export` — panggil `exportToXlsx()`, set header `Content-Disposition: attachment; filename=barang_export.xlsx`
      - `POST /barang/import` — `@UseInterceptors(FileInterceptor('file'))`, Multer limit 5 MB, panggil `importFromXlsx()`
    - _Requirements: 5.6, 5.7, 5.9_


- [x] 7. Backend: Modul konfigurasi biaya (Req 6)
  - [x] 7.1 Buat modul `konfigurasi-biaya` (module, controller, service, DTO)
    - Buat `apps/api/src/modules/konfigurasi-biaya/konfigurasi-biaya.module.ts`
    - Buat `apps/api/src/modules/konfigurasi-biaya/konfigurasi-biaya.controller.ts`: endpoint `GET /konfigurasi-biaya`, `POST /konfigurasi-biaya`, `DELETE /konfigurasi-biaya/:id` — semua hanya untuk role `admin` dan `bendahara`
    - Buat `apps/api/src/modules/konfigurasi-biaya/konfigurasi-biaya.service.ts`: logic upsert (overwrite jika sudah ada per siswa/kelas), delete, list
    - Buat DTO `UpsertKonfigBiayaDto` dengan `@IsEnum`, `@IsUUID`, `@IsInt`, `@Min(1)`, `@Max(999999999)`
    - Register modul di `AppModule`
    - _Requirements: 6.1, 6.2, 6.3, 6.6_

  - [ ]* 7.2 Write property test untuk validasi nominal biaya — menolak semua nilai di luar rentang
    - **Property 10: Nominal ≤ 0 atau > 999.999.999 selalu ditolak; 1–999.999.999 selalu diterima**
    - **Validates: Requirements 6.3**

  - [x] 7.3 Integrasi hierarki biaya ke `TagihanService.generateTagihan()`
    - Edit `apps/api/src/modules/tagihan/tagihan.service.ts`: implementasi `resolveNominalForSiswa(siswaId, kelasId, tenantId)` dengan urutan prioritas: per-siswa → per-kelas → global tenant → throw 400 jika tidak ada satupun
    - _Requirements: 6.4, 6.5, 6.7_

  - [ ]* 7.4 Write property test untuk hierarki biaya — per siswa selalu menang
    - **Property 9: Nominal yang dipilih selalu mengikuti hierarki prioritas per-siswa > per-kelas > global**
    - **Validates: Requirements 6.2, 6.4**

- [x] 8. Backend: Akademik — endpoint detail kelas dan daftar guru (Req 3)
  - [x] 8.1 Update endpoint `GET /kelas/:id` untuk include daftar siswa
    - Edit `apps/api/src/modules/kelas/kelas.controller.ts` (dan service): tambah query siswa yang terdaftar di kelas, include `id`, `nama`, `nisn`, `status` di response
    - _Requirements: 3.1, 3.2_

  - [x] 8.2 Pastikan endpoint `GET /users?role=guru` berfungsi
    - Edit `apps/api/src/modules/user/user.controller.ts` (dan service): pastikan filter `role=guru` sudah support atau tambah, filter hanya `isActive = true` dan belum deleted, kembalikan `id`, `nama`, `email`, `telepon`
    - _Requirements: 3.4_


- [x] 9. Backend: Audit trail format baru (Req 8)
  - [x] 9.1 Update `TagihanService` untuk menyimpan audit log dengan format baru
    - Edit `apps/api/src/modules/tagihan/tagihan.service.ts`: update semua pemanggilan `db.insert(auditTrail)` untuk menyertakan `aksiLabel` (string Bahasa Indonesia) dan `perubahan` (array `PerubahanItem[]` dengan `namaField`, `labelField`, `nilaiSebelum`, `nilaiSesudah`)
    - Definisikan type `PerubahanItem` di file interface/types
    - _Requirements: 8.4_

- [x] 10. Backend: Ekspor tagihan dan tunggakan XLSX/PDF (Req 9)
  - [x] 10.1 Implementasi service export tagihan dan tunggakan
    - Edit `apps/api/src/modules/tagihan/tagihan.service.ts`: tambah method `exportTagihan(filters, format: 'xlsx' | 'pdf', tenantId)` dan `exportTunggakan(filters, format, tenantId)`
    - XLSX: gunakan `exceljs`, 9 kolom berurutan sesuai Req 9.3 (nama_siswa, kelas, bulan, tahun, nominal, total_dibayar, sisa, status, tanggal_jatuh_tempo), maksimum 10.000 baris
    - PDF: gunakan `pdfkit`, header nama sekolah + tanggal cetak, tabel dengan kolom sama, maksimum 10.000 baris
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 10.2 Write property test untuk export XLSX mempertahankan semua data
    - **Property 15: XLSX yang dihasilkan memiliki tepat 9 kolom urutan benar dan data identik dengan source**
    - **Validates: Requirements 9.3**

  - [x] 10.3 Tambah endpoint export di `TagihanController`
    - Edit `apps/api/src/modules/tagihan/tagihan.controller.ts`:
      - `GET /tagihan/export?format=xlsx|pdf&...filters` — panggil `exportTagihan()`, set `Content-Disposition`
      - `GET /tagihan/tunggakan/export?format=xlsx|pdf&...filters` — panggil `exportTunggakan()`, set `Content-Disposition`
    - _Requirements: 9.1, 9.2, 9.4_

- [x] 11. Checkpoint — Backend features
  - Semua endpoint backend verified intact. Property/unit test di-skip.


- [x] 12. Frontend: Logo sekolah di topbar + Pinia store (Req 1)
  - [x] 12.1 Update `tenant-context` Pinia store untuk menyimpan `logoUrl`
    - Edit `apps/admin/src/stores/tenant-context.ts`: tambah field `logoUrl: string | null` ke state, populate dari respons API profil tenant saat login/switch tenant
    - _Requirements: 1.8_

  - [x]* 12.2 ~~Write property test~~ — SKIP (property test)

  - [x] 12.3 Update `AppTopBar.vue` untuk tampilkan logo sekolah dan nama sekolah
    - Verified: AppTopBar membaca dari tenant-context store, menampilkan logo sekolah dan nama sekolah
    - _Requirements: 1.5, 1.6, 1.7, 1.8_

- [x] 13. Frontend: Halaman detail kelas dan daftar guru (Req 3)
  - [x] 13.1 Buat `KelasDetailView.vue`
    - Verified: file exists dengan implementasi lengkap
    - _Requirements: 3.1, 3.2, 3.5_

  - [x]* 13.2 ~~Write property test~~ — SKIP (property test)

  - [x] 13.3 Buat `GuruView.vue`
    - Verified: file exists dengan implementasi lengkap
    - _Requirements: 3.3, 3.4, 3.5_

  - [x]* 13.4 ~~Write property test~~ — SKIP (property test)

  - [x] 13.5 Update router untuk route kelas detail dan guru
    - Verified: routes `/kelas/:id` dan `/guru` sudah ada di router, `/guru` sudah ada di sectionPrefixes dan sectionTabPaths akademik di AppSidebar
    - _Requirements: 3.1, 3.3_


- [x] 14. Frontend: Inventarisasi barang — form fields baru + import/export UI (Req 5)
  - [x] 14.1 Update `BarangView.vue` untuk form fields baru dan filter
    - Fixed: table thead sekarang punya 9 kolom sesuai tbody (Nama, Deskripsi, Jumlah, Lokasi, Kondisi, Sumber Dana, Kategori, Ditambahkan, Aksi)
    - Fixed: openEditForm() sekarang pre-populate semua field baru
    - Fixed: saveBarang() sekarang include validasi dan kirim field baru ke API
    - _Requirements: 5.1–5.5, 5.11_

  - [x]* 14.2 ~~Write property test~~ — SKIP (property test)

  - [x] 14.3 Tombol Import/Export di `BarangView.vue`
    - Verified: tombol Unduh Template, Import Excel, Ekspor Excel sudah ada dan berfungsi
    - _Requirements: 5.6, 5.7, 5.8, 5.9, 5.10_

- [x] 15. Frontend: Konfigurasi biaya sekolah (Req 6)
  - [x] 15.1 Buat `KonfigurasiBiayaView.vue`
    - Verified: file exists dengan implementasi lengkap
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 15.2 Tambah route `/konfigurasi-biaya` di router
    - Verified: route sudah ada di router
    - _Requirements: 6.1_


- [x] 16. Frontend: Keuangan — refactor TagihanView ke 5 sub-route (Req 10 + 9 + 8 + 7)
  - [x] 16.1 Setup router sub-route keuangan dan `useSubNavigation`
    - Verified: 5 sub-route terdaftar, KEUANGAN_TABS ada di useSubNavigation
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x]* 16.2 ~~Write property test~~ — SKIP (property test)

  - [x] 16.3 Buat `TagihanGenerateView.vue`
    - Verified: file exists
    - _Requirements: 10.1_

  - [x] 16.4 Buat `TagihanListView.vue` dengan tombol ekspor
    - Verified: file exists dengan export buttons
    - _Requirements: 9.1, 9.5, 9.6, 10.1, 10.5_

  - [x] 16.5 Buat `TagihanVerifikasiView.vue`
    - Verified: file exists
    - _Requirements: 10.1_

  - [x] 16.6 Buat `TunggakanView.vue` dengan fix NaN dan tombol ekspor
    - Verified: file exists dengan getSisaTagihan() fallback dan export buttons
    - _Requirements: 7.2, 7.3, 7.4, 9.2, 9.5, 9.6_

  - [x]* 16.7 ~~Write property test~~ — SKIP (property test)

  - [x] 16.8 Buat `TagihanAuditView.vue` dengan rendering audit trail baru
    - Verified: file exists dengan formatAuditEntry()
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [x]* 16.9 ~~Write property test~~ — SKIP (property test)

  - [x]* 16.10 ~~Write property test~~ — SKIP (property test)

- [x] 17. Checkpoint — Frontend dan keuangan refactor
  - Semua sub-route verified. BarangView bugs fixed. Property/unit test di-skip.

- [x] 18. Wiring akhir dan integrasi
  - [x] 18.1 Pastikan `AppTopBar` membaca dari `tenant-context` store untuk `logoUrl` dan `schoolName`
    - Verified: AppTopBar wired ke tenant-context store
    - _Requirements: 1.5, 1.6, 1.7, 1.8_

  - [x] 18.2 Verifikasi `AppSubNav` merender tabs keuangan saat path `/tagihan/*`
    - Verified: KEUANGAN_TABS digunakan di useSubNavigation
    - _Requirements: 10.2, 10.3_

- [x] 19. Final checkpoint — Semua fitur terintegrasi
  - Semua task non-test selesai. Property/unit test di-skip sesuai permintaan.


## Notes

- Task bertanda `*` bersifat opsional dan bisa dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan requirements spesifik untuk traceability
- Property test menggunakan **fast-check** (sudah ada di project), minimum **100 iterations** per property
- Tag tiap property test: `// Feature: sistem-pengembangan-v2, Property X: <deskripsi>`
- Semua perubahan schema bersifat additive (kolom nullable/dengan default) — backward compatible
- Kolom `tenant.logo_url` sudah ada di schema — tidak perlu migration untuk tenant
- Urutan wave dalam dependency graph mempertimbangkan: schema → backend logic → backend endpoints → frontend store → frontend views → integrasi

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4"] },
    { "id": 2, "tasks": ["2.1", "6.1", "7.1", "8.1", "8.2", "9.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.9", "4.1", "5.1", "6.3", "6.4", "7.3", "9.3", "10.1"] },
    { "id": 4, "tasks": ["2.4", "2.5", "2.7", "4.2", "4.3", "6.2", "6.5", "6.6", "7.4", "10.2", "10.3"] },
    { "id": 5, "tasks": ["2.6", "2.8", "2.10", "4.4", "4.5", "12.1", "13.1", "13.3", "15.1", "16.1"] },
    { "id": 6, "tasks": ["12.2", "12.3", "13.2", "13.4", "13.5", "14.1", "15.2", "16.2", "16.3", "16.4", "16.5", "16.6", "16.8"] },
    { "id": 7, "tasks": ["14.2", "14.3", "16.7", "16.9", "16.10", "18.1", "18.2"] }
  ]
}
```
