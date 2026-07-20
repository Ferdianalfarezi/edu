# Implementation Plan: Hari Kerja Sekolah

## Overview

Add a `hari_kerja` tenant-level setting (`5_hari` / `6_hari`) that controls schedule day validation, attendance calculations, and Saturday visibility across JadwalModule and AbsensiModule. Follows the same pattern as `jumlah_tingkat` — column on tenant table, exposed via TenantService helper, consumed by downstream modules via dependency injection.

## Tasks

- [x] 1. Schema and Migration
  - [x] 1.1 Add `hari_kerja` column and CHECK constraint to the tenant schema
    - Add `hariKerja: varchar('hari_kerja', { length: 10 }).notNull().default('6_hari')` to `apps/api/src/drizzle/schema/tenant.ts`
    - Add CHECK constraint `chk_hari_kerja` in the table config: `sql\`${table.hariKerja} IN ('5_hari', '6_hari')\``
    - Run `pnpm --filter @edu/api db:generate` to create the migration file
    - _Requirements: 1.1, 1.2_

- [x] 2. Checkpoint — Verify migration generates cleanly
  - Ensure migration SQL is correct, ask the user if questions arise.

- [x] 3. Backend — DTOs and TenantService
  - [x] 3.1 Add `hari_kerja` field to `CreateTenantDto`
    - In `apps/api/src/modules/tenant/dto/create-tenant.dto.ts`, add optional `hari_kerja` field
    - Use `@IsOptional()` and `@IsIn(['5_hari', '6_hari'])` with message `'hari_kerja harus bernilai 5_hari atau 6_hari'`
    - _Requirements: 1.3, 1.4_

  - [x] 3.2 Create `UpdateHariKerjaDto`
    - Create new file `apps/api/src/modules/tenant/dto/update-hari-kerja.dto.ts`
    - Class with `hari_kerja: '5_hari' | '6_hari'` field, decorated with `@IsNotEmpty()` and `@IsIn(['5_hari', '6_hari'])`
    - _Requirements: 3.4, 3.5_

  - [x] 3.3 Implement `getHariKerja()` and `updateHariKerja()` in TenantService
    - Add `getHariKerja(tenantId: string): Promise<'5_hari' | '6_hari'>` — select hariKerja from tenant, throw NotFoundException if not found
    - Add `updateHariKerja(tenantId: string, hariKerja: '5_hari' | '6_hari'): Promise<{ message: string }>` — verify tenant exists, update column + updatedAt, return success message
    - _Requirements: 1.1, 3.2, 3.4_

  - [x] 3.4 Modify `createTenant()` to include `hari_kerja` in INSERT
    - In the existing `createTenant()` method, add `hariKerja: dto.hari_kerja ?? '6_hari'` to the insert values
    - _Requirements: 1.2, 1.3_

  - [x] 3.5 Modify `getTenantProfile()` and `listTenants()` to include `hari_kerja` in response
    - Add `hariKerja` to the select fields in `getTenantProfile()` and map to `hari_kerja` in the response object
    - Add `hariKerja` to the select/mapping in `listTenants()` / `listTenantsPaginated()`
    - _Requirements: 6.1, 6.2_

  - [x] 3.6 Add PATCH endpoint to TenantController
    - Add `@Patch('hari-kerja')` endpoint with `@Roles(Role.ADMIN, Role.SUPER_ADMIN)` and `@HttpCode(HttpStatus.OK)`
    - Use `@TenantId()` decorator to get tenant from JWT, accept `UpdateHariKerjaDto` body
    - Delegate to `tenantService.updateHariKerja()`
    - _Requirements: 3.4, 3.5_

- [x] 4. Checkpoint — Verify backend API compiles
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Backend — JadwalService Integration
  - [x] 5.1 Import TenantModule into JadwalModule and inject TenantService
    - In `apps/api/src/modules/jadwal/jadwal.module.ts`, add `TenantModule` to imports
    - In `apps/api/src/modules/jadwal/jadwal.service.ts`, inject `TenantService` via constructor
    - _Requirements: 4.1_

  - [x] 5.2 Add `validateHariKerja()` private method and call it in `create()` / `update()`
    - Implement private method that checks if a given day is within the tenant's allowed days
    - Throw `BadRequestException` with message `Hari {NamaHari} bukan hari aktif untuk sekolah ini` if day is outside allowed set
    - Call this validation before existing logic in create and update methods
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.3 Filter Saturday jadwal from `findAll()` when tenant is `5_hari`
    - In the `findAll()` method, fetch `hariKerja` via `tenantService.getHariKerja()`
    - If `5_hari`, add condition `jadwalPelajaran.hari != 'sabtu'` to the query
    - _Requirements: 4.4, 4.5_

- [x] 6. Backend — AbsensiService Integration
  - [x] 6.1 Import TenantModule into AbsensiModule and inject TenantService
    - In `apps/api/src/modules/absensi/absensi.module.ts`, add `TenantModule` to imports
    - In `apps/api/src/modules/absensi/absensi.service.ts`, inject `TenantService` via constructor
    - _Requirements: 5.1_

  - [x] 6.2 Modify hari efektif calculation to respect `hari_kerja`
    - Refactor `countWeekdays()` (or equivalent) to `countSchoolDays(start, end, hariKerja)` — count days 1–5 for `5_hari`, 1–6 for `6_hari`
    - Update `calculateHariEfektifForMonth()` to fetch `hariKerja` and pass it to the count function
    - _Requirements: 5.1, 5.2_

  - [x] 6.3 Filter `getKelasHariIni()` and reject Saturday attendance submissions
    - In `getKelasHariIni()`: if `5_hari` and today is Saturday, return empty list
    - In `createAbsensi()`: if `5_hari` and submitted date is Saturday, throw BadRequestException with message `Hari Sabtu bukan hari aktif untuk sekolah ini`
    - _Requirements: 5.3_

  - [x] 6.4 Exclude Saturday records from rekap calculations when `5_hari`
    - In attendance recap/percentage methods, filter out Saturday records when tenant hari_kerja is `5_hari`
    - Existing Saturday records remain in DB but are excluded from aggregation queries
    - _Requirements: 5.4, 5.5_

