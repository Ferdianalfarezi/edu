# Implementation Plan: tenant-excel-onboarding

## Overview

Implementasi dilakukan dalam urutan: DTO backend → service layer → composables frontend → komponen Vue → integrasi view → property tests. Semua perubahan bersifat additive terhadap kode yang sudah ada; endpoint `POST /tenants` tetap backward-compatible.

## Tasks

- [x] 1. Tambahkan dependency `xlsx` ke apps/admin
  - Jalankan `pnpm --filter @edu/admin add xlsx` untuk menambahkan SheetJS sebagai runtime dependency
  - Pastikan tipe tersedia (SheetJS v0.18+ menyertakan built-in TypeScript declarations)
  - _Requirements: 2.1_

- [x] 2. Buat 5 DTO file onboarding di backend
  - [x] 2.1 Buat `create-onboarding-kelas.dto.ts`
    - Export `CreateOnboardingKelasDto` dengan field `nama: string` dan `tingkat: number` (1–12)
    - Terapkan decorator `@IsString`, `@IsNotEmpty`, `@IsInt`, `@Min(1)`, `@Max(12)`
    - _Requirements: 5.1, 6.3_
  - [x] 2.2 Buat `create-onboarding-mata-pelajaran.dto.ts`
    - Export `CreateOnboardingMataPelajaranDto` dengan field `nama` (max 100) dan `kode` (optional, max 20)
    - _Requirements: 5.1_
  - [x] 2.3 Buat `create-onboarding-siswa.dto.ts`
    - Export `CreateOnboardingSiswaDto` dengan semua field siswa sesuai design (nama, nisn, kelasNama, jenisKelamin, tanggalLahir, alamat, namaWali, teleponWali)
    - Field `jenisKelamin` gunakan `@IsIn(['L', 'P'])`, field `tanggalLahir` gunakan `@IsDateString()`
    - _Requirements: 5.1, 5.8_
  - [x] 2.4 Buat `create-onboarding-guru-staff.dto.ts`
    - Export `CreateOnboardingGuruStaffDto` dengan field `nama`, `email`, `telepon` (optional), `role`
    - Field `role` gunakan `@IsIn(['admin', 'guru', 'kepala_sekolah', 'bendahara'])`
    - _Requirements: 5.2, 5.7_
  - [x] 2.5 Buat `create-onboarding-spp.dto.ts`
    - Export `CreateOnboardingSppDto` dengan field `tingkat` (1–13) dan `nominal` (min 1)
    - _Requirements: 5.5_

- [x] 3. Perbarui `CreateTenantDto` dan barrel export DTO
  - [x] 3.1 Modifikasi `create-tenant.dto.ts` untuk menambahkan 5 array opsional
    - Tambahkan import semua 5 DTO baru, tambahkan field `kelas?`, `mata_pelajaran?`, `siswa?`, `guru_staff?`, `spp_bulanan?` dengan decorator `@IsOptional`, `@IsArray`, `@ValidateNested({each:true})`, `@ArrayMaxSize`, `@Type()`
    - `guru_staff`, `kelas`, `mata_pelajaran`, `siswa` max 500; `spp_bulanan` max 13
    - _Requirements: 5.1, 9.1_
  - [x] 3.2 Update barrel export di `apps/api/src/modules/tenant/dto/index.ts`
    - Re-export semua 5 DTO baru
    - _Requirements: 5.1_

