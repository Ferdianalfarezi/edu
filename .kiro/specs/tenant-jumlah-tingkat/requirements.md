# Requirements Document

## Introduction

Setiap tenant (sekolah) memiliki jumlah tingkat kelas yang tetap (`jumlah_tingkat`) yang ditentukan saat pembuatan tenant oleh super admin. Field ini bersifat immutable setelah tenant dibuat dan menjadi acuan struktural untuk menentukan tingkat tertinggi (kelulusan), validasi pembuatan kelas, dan konfigurasi SPP per tingkat.

Contoh: SD memiliki 6 tingkat, SMP memiliki 3 tingkat, SMA memiliki 3 tingkat.

## Glossary

- **Tenant**: Entitas sekolah dalam sistem multi-tenant. Setiap sekolah adalah satu tenant.
- **Jumlah_Tingkat**: Kolom integer pada tabel `tenant` yang menyimpan jumlah level kelas yang dimiliki sekolah (misal: 3 untuk SMP, 6 untuk SD).
- **Tingkat**: Nilai integer pada kelas yang merepresentasikan level/grade (1, 2, 3, dst).
- **Kelas**: Grup siswa dalam satu tahun ajaran dengan tingkat tertentu (misal: "1A" di tingkat 1).
- **Kenaikan_Kelas_Service**: Service yang menangani logika promosi/kelulusan siswa antar tingkat.
- **Konfigurasi_SPP**: Pengaturan nominal pembayaran SPP per tingkat kelas dalam satu tenant.
- **Super_Admin**: Pengguna dengan akses lintas tenant yang mengelola pembuatan dan konfigurasi tenant.
- **Admin**: Pengguna level sekolah yang mengelola konfigurasi internal tenant-nya sendiri.
- **Is_Highest_Grade**: Flag boolean yang menandakan apakah siswa di kelas tersebut berada di tingkat tertinggi dan akan lulus (bukan naik kelas).

## Requirements

### Requirement 1: Penyimpanan Jumlah Tingkat pada Tenant

**User Story:** As a super admin, I want each tenant to have a fixed jumlah_tingkat value, so that the system can enforce grade-level constraints consistently for each school.

#### Acceptance Criteria

1. THE Tenant table SHALL store a `jumlah_tingkat` column as a non-nullable integer with a minimum value of 1 and a maximum value of 13
2. THE Tenant table SHALL enforce the `jumlah_tingkat` constraint at the database level using a CHECK constraint (value BETWEEN 1 AND 13)
3. WHEN a tenant is created, THE System SHALL persist the `jumlah_tingkat` value provided by the Super_Admin
4. WHILE a tenant exists, THE System SHALL reject any request to modify the `jumlah_tingkat` value by returning an error response indicating that `jumlah_tingkat` is immutable after tenant creation, without altering the stored value

### Requirement 2: Pembuatan Tenant dengan Jumlah Tingkat

**User Story:** As a super admin, I want to specify jumlah_tingkat when creating a new tenant, so that the school's grade structure is defined from the start.

#### Acceptance Criteria

1. WHEN a super admin submits a create tenant request with a valid `jumlah_tingkat` integer between 1 and 13, THE Create_Tenant endpoint SHALL create the tenant and persist the provided `jumlah_tingkat` value
2. IF `jumlah_tingkat` is not provided in the create request, THEN THE System SHALL reject the request with a validation error indicating that `jumlah_tingkat` is required
3. IF `jumlah_tingkat` is provided with a value less than 1 or greater than 13, THEN THE System SHALL reject the request with a validation error indicating the allowed range (1–13)
4. IF `jumlah_tingkat` is provided with a non-integer value, THEN THE System SHALL reject the request with a validation error indicating that the value must be a positive integer
5. THE Create_Tenant endpoint SHALL accept `jumlah_tingkat` as a mandatory integer field alongside the existing tenant fields (`nama`, `email`, `admin_nama`, `admin_email`)

### Requirement 3: Immutabilitas Jumlah Tingkat

**User Story:** As a system operator, I want jumlah_tingkat to be immutable after creation, so that structural assumptions in kelas, SPP, and kenaikan kelas are never invalidated by a change.

#### Acceptance Criteria

1. WHEN an update request includes `jumlah_tingkat` alongside other editable fields, THE Update_Tenant endpoint SHALL silently discard the `jumlah_tingkat` field, persist the other valid fields, and return a success response
2. THE Update_Tenant endpoint SHALL NOT expose `jumlah_tingkat` as an accepted field in the update DTO, ensuring the field is stripped before validation
3. WHEN a tenant is listed or retrieved, THE System SHALL include `jumlah_tingkat` as an integer field in the response payload
4. IF a client sends a PATCH request containing only `jumlah_tingkat` with no other editable fields, THEN THE Update_Tenant endpoint SHALL return a success response without modifying any tenant data

