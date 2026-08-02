# Design Document — tenant-excel-onboarding

## Overview

Fitur ini mengubah alur onboarding tenant dari "buat tenant kosong" menjadi "buat tenant lengkap sekaligus" dengan data awal sekolah yang diimpor dari file Excel. Super admin diharuskan mengupload file Excel berformat `Template_TemanSekolah.xlsx` (5 sheet) saat membuat tenant baru. File di-parse di browser, ditampilkan sebagai preview terstruktur untuk dikonfirmasi, lalu seluruh data dikirim ke backend dalam satu HTTP request. Backend mengeksekusi semua insert dalam satu database transaction atomik.

**Scope perubahan:**
- Frontend: `TenantManagementView.vue` direfaktor menjadi multi-step flow (form info → upload Excel → preview → konfirmasi). Komponen baru `ExcelParser`, `OnboardingPreview` ditambahkan.
- Backend: `CreateTenantDto` diperluas dengan onboarding arrays opsional. `TenantService.createTenant` direfaktor menjadi `TenantService.createTenantWithOnboarding` yang mengeksekusi semua operasi dalam satu Drizzle transaction.
- Dependensi baru: `xlsx` (SheetJS) di `apps/admin`.

**Backward compatibility:** Endpoint `POST /tenants` tetap berfungsi tanpa onboarding arrays — semua array bersifat opsional di DTO.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Admin Panel (Vue 3)                                                │
│                                                                     │
│  TenantManagementView                                               │
│    ├── Step 1: CreateTenantForm (info sekolah + admin)              │
│    ├── Step 2: ExcelUploadStep                                      │
│    │     └── useExcelParser (composable)                            │
│    │           └── SheetJS (xlsx library)                           │
│    ├── Step 3: OnboardingPreview (5 tab sections)                   │
│    └── Step 4: Submit → api.post('/tenants', onboardingDto)         │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ HTTP POST /tenants
┌─────────────────────────────▼───────────────────────────────────────┐
│  NestJS API                                                         │
│                                                                     │
│  TenantController.createTenant(dto: CreateTenantDto)                │
│    └── TenantService.createTenantWithOnboarding(dto)                │
│          ├── Validate DTO (class-validator)                         │
│          ├── Custom cross-field validation                          │
│          └── db.transaction(async (tx) => {                         │
│                1. Insert tenant                                      │
│                2. Insert tahun_ajaran (default)                     │
│                3. Insert kelas (ref tahun_ajaran_id)                │
│                4. Insert mata_pelajaran                             │
│                5. Insert users (admin + guru_staff)                 │
│                6. Insert siswa (resolve kelas_id)                   │
│                7. Insert konfigurasi_sekolah (SPP)                  │
│              })                                                     │
│          └── emailQueue.add(...) × N (after tx commit)              │
└─────────────────────────────────────────────────────────────────────┘
```

### Multi-Step Modal Flow

```
[Step 1: Info Sekolah]  →  [Step 2: Upload Excel]  →  [Step 3: Preview]  →  [Submit]
      ↑                           ↑                          ↑
   "Kembali"                 "Ganti File"               "Kembali"
```

Modal menggunakan `size="xl"` untuk mengakomodasi preview data yang besar. State dikelola via sebuah composable `useOnboardingForm` agar `TenantManagementView` tidak menjadi god component.

---

## Components and Interfaces

### Frontend Components

#### `useExcelParser` composable
`apps/admin/src/composables/useExcelParser.ts`

```typescript
interface ParsedOnboardingData {
  siswa: ParsedSiswa[]
  kelas: ParsedKelas[]
  mataPelajaran: ParsedMataPelajaran[]
  guruStaff: ParsedGuruStaff[]
  sppBulanan: ParsedSppBulanan[]
}

interface ParseResult {
  data: ParsedOnboardingData | null
  errors: string[]           // fatal errors — parsing halted
  warnings: string[]         // non-fatal — some rows skipped
  isValid: boolean
}

function parseExcelFile(file: File): Promise<ParseResult>
```

Tanggung jawab: membaca file via SheetJS, memetakan kolom, memvalidasi baris per sheet, mengembalikan `ParseResult`. Tidak ada state reaktif — pure function yang digunakan oleh composable induknya.

#### `useOnboardingForm` composable
`apps/admin/src/composables/useOnboardingForm.ts`

```typescript
type Step = 'info' | 'upload' | 'preview' | 'submitting'