- [x] 4. Refaktor `TenantService` menjadi `createTenantWithOnboarding`
  - [x] 4.1 Tambahkan import schema baru dan update interface `CreateTenantResult`
    - Import `mataPelajaran`, `konfigurasiSekolah`, `tahunAjaran` dari schema
    - Tambahkan field `onboarding_summary?` ke interface `CreateTenantResult` sesuai design
    - _Requirements: 9.4_
  - [x] 4.2 Implementasikan logika pre-transaction validation
    - Validasi duplikasi email dalam `guru_staff` array (reject dengan list semua duplikat)
    - Validasi email `guru_staff` yang sudah ada di tabel `user` (reject dengan list semua konflik)
    - Validasi duplikasi NISN dalam `siswa` array (non-null NISN saja)
    - Validasi `spp_bulanan.tingkat` tidak melebihi `jumlah_tingkat`
    - _Requirements: 5.3, 5.4, 5.5, 5.8_
  - [x] 4.3 Implementasikan `createTenantWithOnboarding` dalam Drizzle transaction
    - Step (a): insert tenant
    - Step (b): insert `tahun_ajaran` default — formula UTC+7: nama `"Y/Y+1"`, tanggal_mulai `Y-07-01`, tanggal_selesai `(Y+1)-06-30`, status `'disiapkan'`
    - Step (c): insert kelas (bulk) dengan referensi `tahunAjaranId` baru, bangun map `namaKelas → kelasId`
    - Step (d): insert mata_pelajaran (bulk)
    - Step (e): insert admin user + semua guru_staff users (generate password per-user via `generateRandomPassword`, hash bcrypt, `mustChangePassword: true`)
    - Step (f): insert siswa (bulk) dengan resolusi `kelasId` via nama-lookup; unmatched → `kelas_id = NULL`
    - Step (g): insert konfigurasi_sekolah untuk SPP (key: `spp_nominal_tingkat_{tingkat}`, value: JSON number)
    - Pastikan seluruh operasi wrapped dalam `db.transaction(async (tx) => {...})`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_
  - [x] 4.4 Implementasikan email enqueue setelah transaction commit
    - Enqueue 1 job untuk admin default
    - Enqueue 1 job per guru_staff user
    - Payload: `{ to, tenantName, adminName, email, password }`
    - Jika enqueue gagal: log error, lanjutkan (jangan fail onboarding)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 4.5 Pertahankan backward compatibility — panggil `createTenantWithOnboarding` dari method `createTenant` yang ada, pastikan response tanpa onboarding data tetap berfungsi
    - Saat semua array absent/empty → buat tenant + admin saja, tanpa `onboarding_summary` di response
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 5. Checkpoint — Verifikasi backend sebelum masuk ke frontend
  - Pastikan semua unit test backend yang sudah ada masih pass (`pnpm --filter @edu/api test:unit`)
  - Pastikan TypeScript compile tanpa error (`pnpm build:api` atau `tsc --noEmit`)
  - Tanya user jika ada pertanyaan sebelum lanjut ke frontend

- [x] 6. Buat composable `useExcelParser.ts`
  - [x] 6.1 Definisikan semua interface TypeScript untuk parsed data
    - `ParsedSiswa`, `ParsedKelas`, `ParsedMataPelajaran`, `ParsedGuruStaff`, `ParsedSppBulanan`, `ParsedOnboardingData`, `ParseResult`
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7_
  - [x] 6.2 Implementasikan `validateFileExtension(filename: string)` dan `validateFileSize(sizeBytes: number)`
    - Extension: reject jika tidak berakhiran `.xlsx` atau `.xls` (case-insensitive), pesan "Format file tidak valid. Gunakan file Excel (.xlsx atau .xls)"
    - Size: reject jika > 10_485_760 bytes, pesan "Ukuran file melebihi batas maksimum 10MB"
    - _Requirements: 1.2, 1.3_
  - [x] 6.3 Implementasikan parser Sheet_Kelas
    - Scan header row untuk kolom matching `/^tingkat_(\d+)$/` (N 1–12); kolom lain diabaikan
    - Setiap cell non-empty → `ParsedKelas { nama: string.trim(), tingkat: N }`
    - _Requirements: 2.4, 6.3_
  - [x] 6.4 Implementasikan parser Sheet_Siswa
    - Map kolom ke properti sesuai design; trim semua string
    - Parse `tanggal_lahir`: coba sebagai Excel serial (SheetJS `SSF.parse_date_code`) lalu sebagai date string → output ISO `YYYY-MM-DD` atau `null`
    - _Requirements: 2.3, 8.1, 8.4, 8.5_
  - [x] 6.5 Implementasikan parser Sheet_MataPelajaran, Sheet_GuruStaff, Sheet_SPP
    - Sheet_MataPelajaran: kolom `mata_pelajaran` → `nama`, `kode` optional
    - Sheet_GuruStaff: trim, validasi role (invalid → `isValid: false, reason`), validasi format email (invalid → `isValid: false, reason`)
    - Sheet_SPP: strip non-digit dari `nominal` → integer atau null; parse `tingkat` sebagai integer atau null; nominal ≤ 0 → invalid
    - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.12, 8.2, 8.3, 8.6, 8.7_
  - [x] 6.6 Implementasikan fungsi utama `parseExcelFile(file: File): Promise<ParseResult>`
    - Validasi ekstensi dan ukuran terlebih dahulu
    - Baca file via `XLSX.read(arrayBuffer, { type: 'array', cellDates: false })`
    - Cek keberadaan semua 5 sheet wajib; jika ada yang hilang → fatal error, halt
    - Panggil semua sub-parser; tangkap exception SheetJS → error "File Excel tidak dapat dibaca..."
    - Return `ParseResult { data, errors, warnings, isValid }`
    - `isValid = true` jika tidak ada fatal errors DAN ada minimal 1 sheet dengan 1 data row
    - _Requirements: 1.4, 2.1, 2.2, 2.11_