### Requirement 4: Validasi Tingkat pada Pembuatan Kelas

**User Story:** As an admin, I want the system to prevent creating a kelas with a tingkat exceeding jumlah_tingkat, so that only valid grade levels exist for my school.

#### Acceptance Criteria

1. WHEN an admin creates a kelas with `tingkat` greater than the tenant's `jumlah_tingkat`, THE Kelas_Service SHALL reject the request with an error message indicating that the provided tingkat exceeds the maximum allowed value of `jumlah_tingkat` for the tenant
2. WHEN an admin creates a kelas with `tingkat` equal to or less than the tenant's `jumlah_tingkat` and greater than or equal to 1, THE Kelas_Service SHALL allow the creation
3. IF an admin creates a kelas with `tingkat` less than 1, THEN THE Kelas_Service SHALL reject the request with a validation error indicating that tingkat must be at least 1
4. WHEN an admin updates an existing kelas with a new `tingkat` value greater than the tenant's `jumlah_tingkat`, THE Kelas_Service SHALL reject the update request with an error message indicating that the provided tingkat exceeds the maximum allowed value of `jumlah_tingkat` for the tenant

### Requirement 5: Logika Kelulusan Berdasarkan Jumlah Tingkat

**User Story:** As an admin performing kenaikan kelas, I want is_highest_grade to be determined by comparing a student's tingkat to the tenant's jumlah_tingkat, so that graduation logic is consistent regardless of whether a target class exists.

#### Acceptance Criteria

1. WHEN previewing a promotion, THE Kenaikan_Kelas_Service SHALL determine `is_highest_grade` by evaluating whether `source_kelas.tingkat >= tenant.jumlah_tingkat`
2. WHEN `is_highest_grade` is true, THE Kenaikan_Kelas_Service SHALL return `is_highest_grade: true` and `target_kelas: null` in the preview response, indicating that students will graduate rather than be promoted
3. WHEN `is_highest_grade` is false, THE Kenaikan_Kelas_Service SHALL search for a target kelas at `tingkat + 1` in the target tahun ajaran and return it in `target_kelas` if found
4. WHEN `is_highest_grade` is false but no target kelas exists at `tingkat + 1`, THE Kenaikan_Kelas_Service SHALL return `is_highest_grade: false` and `target_kelas: null`, indicating promotion is expected but no target class has been created yet
5. THE Kenaikan_Kelas_Service SHALL fetch `jumlah_tingkat` from the tenant record and use it as the single source of truth for highest grade determination

### Requirement 6: Konfigurasi SPP Mengikuti Jumlah Tingkat

**User Story:** As an admin, I want the SPP configuration page to show exactly the number of tingkat inputs matching my school's jumlah_tingkat, so that I only configure SPP for valid grade levels.

#### Acceptance Criteria

1. WHEN the konfigurasi page loads, THE Admin_Panel SHALL fetch the tenant's `jumlah_tingkat` value from the tenant profile or a dedicated endpoint
2. THE Admin_Panel SHALL render exactly `jumlah_tingkat` input fields for nominal SPP, labeled "Tingkat 1" through "Tingkat N" where N equals `jumlah_tingkat`
3. THE Admin_Panel SHALL NOT render any add or remove buttons for SPP entries; the number of fields is fixed based on `jumlah_tingkat`
4. WHEN saving SPP configuration, THE API SHALL validate that the submitted SPP object contains exactly `jumlah_tingkat` entries (keys `tingkat_1` through `tingkat_N`) and reject the request if any entry is missing or if extra entries beyond `jumlah_tingkat` are included
5. WHEN saving SPP configuration, THE API SHALL validate that each nominal value is a non-negative integer

### Requirement 7: Migrasi Data Existing Tenant

**User Story:** As a developer, I want existing tenants to receive a jumlah_tingkat value during migration, so that the system operates correctly without requiring manual intervention.

#### Acceptance Criteria

1. WHEN the database migration runs, THE Migration SHALL add `jumlah_tingkat` column to the tenant table as a non-nullable integer with a default value of 6 (SD assumption as a safe default for existing data)
2. THE Seed script SHALL set `jumlah_tingkat` to 3 for the "Sekolah Contoh" tenant during tenant creation (insert statement)
3. IF an existing tenant has kelas with tingkat values exceeding the default `jumlah_tingkat`, THEN THE Migration SHALL set that tenant's `jumlah_tingkat` to the maximum tingkat found in its kelas data
4. AFTER migration completes, no tenant SHALL have a `jumlah_tingkat` value less than the maximum `tingkat` value found across all its kelas records
5. IF an existing tenant has no kelas records, THEN THE Migration SHALL retain the default value of 6 for that tenant's `jumlah_tingkat`
