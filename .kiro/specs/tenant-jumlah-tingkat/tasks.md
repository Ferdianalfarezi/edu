# Implementation Plan: Jumlah Tingkat per Tenant

## Overview

Add a structural `jumlah_tingkat` integer column to the `tenant` table, enforce it at creation (immutable), and use it to drive kelas validation, graduation logic, and SPP configuration across the API and admin panel.

## Tasks

- [x] 1. Add jumlah_tingkat column to tenant schema and generate migration
  - [x] 1.1 Update tenant schema and generate migration
    - Update `apps/api/src/drizzle/schema/tenant.ts`: add `jumlahTingkat: integer('jumlah_tingkat').notNull().default(6)` column and a CHECK constraint (`BETWEEN 1 AND 13`) using Drizzle's `check()` helper
    - Run `pnpm --filter @edu/api db:generate` to produce the Drizzle migration SQL
    - Review generated migration and manually add the UPDATE statement to adjust any existing tenant whose max kelas tingkat exceeds 6
    - Update `apps/api/src/drizzle/seed.ts`: add `jumlahTingkat: 3` to the "Sekolah Contoh" tenant insert
    - _Requirements: 1.1, 1.2, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 2. Update CreateTenantDto and TenantService.createTenant
  - [x] 2.1 Add jumlah_tingkat to CreateTenantDto and tenant creation logic
    - In `apps/api/src/modules/tenant/dto/create-tenant.dto.ts`: add `@IsInt() @IsNotEmpty() @Min(1) @Max(13) jumlah_tingkat: number` field
    - In `apps/api/src/modules/tenant/tenant.service.ts` → `createTenant()`: add `jumlahTingkat: dto.jumlah_tingkat` to the tenant insert values
    - Verify `UpdateTenantDto` does NOT include `jumlah_tingkat` (already excluded — confirm no changes needed)
    - In `listTenants()` and `listTenantsPaginated()`: add `jumlahTingkat: tenant.jumlahTingkat` to select clause so list responses include it
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3_

- [x] 3. Add TenantService.getJumlahTingkat helper and GET /tenants/profile endpoint
  - [x] 3.1 Add getJumlahTingkat helper, getTenantProfile method, and profile endpoint
    - In `apps/api/src/modules/tenant/tenant.service.ts`: add `async getJumlahTingkat(tenantId: string): Promise<number>` method
    - In `apps/api/src/modules/tenant/tenant.service.ts`: add `async getTenantProfile(tenantId: string)` method returning `{ id, nama, jumlah_tingkat }`
    - In `apps/api/src/modules/tenant/tenant.controller.ts`: add `@Get('profile')` endpoint with `@Roles(Role.ADMIN, Role.KEPALA_SEKOLAH, Role.BENDAHARA, Role.GURU)` that calls `getTenantProfile`
    - Ensure `TenantModule` exports `TenantService` so other modules can inject it
    - _Requirements: 3.3, 5.5, 6.1_

- [x] 4. Add tingkat validation to KelasService
  - [x] 4.1 Add tingkat validation against jumlah_tingkat in KelasService
    - In `apps/api/src/modules/kelas/kelas.module.ts`: import `TenantModule`
    - In `apps/api/src/modules/kelas/kelas.service.ts`: inject `TenantService` via constructor
    - In `createKelas()`: before existing validation, call `getJumlahTingkat(tenantId)` and throw `BadRequestException` if `dto.tingkat > jumlahTingkat`
    - If `updateKelas()` allows changing tingkat, add the same validation there
    - Error message: `"Tingkat ${dto.tingkat} melebihi batas maksimum (${jumlahTingkat}) untuk sekolah ini"`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Update KenaikanKelasService graduation logic
  - [x] 5.1 Replace graduation logic with jumlah_tingkat-based determination
    - In `apps/api/src/modules/kenaikan-kelas/kenaikan-kelas.module.ts`: import `TenantModule`
    - In `apps/api/src/modules/kenaikan-kelas/kenaikan-kelas.service.ts`: inject `TenantService` via constructor
    - In `previewPromotion()`: replace `is_highest_grade: !targetKelas` with `jumlahTingkat`-based logic; only search for target kelas if `!isHighestGrade`
    - In `getStudentsForPromotion()`: apply same logic for highest grade determination
    - When `isHighestGrade` is false but no target kelas exists, return `is_highest_grade: false, target_kelas: null`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. Add SPP validation in KonfigurasiService
  - [x] 6.1 Add SPP nominal validation against jumlah_tingkat
    - In `apps/api/src/modules/konfigurasi/konfigurasi.module.ts`: import `TenantModule`
    - In `apps/api/src/modules/konfigurasi/konfigurasi.service.ts`: inject `TenantService` via constructor
    - In `bulkUpsertConfig()`: when `nominal_spp` is present, validate exactly keys `tingkat_1` through `tingkat_N` (N = jumlah_tingkat), reject missing/extra keys
    - Validate each nominal value is a non-negative integer
    - _Requirements: 6.4, 6.5_

- [x] 7. Update Admin Panel — KonfigurasiView SPP section
  - [x] 7.1 Update KonfigurasiView to use jumlah_tingkat for fixed SPP entries
    - In `apps/admin/src/views/KonfigurasiView.vue`: fetch `jumlahTingkat` from `GET /tenants/profile` on mount
    - Initialize `sppEntries` as exactly `jumlahTingkat` entries (tingkat 1..N), filling missing values with 0
    - Remove "Tambah Tingkat" button and "×" remove buttons
    - Make tingkat column read-only labels ("Tingkat 1", "Tingkat 2", etc.)
    - On save, construct `nominal_spp` with keys `tingkat_1` through `tingkat_N`
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 8. Update Admin Panel — TenantManagementView create form
  - [x] 8.1 Add jumlah_tingkat field to tenant create form
    - In `apps/admin/src/views/TenantManagementView.vue`: add `jumlah_tingkat` to form (default: 3)
    - Add number input (min 1, max 13) with label "Jumlah Tingkat" and helper "SD = 6, SMP/SMA = 3"
    - Only editable in create mode; read-only display in edit mode
    - Include `jumlah_tingkat` in POST payload; add `admin_nama` and `admin_email` fields if not already present
    - _Requirements: 2.5, 3.3_

- [x] 9. Run migration and verify end-to-end
  - [x] 9.1 Run migration and verify all integrations work
    - Run `pnpm --filter @edu/api db:migrate` to apply migration
    - Verify seed tenant gets correct `jumlah_tingkat` value
    - Test kelas creation rejection when tingkat > jumlah_tingkat
    - Test kenaikan kelas preview shows `is_highest_grade: true` for highest tingkat
    - Test KonfigurasiView renders correct number of SPP entries
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["4.1", "5.1", "6.1", "7.1", "8.1"] },
    { "id": 3, "tasks": ["9.1"] }
  ]
}
```

## Notes

- Task 1 is the foundation; all other tasks depend on the schema being in place.
- Tasks 4, 5, 6, 7 are independent of each other and can be done in parallel after Task 3.
- Task 8 only depends on Task 2 (the DTO change) and can be done in parallel with Tasks 4-7.
- The `UpdateTenantDto` already excludes `jumlah_tingkat` — immutability is enforced by absence from the DTO, not by explicit rejection.