- [x] 7. Buat composable `useOnboardingForm.ts`
  - [x] 7.1 Definisikan type `Step` dan state reaktif dengan `ref()`
    - `step: Ref<Step>`, `tenantForm`, `parseResult`, `isSubmitting`, `submitError`
    - _Requirements: 4.2, 4.3_
  - [x] 7.2 Implementasikan `handleFileParsed`, `handleGantiFile`, `goToStep`
    - `handleFileParsed`: simpan result, lanjut ke step `'preview'` jika valid
    - `handleGantiFile`: reset `parseResult` ke null, kembali ke step `'upload'`
    - `goToStep`: validasi transisi yang diizinkan
    - _Requirements: 3.9, 1.5_
  - [x] 7.3 Implementasikan `submitOnboarding()`
    - Filter hanya valid rows dari setiap array sebelum masuk payload
    - POST ke `/tenants` dengan combined payload (tenant form + onboarding data)
    - Set `isSubmitting = true` selama request berlangsung
    - Sukses: tutup modal, tampilkan toast, refresh list
    - Error network: pesan "Gagal terhubung ke server. Periksa koneksi internet dan coba lagi"
    - Error server: tampilkan `error.response.data.message`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 8. Buat komponen `OnboardingPreview.vue`
  - [x] 8.1 Buat struktur tab (5 tab: Siswa, Kelas, Mata Pelajaran, Guru & Staff, SPP)
    - Setiap tab header menampilkan count badge: `Siswa (N)`, `Kelas (N)`, dst
    - Props: `data: ParsedOnboardingData`, `errors: string[]`, `warnings: string[]`
    - Emit: `gantiFile`
    - _Requirements: 3.1, 3.2_
  - [x] 8.2 Render tabel Siswa dengan row cap 100 + overflow note
    - Kolom: Nama, NISN, Kelas, Jenis Kelamin, Tanggal Lahir (DD/MM/YYYY)
    - Jika N > 100: tampilkan 100 baris + note "Menampilkan 100 dari N baris"
    - Invalid rows: class `bg-red-50 border-l-4 border-red-400`, kolom tambahan "Alasan"
    - _Requirements: 3.3, 3.8_
  - [x] 8.3 Render tampilan Kelas (grouped by tingkat), tabel MataPelajaran dengan cap 100, tabel GuruStaff dengan cap 100
    - Kelas: group heading per tingkat, list nama kelas di bawahnya
    - MataPelajaran: kolom Nama Mata Pelajaran, Kode; cap 100 + note jika overflow
    - GuruStaff: kolom Nama, Email, Telepon, Role; cap 100 + note jika overflow; invalid rows highlighted
    - _Requirements: 3.4, 3.5, 3.6, 3.8_
  - [x] 8.4 Render tabel SPP dan warning banner zero-staff-email
    - SPP: kolom Tingkat, Nominal (format `id-ID`, e.g. Rp 1.000.000)
    - Jika 0 guru_staff dengan email valid: tampilkan warning banner non-blocking di atas tombol konfirmasi
    - Tombol "Ganti File" di footer preview
    - _Requirements: 3.7, 3.10_

- [x] 9. Refaktor `TenantManagementView.vue` untuk multi-step modal
  - [x] 9.1 Integrasikan `useOnboardingForm` dan ganti modal size ke `xl`
    - Import dan instantiate `useOnboardingForm`
    - Ubah `BaseModal` dari `size="lg"` → `size="xl"`
    - Download link template `Template_TemanSekolah.xlsx` selalu tampil saat modal terbuka (semua step)
    - _Requirements: 1.1, 1.6_
  - [x] 9.2 Implementasikan Step 1 (Info Sekolah) dan Step 2 (Upload Excel) di dalam modal
    - Step 1: form info sekolah + admin seperti sebelumnya, tombol "Lanjut" → step upload
    - Step 2: file input dengan label "Wajib", error display inline, parsing trigger saat file dipilih
    - Reset error state setiap kali file baru dipilih
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.11_
  - [x] 9.3 Integrasikan `OnboardingPreview.vue` sebagai Step 3 dan kabel submit final
    - Render `<OnboardingPreview>` saat `step === 'preview'`
    - Handle emit `gantiFile` → `handleGantiFile()`
    - Submit button: disabled + loading spinner saat `isSubmitting`
    - _Requirements: 3.1–3.10, 4.1–4.7_

