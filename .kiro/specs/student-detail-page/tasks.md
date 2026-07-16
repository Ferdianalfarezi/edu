# Implementation Plan: Student Detail Page

## Overview

This plan implements the Student Detail Page feature in sequential steps: database migration, backend helper service, API endpoints, frontend view, and integration. Each task builds on the previous one to ensure no orphaned code.

## Tasks

- [x] 1. Database migration and schema update
  - [x] 1.1 Create Drizzle migration to add `tanggal_mulai` column to `riwayat_kelas`
    - Add `tanggal_mulai` as `date` (nullable) to `riwayat_kelas` table in `apps/api/src/drizzle/schema/konfigurasi.ts`
    - Generate migration SQL: `ALTER TABLE riwayat_kelas ADD COLUMN tanggal_mulai DATE;`
    - Add backfill statement: `UPDATE riwayat_kelas SET tanggal_mulai = created_at::date WHERE tanggal_mulai IS NULL;`
    - Run `drizzle-kit generate` to produce the migration file
    - _Requirements: 2.1, 2.2_

- [x] 2. Implement RiwayatKelasHelper service
  - [x] 2.1 Create `apps/api/src/modules/siswa/riwayat-kelas.helper.ts`
    - Implement `@Injectable()` class `RiwayatKelasHelper` with Drizzle DB injection
    - Implement `record(params)` method: inserts one riwayat_kelas row with tenantId, siswaId, kelasId, tahunAjaranId, and tanggalMulai (defaults to today's date YYYY-MM-DD)
    - Implement `recordBatch(entries)` method: bulk inserts multiple riwayat_kelas rows using a single `db.insert().values(...)` call
    - Both methods MUST always set `tanggalMulai` to a non-null date value
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.3_

  - [ ]* 2.2 Write property tests for RiwayatKelasHelper — Property 1: Creation records riwayat iff kelas_id non-null
    - **Property 1: Student creation records riwayat if and only if kelas_id is non-null**
    - **Validates: Requirements 1.1, 1.5, 1.6**
    - Use fast-check to generate arbitrary student creation params with random nullable kelas_id
    - Assert: riwayat record created ⟺ kelas_id is non-null; tanggal_mulai is always a valid date string

  - [ ]* 2.3 Write property tests for RiwayatKelasHelper — Property 2: Update records riwayat for non-null target only
    - **Property 2: Class update records riwayat for non-null target only**
    - **Validates: Requirements 1.2, 1.5**
    - Use fast-check to generate arbitrary kelas_id transitions (null→non-null, non-null→non-null, non-null→null, null→null)
    - Assert: riwayat record created ⟺ new kelas_id is non-null; tanggal_mulai is always non-null

  - [ ]* 2.4 Write property tests for RiwayatKelasHelper — Property 3: Promotion batch recording
    - **Property 3: Promotion records riwayat for all promoted students**
    - **Validates: Requirements 1.3, 1.4**
    - Use fast-check to generate N students (1..50) being promoted from a source class
    - Assert: exactly N riwayat_kelas records created with correct kelasId, tahunAjaranId, and non-null tanggal_mulai

- [x] 3. Integrate RiwayatKelasHelper into existing services
  - [x] 3.1 Integrate into SiswaService (create, update, import)
    - Inject `RiwayatKelasHelper` into `SiswaService`
    - In `createSiswa`: after insert, call `riwayatKelasHelper.record(...)` if `kelasId` is non-null (fetch tahunAjaranId from kelas record)
    - In `updateSiswa`: if `dto.kelasId` is defined and differs from existing, and new value is non-null, call `riwayatKelasHelper.record(...)` with new kelas_id and its tahunAjaranId
    - In `importCsvExecute`: for each created student with non-null kelasId, collect entries and call `riwayatKelasHelper.recordBatch(...)` at the end
    - Register `RiwayatKelasHelper` in siswa module providers
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 9.3_

  - [x] 3.2 Integrate into KenaikanKelasService (promote)
    - Inject `RiwayatKelasHelper` into `KenaikanKelasService`
    - Replace the existing raw `db.insert(riwayatKelas).values(...)` in `promoteStudents` with `riwayatKelasHelper.recordBatch(...)`, adding `tanggalMulai: new Date().toISOString().split('T')[0]`
    - Register `RiwayatKelasHelper` in kenaikan-kelas module providers (or export from siswa module)
    - _Requirements: 1.3, 1.4, 9.3_

- [x] 4. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement student detail API endpoints
  - [x] 5.1 Implement `getSiswaDetail` in SiswaService
    - Add method `getSiswaDetail(tenantId: string, siswaId: string): Promise<SiswaDetailResponse>`
    - Query 1: Profile — SELECT siswa + LEFT JOIN kelas + LEFT JOIN user (orang_tua) filtered by tenantId
    - Query 2: Riwayat — SELECT riwayat_kelas JOIN kelas JOIN tahun_ajaran WHERE siswa_id AND tenantId, ordered by tanggal_mulai DESC
    - Merge current kelas (from siswa.kelas_id) as first entry with `is_current: true` if kelas_id is non-null
    - Query 3: Rapor ringkasan — SELECT rapor JOIN rapor_nilai WHERE siswa_id AND rapor.status='final' AND tenantId, compute AVG(rata_rata) per rapor rounded to 2 decimals
    - Return 404 if siswa not found in tenant
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 9.1, 9.2_

  - [x] 5.2 Implement `getSiswaRaporDetail` in SiswaService
    - Add method `getSiswaRaporDetail(tenantId: string, siswaId: string, raporId: string): Promise<RaporDetailResponse>`
    - Query rapor_nilai WHERE raporId AND siswaId AND tenantId AND status='submitted'
    - JOIN mata_pelajaran for name, JOIN user (guru) for guru name
    - For each rapor_nilai row, parse `komponen_nilai` JSONB and resolve each komponen_id against komponen_penilaian table (LEFT JOIN, null name if not found)
    - Sort result by mata_pelajaran.nama ASC
    - Return 404 if no rapor_nilai entries found
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 9.1_

  - [x] 5.3 Add controller endpoints in SiswaController
    - Add `@Get(':id/detail')` with `@Roles(Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH)` decorator
    - Add `@Get(':id/rapor/:raporId')` with same role restriction
    - Wire to SiswaService methods with `@TenantId()` and `@Param('id', ParseUUIDPipe)`
    - _Requirements: 3.5, 4.3, 9.1_

  - [ ]* 5.4 Write property tests — Property 4: Riwayat merge and sort invariant
    - **Property 4: Detail endpoint riwayat merge and sort invariant**
    - **Validates: Requirements 3.2, 7.1**
    - Use fast-check to generate K historical riwayat entries with random dates, and optionally a current kelas
    - Assert: result length = K+1 (if current kelas) or K; sorted by tanggal_mulai DESC; exactly 0 or 1 `is_current: true`

  - [ ]* 5.5 Write property tests — Property 5: Rapor ringkasan arithmetic mean
    - **Property 5: Rapor ringkasan computes correct arithmetic mean**
    - **Validates: Requirements 3.3**
    - Use fast-check to generate N rapor_nilai records with random rata_rata values (decimal 0-100)
    - Assert: computed rata_rata equals arithmetic mean of all rata_rata values, rounded to 2 decimal places

  - [ ]* 5.6 Write property tests — Property 6: Rapor detail filter and sort
    - **Property 6: Rapor detail returns only submitted entries sorted by subject name**
    - **Validates: Requirements 4.1, 4.4**
    - Use fast-check to generate a mix of 'draft' and 'submitted' rapor_nilai entries with random mata_pelajaran names
    - Assert: result contains only 'submitted' entries; sorted alphabetically by mata_pelajaran name; komponen with missing komponen_penilaian has null name

  - [ ]* 5.7 Write property tests — Property 7: Multi-tenant isolation
    - **Property 7: Multi-tenant isolation**
    - **Validates: Requirements 9.1, 9.2**
    - Use fast-check to generate two tenantIds and a siswaId belonging to tenant A
    - Assert: querying with tenant B returns 404 (not 403)

- [x] 6. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement frontend SiswaDetailView
  - [x] 7.1 Create `apps/admin/src/views/SiswaDetailView.vue`
    - Fetch `GET /siswa/:id/detail` on mount using route param `id`
    - Implement profile card section: display nama, NISN, jenis_kelamin, tanggal_lahir (formatted "dd MMMM yyyy"), alamat, status (colored badge), kelas_nama (or "Belum ditempatkan"), orang_tua_nama; null fields show "-"
    - Implement status badge with color mapping: aktif→green, pindah_sekolah/keluar→red, lulus→blue
    - Implement timeline riwayat kelas: chronological reverse order, mark `is_current` entry with "Aktif" badge
    - Implement rapor ringkasan section: group by tahun_ajaran, show periode, rata_rata (1 decimal), peringkat
    - Implement accordion expand: on click, call `GET /siswa/:id/rapor/:raporId`, show per-subject detail inline
    - Handle loading states (skeleton/spinner), error state (message + "Coba Lagi" button), 404 state ("Data siswa tidak ditemukan" + link to /siswa)
    - Handle rapor expand error: show error inside accordion with retry, keep accordion open
    - Use Tailwind CSS for styling, matching existing view patterns
    - _Requirements: 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 7.2 Register route and modify SiswaManagementView
    - Add route `{ path: '/siswa/:id', name: 'siswa-detail', component: () => import('@/views/SiswaDetailView.vue'), meta: { roles: [Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH] } }` in `apps/admin/src/router/index.ts` — place BEFORE the existing `/siswa` route to avoid matching conflicts
    - In `apps/admin/src/views/SiswaManagementView.vue`: change the student name `<td>` from plain text to `<router-link :to="'/siswa/' + siswa.id">{{ siswa.nama }}</router-link>` with appropriate styling (text-primary-600 hover:underline)
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 8. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `tanggal_mulai` column is nullable at schema level for migration compatibility, but application code (RiwayatKelasHelper) always provides a non-null value (Property 8 is asserted within Properties 1-3)
- The route `/siswa/:id` must be registered before `/siswa` in the router to ensure correct matching

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.1", "3.2"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "5.4", "5.5", "5.6", "5.7"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["7.2"] }
  ]
}
```