interface OnboardingFormState {
  step: Ref<Step>
  tenantForm: Ref<TenantFormData>
  parseResult: Ref<ParseResult | null>
  isSubmitting: Ref<boolean>
  submitError: Ref<string | null>
}

function useOnboardingForm(): OnboardingFormState & {
  goToStep(step: Step): void
  handleFileParsed(result: ParseResult): void
  handleGantiFile(): void
  submitOnboarding(): Promise<void>
}
```

#### `OnboardingPreview.vue`
`apps/admin/src/components/OnboardingPreview.vue`

Menampilkan data hasil parsing dalam 5 tab (Siswa, Kelas, Mata Pelajaran, Guru & Staff, SPP). Setiap tab menampilkan summary count di header tab. Baris invalid di-highlight dengan `bg-red-50 border-l-4 border-red-400` dan kolom error inline. Tabel dibatasi 100 baris dengan note.

Props:
```typescript
defineProps<{
  data: ParsedOnboardingData
  errors: string[]
  warnings: string[]
}>()

defineEmits<{ gantiFile: [] }>()
```

#### Perubahan `TenantManagementView.vue`
- Modal diubah dari `size="lg"` → `size="xl"`
- Content modal didriven oleh `currentStep` dari `useOnboardingForm`
- Download link template ditampilkan di semua step

### Backend DTOs

#### `CreateOnboardingKelasDto`
```typescript
class CreateOnboardingKelasDto {
  @IsString() @IsNotEmpty() nama: string
  @IsInt() @Min(1) @Max(12) tingkat: number
}
```

#### `CreateOnboardingMataPelajaranDto`
```typescript
class CreateOnboardingMataPelajaranDto {
  @IsString() @IsNotEmpty() @MaxLength(100) nama: string
  @IsOptional() @IsString() @MaxLength(20) kode?: string
}
```

#### `CreateOnboardingSiswaDto`
```typescript
class CreateOnboardingSiswaDto {
  @IsString() @IsNotEmpty() @MaxLength(255) nama: string
  @IsOptional() @IsString() @MaxLength(20) nisn?: string
  @IsOptional() @IsString() kelasNama?: string   // resolved to kelas_id at insert time
  @IsOptional() @IsIn(['L', 'P']) jenisKelamin?: 'L' | 'P'
  @IsOptional() @IsDateString() tanggalLahir?: string
  @IsOptional() @IsString() alamat?: string
  @IsOptional() @IsString() namaWali?: string
  @IsOptional() @IsString() teleponWali?: string
}
```

#### `CreateOnboardingGuruStaffDto`
```typescript
class CreateOnboardingGuruStaffDto {
  @IsString() @IsNotEmpty() @MaxLength(255) nama: string
  @IsEmail() @MaxLength(255) email: string
  @IsOptional() @IsString() @MaxLength(20) telepon?: string
  @IsIn(['admin', 'guru', 'kepala_sekolah', 'bendahara']) role: string
}
```

#### `CreateOnboardingSppDto`
```typescript
class CreateOnboardingSppDto {
  @IsInt() @Min(1) @Max(12) tingkat: number
  @IsInt() @Min(1) nominal: number
}
```

#### `CreateTenantDto` (extended)
```typescript
// Existing fields tetap unchanged
class CreateTenantDto {
  // ... semua field existing ...

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @ArrayMaxSize(500) @Type(() => CreateOnboardingKelasDto)
  kelas?: CreateOnboardingKelasDto[]

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @ArrayMaxSize(500) @Type(() => CreateOnboardingMataPelajaranDto)
  mata_pelajaran?: CreateOnboardingMataPelajaranDto[]

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @ArrayMaxSize(500) @Type(() => CreateOnboardingSiswaDto)
  siswa?: CreateOnboardingSiswaDto[]

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @ArrayMaxSize(500) @Type(() => CreateOnboardingGuruStaffDto)
  guru_staff?: CreateOnboardingGuruStaffDto[]

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @ArrayMaxSize(13) @Type(() => CreateOnboardingSppDto)
  spp_bulanan?: CreateOnboardingSppDto[]
}
```

### Backend Service Interface

```typescript
interface CreateTenantResult {
  id: string
  tenant: { id: string; nama: string; email: string | null }
  admin: { id: string; email: string | null; nama: string }
  onboarding_summary?: {
    kelas: number
    mata_pelajaran: number
    siswa: number
    guru_staff: number
    spp_bulanan: number
  }
}
```

---

## Data Models

### Entities yang Dibuat Saat Onboarding (urutan insert dalam transaction)

```
1. tenant
2. tahun_ajaran          (1 record — Tahun_Ajaran_Default)
3. kelas                 (N records, ref tahun_ajaran_id)
4. mata_pelajaran        (N records)
5. user (admin)          (1 record, role='admin', must_change_password=true)
5. user (guru_staff)     (N records, must_change_password=true)
6. siswa                 (N records, kelas_id nullable via nama-lookup)
7. konfigurasi_sekolah   (N records, key=spp_nominal_tingkat_{tingkat})
```

### Tahun_Ajaran_Default Formula

```
Timezone: UTC+7 (Asia/Jakarta)
nama:           "YYYY/YYYY+1"  (berdasarkan tahun kalender saat proses berjalan)
tanggal_mulai:  YYYY-07-01
tanggal_selesai: (YYYY+1)-06-30
status:         'disiapkan'
```

### Kelas Tingkat Resolution

Sheet "Kelas" memiliki format kolom `tingkat_N` dimana N adalah integer 1–12. Setiap cell di bawah header berisi satu nama kelas untuk tingkat tersebut. Kolom tidak matching pola ini diabaikan.

Contoh:
```
| tingkat_1 | tingkat_2 | tingkat_3 | keterangan |
| 1A        | 2A        | 3A        | (diabaikan)|
| 1B        | 2B        |           |
```

### Siswa → Kelas Resolution

Pada saat insert siswa, field `kelasNama` di-lookup terhadap map `{ nama_kelas → kelas_id }` yang dibangun dari kelas yang baru dibuat di step 3. Jika tidak ditemukan, `kelas_id = NULL` (siswa tetap dibuat, tidak menyebabkan rollback).

### SPP Key Format

```
konfigurasi_sekolah.key = "spp_nominal_tingkat_{tingkat}"
konfigurasi_sekolah.value = <number>   (JSON number, bukan string)
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Extension validation rejects non-Excel filenames