- [x] 10. Checkpoint — Verifikasi full integration frontend + backend
  - Jalankan `pnpm build:admin` (vue-tsc + vite build) — pastikan tidak ada TypeScript error
  - Jalankan `pnpm --filter @edu/api test:unit` — pastikan semua test masih pass
  - Tanya user jika ada pertanyaan sebelum lanjut ke property tests

- [x] 11. Tulis property tests frontend (Vitest + fast-check)
  - [x] 11.1 Property tests untuk file validation (Properties 1, 2)
    - **Property 1: Extension validation rejects non-Excel filenames**
    - **Property 2: File size validation rejects oversized files**
    - Lokasi: `apps/admin/src/composables/__tests__/useExcelParser.property.test.ts`
    - **Validates: Requirements 1.2, 1.3**
  - [x] 11.2 Property tests untuk form state (Property 3)
    - **Property 3: Submit disabled when parsing not succeeded**
    - Lokasi: `apps/admin/src/composables/__tests__/useOnboardingForm.property.test.ts`
    - **Validates: Requirements 1.5**
  - [x] 11.3 Property tests untuk sheet detection dan string trimming (Properties 4, 8)
    - **Property 4: Missing sheet detection lists exactly the absent sheets**
    - **Property 8: String values are trimmed before validation**
    - Lokasi: `apps/admin/src/composables/__tests__/useExcelParser.property.test.ts`
    - **Validates: Requirements 2.2, 2.12**
  - [x] 11.4 Property tests untuk per-row validation (Properties 5, 6, 7)
    - **Property 5: Invalid guru_staff roles are marked and all valid rows pass through**
    - **Property 6: Invalid email format marks the row invalid**
    - **Property 7: Invalid SPP nominal marks the row invalid**
    - Lokasi: `apps/admin/src/composables/__tests__/useExcelParser.property.test.ts`
    - **Validates: Requirements 2.8, 2.9, 2.10**
  - [x] 11.5 Property tests untuk preview rendering (Properties 9, 10, 11)
    - **Property 9: Preview summary counts match actual parsed array lengths**
    - **Property 10: Row display is capped at 100 with overflow note**
    - **Property 11: Invalid rows are rendered with distinct styling**
    - Lokasi: `apps/admin/src/components/__tests__/OnboardingPreview.property.test.ts`
    - **Validates: Requirements 3.2, 3.3, 3.5, 3.6, 3.7, 3.8**
  - [x] 11.6 Property test untuk submission payload filtering (Property 12)
    - **Property 12: Submission payload contains only valid rows**
    - Lokasi: `apps/admin/src/composables/__tests__/useOnboardingForm.property.test.ts`
    - **Validates: Requirements 4.7**
  - [x] 11.7 Property tests untuk date dan numeric type safety (Properties 28, 29, 30)
    - **Property 28: tanggal_lahir is always a valid ISO YYYY-MM-DD or null**
    - **Property 29: nominal stripping always produces a positive integer or null**
    - **Property 30: tingkat from Sheet_SPP parses to a positive integer or null**
    - Lokasi: `apps/admin/src/composables/__tests__/useExcelParser.property.test.ts`
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7**
  - [x] 11.8 Property tests untuk tingkat_N column pattern (Property 22)
    - **Property 22: tingkat_N column pattern correctly extracts tingkat values**
    - Lokasi: `apps/admin/src/composables/__tests__/useExcelParser.property.test.ts`
    - **Validates: Requirements 2.4, 6.3**