- [x] 7. Checkpoint — Verify all backend modules compile and integrate
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Frontend — TenantManagementView
  - [x] 8.1 Add `hari_kerja` select field to the tenant creation form
    - Add select input after `jumlah_tingkat` with two options: "6 Hari (Senin-Sabtu)" → `6_hari`, "5 Hari (Senin-Jumat)" → `5_hari`
    - Default selection: `6_hari`
    - Only show in creation mode (not edit)
    - Include `hari_kerja` in the POST payload
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 8.2 Add "Hari Kerja" column to the tenant list table
    - Add column header between existing columns
    - Display "5 Hari" or "6 Hari" based on `hari_kerja` value, default label "6 Hari" if missing
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 9. Frontend — KonfigurasiView
  - [x] 9.1 Add "Hari Kerja Sekolah" section with radio buttons and save functionality
    - Add new section above "Pengaturan Umum" in KonfigurasiView
    - Two radio buttons: "5 Hari (Senin-Jumat)" and "6 Hari (Senin-Sabtu)"
    - Load current value from tenant profile on mount
    - "Simpan Hari Kerja" button triggers confirmation dialog: "Perubahan ini akan mempengaruhi jadwal dan perhitungan absensi"
    - On confirm, PATCH `/tenants/hari-kerja` with selected value
    - Show success/error toast after save
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 10. Checkpoint — Verify frontend compiles
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Property-Based Tests
  - [x] 11.1 Write property test for hari_kerja validation
    - **Property 1: Hari kerja validation accepts only valid values**
    - **Validates: Requirements 1.1, 1.4, 3.5**
    - File: `apps/api/src/modules/tenant/__tests__/hariKerjaValidation.property.test.ts`
    - Use fast-check to generate arbitrary strings; verify only `'5_hari'` and `'6_hari'` pass the IsIn validator

  - [x] 11.2 Write property test for role authorization
    - **Property 2: Role authorization for hari_kerja update**
    - **Validates: Requirements 3.4**
    - File: `apps/api/src/modules/tenant/__tests__/hariKerjaRoleAuth.property.test.ts`
    - Use fast-check to generate from Role enum; verify only `admin` and `super_admin` are authorized

  - [x] 11.3 Write property test for jadwal day validation
    - **Property 3: Jadwal day validation respects hari_kerja setting**
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - File: `apps/api/src/modules/jadwal/__tests__/hariKerjaJadwalValidation.property.test.ts`
    - Use fast-check to generate `(hariKerja, day)` tuples; verify allowed-set membership matches expected

  - [x] 11.4 Write property test for Saturday schedule visibility round-trip
    - **Property 4: Saturday schedule visibility round-trip**
    - **Validates: Requirements 4.4, 4.5**
    - File: `apps/api/src/modules/jadwal/__tests__/hariKerjaVisibilityRoundTrip.property.test.ts`
    - Use fast-check to generate jadwal sets with Saturday entries; verify toggling 6→5→6 restores original visibility

  - [x] 11.5 Write property test for hari efektif metamorphic property
    - **Property 5: Hari efektif metamorphic — 5_hari always ≤ 6_hari**
    - **Validates: Requirements 5.1, 5.2**
    - File: `apps/api/src/modules/absensi/__tests__/hariKerjaEfektif.property.test.ts`
    - Use fast-check to generate month/year; verify `countSchoolDays(5_hari) <= countSchoolDays(6_hari)`

  - [x] 11.6 Write property test for Saturday attendance rejection
    - **Property 6: Saturday attendance rejection for 5_hari tenants**
    - **Validates: Requirements 5.3**
    - File: `apps/api/src/modules/absensi/__tests__/hariKerjaSaturdayRejection.property.test.ts`
    - Use fast-check to generate Saturday dates; verify attendance submission is rejected and kelas-hari-ini returns empty

  - [x] 11.7 Write property test for Saturday records exclusion from calculations
    - **Property 7: Saturday attendance records excluded from calculations after switch**
    - **Validates: Requirements 5.5**
    - File: `apps/api/src/modules/absensi/__tests__/hariKerjaSaturdayExclusion.property.test.ts`
    - Use fast-check to generate attendance records including Saturdays; verify exclusion from rekap after switch to `5_hari`

- [x] 12. Final Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- JadwalModule and AbsensiModule both need TenantModule imported (neither currently has it)
- The TenantModule already exports TenantService, so no changes needed there
- Pattern follows `jumlah_tingkat` implementation for consistency
- Migration command: `pnpm --filter @edu/api db:generate`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["3.1", "3.2"] },
    { "id": 2, "tasks": ["3.3", "3.4"] },
    { "id": 3, "tasks": ["3.5", "3.6"] },
    { "id": 4, "tasks": ["5.1", "6.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.2", "6.3"] },
    { "id": 6, "tasks": ["6.4"] },
    { "id": 7, "tasks": ["8.1", "8.2", "9.1"] },
    { "id": 8, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7"] }
  ]
}
```