*For any* filename string that does not end with `.xlsx` or `.xls` (case-insensitive), the file extension validator SHALL return an error and reject the file.

**Validates: Requirements 1.2**

---

### Property 2: File size validation rejects oversized files

*For any* file size value strictly greater than 10,485,760 bytes (10MB), the size validator SHALL return the maximum-size error message and reject the file.

**Validates: Requirements 1.3**

---

### Property 3: Submit disabled when parsing not succeeded

*For any* form state where `parseResult` is null or `parseResult.isValid` is false, the submit button SHALL have `disabled = true`.

**Validates: Requirements 1.5**

---

### Property 4: Missing sheet detection lists exactly the absent sheets

*For any* subset S of the 5 required sheet names that is absent from the workbook, the `Excel_Parser` SHALL return an error listing exactly the sheets in S — no more, no fewer.

**Validates: Requirements 2.2**

---

### Property 5: Invalid guru_staff roles are marked and all valid rows pass through

*For any* list of `Sheet_GuruStaff` rows where each row has a `role` field, all rows whose `role` is not in `['admin', 'guru', 'kepala_sekolah', 'bendahara']` SHALL be marked invalid, and all rows with a valid role SHALL NOT be marked invalid solely due to the role field.

**Validates: Requirements 2.8**

---

### Property 6: Invalid email format marks the row invalid

*For any* email string that does not contain an `@` symbol followed by at least one `.` character, the corresponding `Sheet_GuruStaff` row SHALL be marked invalid.

**Validates: Requirements 2.9**

---

### Property 7: Invalid SPP nominal marks the row invalid

*For any* `Sheet_SPP` row where `nominal` is non-numeric or less than or equal to zero after parsing, the row SHALL be marked invalid.

**Validates: Requirements 2.10**

---

### Property 8: String values are trimmed before validation

*For any* string cell value with arbitrary leading and/or trailing whitespace, the parsed result SHALL equal the trimmed version of that string (i.e., `parsed === raw.trim()`).

**Validates: Requirements 2.12**

---

### Property 9: Preview summary counts match actual parsed array lengths