- [x] 12. Tulis property tests backend (Jest + fast-check)
  - [x] 12.1 Property tests untuk backend DTO validation (Properties 13, 14, 17, 18)
    - **Property 13: Backend rejects arrays exceeding size limits**
    - **Property 14: Backend rejects guru_staff with invalid role and names all bad values**
    - **Property 17: SPP validation enforces tingkat bounds and positive nominal**
    - **Property 18: guru_staff entries missing required fields fail validation**
    - Lokasi: `apps/api/src/modules/tenant/__tests__/tenant-onboarding-validation.property.spec.ts`
    - **Validates: Requirements 5.1, 5.2, 5.5, 5.7**
  - [x] 12.2 Property tests untuk duplicate detection (Properties 15, 16, 19)
    - **Property 15: Backend detects all duplicate emails within the request**
    - **Property 16: Backend detects all conflicting emails against existing users**
    - **Property 19: Backend detects all duplicate NISNs in siswa array**
    - Lokasi: `apps/api/src/modules/tenant/__tests__/tenant-onboarding-validation.property.spec.ts`
    - **Validates: Requirements 5.3, 5.4, 5.8**
  - [x] 12.3 Property tests untuk tahun ajaran formula dan SPP key format (Properties 21, 24)
    - **Property 21: Tahun_Ajaran_Default formula is correct for any execution date**
    - **Property 24: SPP keys follow the exact naming formula**
    - Lokasi: `apps/api/src/modules/tenant/__tests__/tenant-onboarding-service.property.spec.ts`
    - **Validates: Requirements 6.2, 6.5**
  - [x] 12.4 Property tests untuk kelas resolution dan unmatched lookup (Properties 23)
    - **Property 23: Unmatched kelas name sets kelas_id to NULL without rollback**
    - Lokasi: `apps/api/src/modules/tenant/__tests__/tenant-onboarding-service.property.spec.ts`
    - **Validates: Requirements 6.4**
  - [x] 12.5 Property tests untuk password generation (Property 25)
    - **Property 25: Each guru_staff user gets an independent password satisfying complexity**
    - Lokasi: `apps/api/src/modules/tenant/__tests__/tenant-onboarding-service.property.spec.ts`
    - **Validates: Requirements 6.7**
  - [x] 12.6 Property tests untuk email queue (Properties 26, 27)
    - **Property 26: Total email jobs enqueued equals guru_staff count plus one admin**
    - **Property 27: Every email job payload contains all required fields**
    - Lokasi: `apps/api/src/modules/tenant/__tests__/tenant-onboarding-service.property.spec.ts`
    - **Validates: Requirements 7.1, 7.2, 7.3**
  - [x] 12.7 Property tests untuk partial arrays dan response structure (Properties 31, 32)
    - **Property 31: Partial onboarding arrays are processed independently**
    - **Property 32: Response structure is invariant across all request variants**
    - Lokasi: `apps/api/src/modules/tenant/__tests__/tenant-onboarding-service.property.spec.ts`
    - **Validates: Requirements 9.3, 9.4**
  - [x] 12.8 Property test untuk transaction atomicity (Property 20)
    - **Property 20: Transaction atomicity — any failure causes full rollback**
    - Lokasi: `apps/api/src/modules/tenant/__tests__/tenant-onboarding-service.property.spec.ts`
    - **Validates: Requirements 6.1, 6.6**

- [-] 13. Final checkpoint — Semua test harus pass
  - Jalankan `pnpm --filter @edu/admin test --run` — pastikan semua frontend tests pass
  - Jalankan `pnpm --filter @edu/api test:unit` — pastikan semua backend unit tests pass
  - Pastikan tidak ada TypeScript error di kedua apps
  - Tanya user jika ada pertanyaan sebelum dianggap selesai

## Notes

- Tasks bertanda `*` bersifat opsional dan dapat di-skip untuk MVP yang lebih cepat
- Property 20 (transaction atomicity) paling baik diuji via integration test dengan real DB (`test:contract:real`), bukan pure unit test — task 12.8 dapat dilakukan sebagai integration test jika lebih praktis
- Urutan task 2 → 3 → 4 kritis karena backend DTO harus ada sebelum service
- `useExcelParser` adalah pure async function (bukan composable dengan state reaktif) — ini sesuai design; state reaktif ada di `useOnboardingForm`
- SheetJS v0.18+ (package name `xlsx`) sudah menyertakan TypeScript declarations — tidak perlu `@types/xlsx` terpisah
- Backward compatibility dijaga di task 4.5: `createTenant` tetap menjadi public API di controller, namun di dalamnya memanggil `createTenantWithOnboarding`
- Email enqueue failure (task 4.4) tidak boleh fail-kan onboarding — log saja dan lanjut ke job berikutnya

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": 4, "tasks": ["4.4", "4.5"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4", "6.5"] },
    { "id": 7, "tasks": ["6.6", "7.1"] },
    { "id": 8, "tasks": ["7.2", "7.3", "8.1"] },
    { "id": 9, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 10, "tasks": ["9.1"] },
    { "id": 11, "tasks": ["9.2"] },
    { "id": 12, "tasks": ["9.3"] },
    { "id": 13, "tasks": ["11.1", "11.2", "11.3", "11.4", "12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8"] },
    { "id": 14, "tasks": ["11.5", "11.6", "11.7", "11.8"] }
  ]
}
```
