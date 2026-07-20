# Implementation Plan: Auto-Generate Kelas

## Overview

Refactor the tahun ajaran creation flow to use status-agnostic source selection for kelas duplication (most recent by tanggal_mulai with kelas records), add an opt-out `generate_kelas` boolean to the DTO and form, and provide conditional toast feedback based on duplication results.

## Tasks

- [x] 1. Backend — DTO and Service Refactoring
  - [x] 1.1 Add `generate_kelas` optional boolean to `CreateTahunAjaranDto`
    - Add `@IsOptional()` and `@IsBoolean()` decorators to a new `generate_kelas?: boolean` field in `apps/api/src/modules/tahun-ajaran/dto/create-tahun-ajaran.dto.ts`
    - Import `IsOptional` and `IsBoolean` from `class-validator`
    - _Requirements: 4.1, 4.2_

  - [x] 1.2 Implement `findSourceTahunAjaran()` private method in `TahunAjaranService`
    - Add private method to `apps/api/src/modules/tahun-ajaran/tahun-ajaran.service.ts`
    - Use EXISTS subquery: `EXISTS (SELECT 1 FROM kelas WHERE kelas.tahun_ajaran_id = tahun_ajaran.id AND kelas.tenant_id = :tenantId)`
    - Filter: same tenant, exclude the newly created tahun ajaran ID
    - Order by `tanggal_mulai DESC`, then `created_at DESC` as tiebreaker
    - `LIMIT 1` — return `{ id: string } | null`
    - Import `kelas` schema, `desc`, and `sql` from drizzle-orm as needed
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.1_

  - [x] 1.3 Refactor `create()` method to use new source selection and opt-out logic
    - Replace the existing "find aktif" logic with: `const shouldGenerate = dto.generate_kelas !== false;`
    - If `shouldGenerate`, call `this.findSourceTahunAjaran(tenantId, created.id)` to get the source
    - If source found, call `this.kelasService.duplicateClassStructure(tenantId, source.id, created.id)`
    - If `!shouldGenerate` or no source, set `duplicatedCount = 0`
    - Return `{ ...created, duplicatedClassCount: duplicatedCount }`
    - _Requirements: 3.2, 3.3, 4.2, 4.3, 4.4, 5.5_

- [x] 2. Checkpoint — Verify backend compiles
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Frontend — Form Checkbox and Toast Notifications
  - [x] 3.1 Add `generate_kelas` checkbox to the create form in `TahunAjaranView.vue`
    - Extend the `TahunAjaranForm` interface with `generate_kelas: boolean`
    - Set default value to `true` in the form ref initialization
    - Add a checkbox input labeled "Generate kelas dari tahun sebelumnya" in the form (after the tanggal_selesai field)
    - Include `generate_kelas` in the POST payload sent to the API
    - Update the modal description text to reflect that generation is optional
    - _Requirements: 3.1, 3.4_

  - [x] 3.2 Implement conditional toast notifications based on API response
    - Import and use the `useToast` composable (from `@/composables/useToast`)
    - After successful creation:
      - If `generate_kelas` was unchecked: show success toast "Berhasil membuat tahun ajaran tanpa generate kelas."
      - If `duplicatedClassCount > 0`: show success toast "Berhasil membuat tahun ajaran. {N} kelas di-generate dari tahun sebelumnya."
      - If `duplicatedClassCount === 0` (enabled but no source): show info toast "Berhasil membuat tahun ajaran. Tidak ada kelas di-generate karena tidak ditemukan data kelas di tahun ajaran sebelumnya."
    - On API error: show error toast with the response message, keep modal open, preserve form input
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 4. Checkpoint — Verify frontend compiles and form functions
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Backend Tests — Property-Based and Unit
  - [x] 5.1 Write property test: Source selection returns the most recent tahun ajaran with kelas
    - **Property 1: Source selection returns the most recent tahun ajaran with kelas**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 6.1**
    - File: `apps/api/src/modules/tahun-ajaran/__tests__/sourceSelection.property.test.ts`
    - Use fast-check to generate arrays of tahun_ajaran candidates with varying `tanggalMulai`, `createdAt`, `kelasCount` (0 or more), and `status` values
    - Verify the algorithm picks the candidate with greatest `tanggalMulai` (then `createdAt`) that has `kelasCount > 0`, excluding the new ID
    - Verify returns null when all candidates have zero kelas

  - [x] 5.2 Write property test: Duplication preserves fields correctly
    - **Property 2: Duplication preserves fields correctly and enforces invariants**
    - **Validates: Requirements 2.1, 2.2, 2.3, 6.2**
    - File: `apps/api/src/modules/tahun-ajaran/__tests__/duplicationFields.property.test.ts`
    - Use fast-check to generate random kelas arrays (arbitrary nama, tingkat, kapasitas, wali_kelas_id)
    - Verify output records match nama/tingkat/kapasitas from source, wali_kelas_id is null, tahun_ajaran_id is target, tenant_id matches

  - [x] 5.3 Write property test: Duplication count equals source count
    - **Property 3: Duplication count equals source count**
    - **Validates: Requirements 2.4, 4.4**
    - File: `apps/api/src/modules/tahun-ajaran/__tests__/duplicationCount.property.test.ts`
    - Use fast-check to generate source arrays of 1-50 kelas records
    - Verify output length equals input length and `duplicatedClassCount` matches

  - [x] 5.4 Write property test: Opt-out skips all duplication
    - **Property 4: Opt-out skips all duplication**
    - **Validates: Requirements 3.2, 4.3**
    - File: `apps/api/src/modules/tahun-ajaran/__tests__/optOut.property.test.ts`
    - Use fast-check to generate random source data with `generate_kelas = false`
    - Verify zero kelas created and `duplicatedClassCount === 0` regardless of available sources

  - [x] 5.5 Write property test: Omitting generate_kelas defaults to generation enabled
    - **Property 5: Omitting generate_kelas defaults to generation enabled**
    - **Validates: Requirements 4.2**
    - File: `apps/api/src/modules/tahun-ajaran/__tests__/defaultBehavior.property.test.ts`
    - Use fast-check to generate random source data, compare results of `generate_kelas: undefined` vs `generate_kelas: true`
    - Verify identical `duplicatedClassCount` and kelas output

  - [x] 5.6 Write unit tests for DTO validation and service edge cases
    - File: `apps/api/src/modules/tahun-ajaran/__tests__/createTahunAjaran.unit.test.ts`
    - Test `generate_kelas` field: accepts `true`, `false`, `undefined`; rejects non-boolean values via class-validator
    - Test `findSourceTahunAjaran` returns null for empty tenant (no prior tahun ajaran with kelas)
    - Test tenant isolation: source query only considers same tenant records
    - _Requirements: 4.1, 4.2, 6.1, 6.2, 6.3_

- [x] 6. Final Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `KelasService.duplicateClassStructure()` method is reused without modification
- No database migrations are required — changes are limited to DTO validation and service logic

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "3.1"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6"] }
  ]
}
```