*For any* `ParsedOnboardingData` object with arrays of sizes N₁...N₅, the `OnboardingPreview` component SHALL display summary counts equal to the respective array lengths — regardless of how many rows are invalid.

**Validates: Requirements 3.2**

---

### Property 10: Row display is capped at 100 with overflow note

*For any* sheet with N parsed rows: if N ≤ 100, exactly N rows are displayed and no overflow note appears; if N > 100, exactly 100 rows are displayed and a note indicating the total count N is shown.

**Validates: Requirements 3.3, 3.5, 3.6, 3.7**

---

### Property 11: Invalid rows are rendered with distinct styling

*For any* set of rows where an arbitrary non-empty subset is marked invalid, the `OnboardingPreview` component SHALL render those invalid rows with a visually distinct CSS class compared to valid rows, and SHALL render a reason column for each invalid row.

**Validates: Requirements 3.8**

---

### Property 12: Submission payload contains only valid rows

*For any* `ParsedOnboardingData` with arbitrary combinations of valid and invalid rows across all sheets, the HTTP request payload sent on submit SHALL contain only the rows where `isValid !== false` — no invalid rows SHALL be included.

**Validates: Requirements 4.7**

---

### Property 13: Backend rejects arrays exceeding size limits

*For any* request where `guru_staff`, `kelas`, `mata_pelajaran`, or `siswa` arrays have more than 500 entries, or `spp_bulanan` has more than 13 entries, the backend SHALL return a 400 validation error.

**Validates: Requirements 5.1**

---

### Property 14: Backend rejects guru_staff with invalid role and names all bad values

*For any* `guru_staff` array containing entries with `role` values outside `['admin', 'guru', 'kepala_sekolah', 'bendahara']`, the backend SHALL reject with a 400 error that explicitly identifies each invalid role value.

**Validates: Requirements 5.2**

---

### Property 15: Backend detects all duplicate emails within the request

*For any* `guru_staff` array containing duplicate `email` values, the backend SHALL reject the request with a 400 error that lists all duplicate email values — not just the first pair found.

**Validates: Requirements 5.3**

---

### Property 16: Backend detects all conflicting emails against existing users

*For any* `guru_staff` array where one or more emails already exist in the `user` table, the backend SHALL reject the request and list all conflicting email values.

**Validates: Requirements 5.4**

---

### Property 17: SPP validation enforces tingkat bounds and positive nominal

*For any* `spp_bulanan` entry where `tingkat > jumlah_tingkat` OR `nominal < 1`, the backend SHALL reject the request with a descriptive 400 error identifying which constraint was violated.

**Validates: Requirements 5.5**

---

### Property 18: guru_staff entries missing required fields fail validation

*For any* `guru_staff` entry missing any subset of `{nama, email, role}`, the backend SHALL return a validation error identifying the missing fields.

**Validates: Requirements 5.7**

---

### Property 19: Backend detects all duplicate NISNs in siswa array

*For any* `siswa` array containing duplicate non-null `nisn` values, the backend SHALL reject the request with a 400 error listing all duplicate NISN values.

**Validates: Requirements 5.8**

---

### Property 20: Transaction atomicity — any failure causes full rollback

*For any* failure injected at any step of the onboarding transaction (steps 1–7), the database SHALL contain no rows from any of the affected tables (`tenant`, `tahun_ajaran`, `kelas`, `mata_pelajaran`, `user`, `siswa`, `konfigurasi_sekolah`) that were part of that attempted onboarding.

**Validates: Requirements 6.1, 6.6**

---

### Property 21: Tahun_Ajaran_Default formula is correct for any execution date

*For any* datetime in timezone UTC+7 with calendar year Y, the created `tahun_ajaran` record SHALL have: `nama = "Y/Y+1"`, `tanggal_mulai = Y-07-01`, `tanggal_selesai = (Y+1)-06-30`, `status = 'disiapkan'`.

**Validates: Requirements 6.2**

---

### Property 22: tingkat_N column pattern correctly extracts tingkat values

*For any* set of column names in `Sheet_Kelas`, only columns matching the regex `/^tingkat_(\d+)$/` (where the captured integer N is between 1 and 12) SHALL produce kelas records, and those records SHALL have `tingkat = N`; non-matching columns SHALL produce no kelas records.

**Validates: Requirements 6.3**

---

### Property 23: Unmatched kelas name sets kelas_id to NULL without rollback

*For any* siswa row whose `kelasNama` does not match any kelas name created in the current transaction, the siswa SHALL be inserted with `kelas_id = NULL` and the transaction SHALL continue.

**Validates: Requirements 6.4**

---

### Property 24: SPP keys follow the exact naming formula

*For any* `spp_bulanan` entry with `tingkat = T` and `nominal = N`, the stored `konfigurasi_sekolah` record SHALL have `key = "spp_nominal_tingkat_T"` and `value = N` (as a JSON number).

**Validates: Requirements 6.5**

---

### Property 25: Each guru_staff user gets an independent password satisfying complexity

*For any* list of guru_staff users of length N ≥ 1, the N generated passwords SHALL each be exactly 12 characters long, contain at least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 character from `!@#$%&*`, and all N passwords SHALL be pairwise distinct.

**Validates: Requirements 6.7**

---

### Property 26: Total email jobs enqueued equals guru_staff count plus one admin

*For any* onboarding request with G valid `guru_staff` entries, the `emailQueue` SHALL receive exactly G + 1 `add` calls after transaction commit — one per guru_staff user and one for the default admin.

**Validates: Requirements 7.1, 7.3**

---

### Property 27: Every email job payload contains all required fields

*For any* email job enqueued during onboarding, the job payload SHALL contain non-null values for `to`, `tenantName`, `adminName`, `email`, and `password`.

**Validates: Requirements 7.2**

---

### Property 28: tanggal_lahir is always a valid ISO YYYY-MM-DD or null

*For any* cell value in the `tanggal_lahir` column of `Sheet_Siswa` — whether a date string, an Excel serial number, or an unparseable value — the `Excel_Parser` SHALL produce either a valid ISO date string in `YYYY-MM-DD` format or `null`; it SHALL never produce a malformed string.

**Validates: Requirements 8.1, 8.4, 8.5**

---

### Property 29: nominal stripping always produces a positive integer or null

*For any* string value in the `nominal` column of `Sheet_SPP`, stripping all non-digit characters and converting to integer SHALL produce either a positive integer (> 0) or `null` — never a negative number, zero, or a non-integer float.

**Validates: Requirements 8.2, 8.6**

---

### Property 30: tingkat from Sheet_SPP parses to a positive integer or null

*For any* cell value in the `tingkat` column of `Sheet_SPP`, the `Excel_Parser` SHALL produce either a positive integer (≥ 1) or `null`; non-integer and non-positive values SHALL always produce `null`.

**Validates: Requirements 8.3, 8.7**

---

### Property 31: Partial onboarding arrays are processed independently

*For any* subset of the 5 onboarding arrays present in the request (including the empty subset), the backend SHALL process exactly the arrays that are present, treating absent arrays as empty, and SHALL successfully create at minimum 1 tenant and 1 admin user.

**Validates: Requirements 9.3**

---

### Property 32: Response structure is invariant across all request variants

*For any* valid `POST /tenants` request (with or without onboarding data), the response SHALL always include `id`, `tenant` (with `id`, `nama`, `email`), and `admin` (with `id`, `email`, `nama`); when onboarding data was provided and processed, the response SHALL additionally include `onboarding_summary` with count fields for each entity type.

**Validates: Requirements 9.4**

---

## Error Handling

### Frontend Error Categories

| Kategori | Sumber | Penanganan |
|----------|--------|------------|
| Invalid file extension | File picker | Inline error, reset input |
| File too large | File picker | Inline error, reset input |
| Missing required sheets | SheetJS parsing | Fatal error, halt parsing, disable submit |
| Corrupt file | SheetJS exception | Inline error "File Excel tidak dapat dibaca...", reset input |
| Invalid rows (role, email, nominal) | Per-row validation | Non-fatal warning, row marked invalid, submit still enabled |
| No valid staff emails | Post-parse check | Non-blocking warning banner in preview |
| Network error on submit | Axios | Toast: "Gagal terhubung ke server. Periksa koneksi internet dan coba lagi" |
| Server error on submit | API response | Display `error.response.data.message`, re-enable form |

**Error state reset:** Setiap kali user memilih file baru (termasuk via "Ganti File"), semua error state dari parsing sebelumnya di-clear terlebih dahulu sebelum parsing baru dimulai.

### Backend Error Categories

| Kondisi | HTTP Status | Response |
|---------|-------------|----------|
| Validasi DTO gagal (class-validator) | 400 | Array of validation messages |
| Duplicate email dalam request | 400 | "Email duplikat ditemukan: [list]" |
| Email guru_staff sudah ada di DB | 400 | "Email sudah digunakan: [list]" |
| NISN duplikat dalam request | 400 | "NISN duplikat ditemukan: [list]" |
| Role tidak valid | 400 | "Role tidak valid: [value] di row N" |
| SPP tingkat melebihi jumlah_tingkat | 400 | "Tingkat SPP melebihi jumlah tingkat sekolah" |
| Transaction gagal | 500 | "Gagal menyimpan data. Tidak ada data yang tersimpan." |
| Email enqueue gagal | — | Log + lanjut (tidak gagalkan onboarding) |

**Custom validator:** Cross-field validations (duplicate check, tingkat check) diimplementasikan sebagai custom class-validator decorator atau dilakukan di service layer sebelum memasuki transaction, bukan di dalam transaction.

---

## Testing Strategy

### Library
- **Frontend (Vitest + fast-check):** Vitest 2 sudah ada sebagai dev dependency di `apps/admin`. fast-check 3 juga sudah tersedia. Gunakan `@vue/test-utils` untuk component tests.
- **Backend (Jest + fast-check):** Jest 29 + fast-check 3 sudah ada di `apps/api`. Property tests masuk ke `test:unit` project.

### Dependency Baru
`xlsx` (SheetJS) perlu ditambahkan ke `apps/admin` dependencies:
```bash
pnpm --filter @edu/admin add xlsx
pnpm --filter @edu/admin add -D @types/xlsx  # jika tersedia, atau gunakan built-in types
```

### Dual Testing Approach

**Unit tests** (example-based) untuk:
- Column mapping per sheet (fixture data → expected output structure)
- Step transitions di `useOnboardingForm`
- Payload shape pada submit
- Backward compat: POST tanpa onboarding arrays
- Admin user dibuat dengan `role='admin'` dan `must_change_password=true`

**Property tests** (fast-check) untuk semua 32 properti di atas. Setiap property test dijalankan minimum 100 iterasi.

Tag format: `// Feature: tenant-excel-onboarding, Property {N}: {property text}`

### Contoh Property Test — Frontend (Vitest)

```typescript
// Feature: tenant-excel-onboarding, Property 1: Extension validation rejects non-Excel filenames
it('rejects filenames not ending with .xlsx or .xls', () => {
  fc.assert(
    fc.property(
      fc.string().filter(s => !s.toLowerCase().endsWith('.xlsx') && !s.toLowerCase().endsWith('.xls')),
      (filename) => {
        const result = validateFileExtension(filename)
        expect(result.isValid).toBe(false)
        expect(result.error).toContain('Format file tidak valid')
      }
    ),
    { numRuns: 100 }
  )
})
```

### Contoh Property Test — Backend (Jest)

```typescript
// Feature: tenant-excel-onboarding, Property 25: Each guru_staff user gets independent password
it('generates distinct passwords satisfying complexity for all guru_staff', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ nama: fc.string({ minLength: 1 }), email: fc.emailAddress(), role: fc.constantFrom('guru', 'admin') }), { minLength: 1, maxLength: 20 }),
      (guruStaffList) => {
        const passwords = guruStaffList.map(() => service['generateRandomPassword']())
        expect(new Set(passwords).size).toBe(passwords.length)
        passwords.forEach(pw => {
          expect(pw).toHaveLength(12)
          expect(/[A-Z]/.test(pw)).toBe(true)
          expect(/[a-z]/.test(pw)).toBe(true)
          expect(/\d/.test(pw)).toBe(true)
          expect(/[!@#$%&*]/.test(pw)).toBe(true)
        })
      }
    ),
    { numRuns: 200 }
  )
})
```

### Integration Tests

- Onboarding end-to-end dengan real DB (test:contract:real): satu test dengan fixture Excel data lengkap, assert semua entitas terbuat.
- Transaction rollback: mock satu DB call gagal, assert tidak ada row yang ter-insert.
- Email queue enqueue: mock Bull queue, assert job count dan payload structure.
