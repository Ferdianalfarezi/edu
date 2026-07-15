# Implementation Plan

## Overview

Fix 14 bugs in the rapor grade-input module using the bug condition methodology: write exploration tests first (expect failure on unfixed code), write preservation tests (expect pass on unfixed code), then implement all fixes and verify both test suites pass.

## Tasks

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Rapor Input Nilai Pipeline Defects
  - **CRITICAL**: These tests MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior - they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate the 14 documented bugs
  - **Scoped PBT Approach**: For deterministic bugs, scope properties to concrete failing cases
  - Test file: `apps/api/src/modules/rapor/__tests__/bug-condition-exploration.spec.ts`
  - Property 1a: POST /rapor/nilai with `periode_rapor_id: "uts_semester_1"` should be accepted (currently fails with UUID validation error from `@IsUUID('4')` decorator)
  - Property 1b: saveNilai with 10 students where student 5 has invalid data should result in 0 records persisted (currently saves first 4 due to missing transaction)
  - Property 1c: GET /rapor/nilai with `?periode_id=uts_semester_1` should return correct data (currently returns undefined because controller reads `@Query('periode_rapor_id')`)
  - Property 1d: saveCatatan should persist data to DB and be retrievable on subsequent reads (currently returns `{ saved: N }` without writing to DB)
  - Property 1e: calculateRankings with huruf komponen (A=4, B=3, C=2, D=1, E=0) should include them in rata-rata (currently skips all non-angka komponen)
  - Property 1f: Two concurrent finalize requests on same rapor should result in exactly one success (currently both succeed due to no locking)
  - Property 1g: saveNilai after deadline has passed should be rejected (currently no deadline check exists)
  - Property 1h: Submit with incomplete student data (not all active students have all wajib komponen) should be rejected (currently only validates format, not completeness)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Bug-Condition Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `apps/api/src/modules/rapor/__tests__/preservation.spec.ts`
  - Observe on UNFIXED code: POST /rapor/nilai with valid UUIDs for kelas_id, mata_pelajaran_id → same validation passes
  - Observe on UNFIXED code: saveNilai with all valid data for all students → returns `{ saved: N, rapor_id: ... }`
  - Observe on UNFIXED code: saveNilai when rapor.status === 'final' → throws ForbiddenException
  - Observe on UNFIXED code: unassigned guru attempting save → throws ForbiddenException "Anda tidak ditugaskan..."
  - Observe on UNFIXED code: angka value outside skala_min–skala_max → throws BadRequestException
  - Observe on UNFIXED code: unknown periode string → throws BadRequestException "Periode tidak valid"
  - Observe on UNFIXED code: non-wali-kelas finalize → throws ForbiddenException
  - Observe on UNFIXED code: revert on already-draft rapor → throws BadRequestException "Rapor sudah dalam status draft"
  - Write property-based tests: for all inputs where none of the 14 bug conditions hold, the system produces the observed behavior
  - Property 2a: For all valid UUID fields (kelas_id, mata_pelajaran_id), validation continues to accept them
  - Property 2b: For all successful saves (no mid-loop failure, valid data), result shape is `{ saved: N, rapor_id: string }`
  - Property 2c: For all finalized rapors, guru edit attempts throw ForbiddenException
  - Property 2d: For all unassigned guru+mapel+kelas combos, access throws ForbiddenException
  - Property 2e: For all angka values where val < skala_min OR val > skala_max, throws BadRequestException
  - Property 2f: For all invalid periode strings (not in enum), throws BadRequestException
  - Property 2g: For all non-wali users, finalize/revert throws ForbiddenException
  - Property 2h: For all already-draft rapors, revert throws BadRequestException
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 3. Database schema changes (migration)

  - [x] 3.1 Create new `rapor_nilai_audit` table in schema
    - File: `apps/api/src/drizzle/schema/rapor.ts`
    - Add table: id (uuid PK), tenant_id, rapor_nilai_id (FK), user_id, action ('insert'|'update'), siswa_id, mata_pelajaran_id, komponen_id, old_value (text nullable), new_value (text), changed_at (timestamp default now())
    - _Bug_Condition: isBugCondition(input) where input.type == 'save' AND previousValue != newValue_
    - _Expected_Behavior: audit record persisted with old/new values_
    - _Preservation: Existing rapor_nilai table unchanged_
    - _Requirements: 2.5_

  - [x] 3.2 Create new `komponen_penilaian_mapel` junction table
    - File: `apps/api/src/drizzle/schema/rapor.ts`
    - Add table: id (uuid PK), tenant_id, komponen_penilaian_id (FK), mata_pelajaran_id (FK), UNIQUE(tenant_id, komponen_penilaian_id, mata_pelajaran_id)
    - _Bug_Condition: isBugCondition(input) where input.type == 'komponen_config' AND needsPerMapel == true_
    - _Expected_Behavior: komponen can be assigned per mata pelajaran_
    - _Preservation: Existing komponen_penilaian table unchanged_
    - _Requirements: 2.10_

  - [x] 3.3 Add `deadline` column to rapor table
    - File: `apps/api/src/drizzle/schema/rapor.ts`
    - Add column: deadline (timestamp with timezone, nullable)
    - _Bug_Condition: isBugCondition(input) where input.type == 'save' AND periodeDeadlinePassed == true_
    - _Expected_Behavior: deadline checked in saveNilai, rejected if past_
    - _Preservation: Existing rapor records unaffected (nullable column)_
    - _Requirements: 2.13_

  - [x] 3.4 Add `bobot_huruf` column to komponen_penilaian table
    - File: `apps/api/src/drizzle/schema/rapor.ts`
    - Add column: bobot_huruf (jsonb, nullable, default: {"A":4,"B":3,"C":2,"D":1,"E":0})
    - _Bug_Condition: isBugCondition(input) where input.type == 'ranking' AND hasHurufKomponen == true_
    - _Expected_Behavior: huruf grades converted to numeric for ranking_
    - _Preservation: Existing komponen_penilaian records unaffected_
    - _Requirements: 2.12_

  - [x] 3.5 Add unique constraint on rapor_nilai for bulk upsert support
    - Add UNIQUE(rapor_id, siswa_id, mata_pelajaran_id, tenant_id) on rapor_nilai table
    - Required for INSERT...ON CONFLICT in bulk upsert implementation
    - _Bug_Condition: isBugCondition(input) where input.type == 'save' AND input.nilai.length > 1_
    - _Expected_Behavior: bulk upsert uses ON CONFLICT clause_
    - _Preservation: No duplicate rows currently exist (data is already unique by these columns)_
    - _Requirements: 2.2, 2.7_

  - [x] 3.6 Generate and run Drizzle migration
    - Run `npx drizzle-kit generate` and `npx drizzle-kit push` or equivalent migration command
    - Verify migration applies cleanly
    - _Requirements: 2.2, 2.5, 2.10, 2.12, 2.13_

- [x] 4. Fix DTO validation (Bug 1.1)

  - [x] 4.1 Replace @IsUUID with @IsIn on periode_rapor_id
    - File: `apps/api/src/modules/rapor/dto/input-nilai.dto.ts`
    - Replace `@IsUUID('4', { message: 'periode_rapor_id harus berupa UUID' })` with `@IsIn(['uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'], { message: 'periode_rapor_id harus salah satu dari: uts_semester_1, semester_1, uts_semester_2, semester_2' })`
    - Add `import { IsIn } from 'class-validator'`
    - _Bug_Condition: isBugCondition(input) where input.periode_rapor_id NOT UUID but valid enum_
    - _Expected_Behavior: DTO accepts valid enum strings without UUID error_
    - _Preservation: Invalid period strings still rejected (Req 3.8)_
    - _Requirements: 2.1_

- [x] 5. Transaction + Bulk Upsert in saveNilai (Bugs 1.2, 1.7)

  - [x] 5.1 Wrap saveNilai in database transaction
    - File: `apps/api/src/modules/rapor/rapor-nilai.service.ts`
    - Wrap entire saveNilai body after validation in `this.db.transaction(async (tx) => { ... })`
    - Use `tx` instead of `this.db` for all DB operations inside the transaction
    - On any error mid-operation, entire transaction rolls back (0 records persisted)
    - _Bug_Condition: isBugCondition(input) where input.nilai.length > 1 AND error occurs mid-loop_
    - _Expected_Behavior: rollback all changes, 0 students persisted on failure_
    - _Preservation: Successful saves still return { saved: N, rapor_id } (Req 3.2)_
    - _Requirements: 2.2_

  - [x] 5.2 Replace per-student SELECT+INSERT/UPDATE loop with bulk upsert
    - File: `apps/api/src/modules/rapor/rapor-nilai.service.ts`
    - Replace the `for (const entry of nilai)` loop containing individual SELECT + INSERT/UPDATE
    - Use single `INSERT INTO rapor_nilai (...) VALUES (...), (...), ... ON CONFLICT (rapor_id, siswa_id, mata_pelajaran_id, tenant_id) DO UPDATE SET ...`
    - Use Drizzle's `sql` template literal or raw query for bulk upsert
    - _Bug_Condition: isBugCondition(input) where input.nilai.length > 10 (performance)_
    - _Expected_Behavior: O(1) queries for upsert, not O(N)_
    - _Preservation: Same result shape { saved: N, rapor_id } (Req 3.2)_
    - _Requirements: 2.2, 2.7_

- [x] 6. Query param alignment (Bugs 1.3, 1.14)

  - [x] 6.1 Rename query param in controller getNilai method
    - File: `apps/api/src/modules/rapor/rapor.controller.ts`
    - Change `@Query('periode_rapor_id') periodeId: string` to `@Query('periode_id') periodeId: string`
    - This aligns with frontend RaporInputView which sends `periode_id`
    - _Bug_Condition: isBugCondition(input) where input.queryParam == 'periode_id' AND backend.expects == 'periode_rapor_id'_
    - _Expected_Behavior: controller reads periode_id param correctly_
    - _Preservation: Other endpoints unaffected (Req 3.3)_
    - _Requirements: 2.3_

  - [x] 6.2 Fix frontend response mapping in RaporInputView
    - File: `apps/admin/src/views/RaporInputView.vue`
    - Update `fetchNilai` to map backend `KelasGradeResult` shape correctly:
      - `data.data.students` → `nilaiData.value` (mapped to SiswaNilai interface)
      - `data.data.komponen_penilaian` → `komponenList.value`
    - Map each student: `{ siswa_id, siswa_nama, komponen: s.komponen_nilai ?? komponen.map(k => ({komponen_id: k.id, nilai: null})), capaian_pembelajaran: s.capaian_pembelajaran ?? '', status: s.status ?? 'draft' }`
    - _Bug_Condition: isBugCondition(input) where frontend.expectsFormat != backend.returnsFormat_
    - _Expected_Behavior: frontend correctly displays grades from backend response_
    - _Preservation: Save payload format unchanged (Req 3.3)_
    - _Requirements: 2.3, 2.14_

- [x] 7. Un-submit endpoint (Bug 1.4)

  - [x] 7.1 Add unsubmit method to RaporNilaiService
    - File: `apps/api/src/modules/rapor/rapor-nilai.service.ts`
    - New method `unsubmitNilai(tenantId, guruId, dto: { kelas_id, mata_pelajaran_id, periode_rapor_id })`
    - Validate guru assignment, validate rapor.status === 'draft' (not finalized), validate current rapor_nilai status === 'submitted'
    - UPDATE rapor_nilai SET status='draft' WHERE rapor_id AND mata_pelajaran_id AND guru_id AND tenant_id
    - Return `{ unsubmitted: count }`
    - _Bug_Condition: isBugCondition(input) where input.type == 'unsubmit' AND currentStatus == 'submitted' AND rapor.status == 'draft'_
    - _Expected_Behavior: guru can revert own submission from 'submitted' to 'draft'_
    - _Preservation: Finalized rapors still block edits (Req 3.4)_
    - _Requirements: 2.4_

  - [x] 7.2 Add POST /rapor/nilai/unsubmit endpoint to controller
    - File: `apps/api/src/modules/rapor/rapor.controller.ts`
    - Add `@Post('nilai/unsubmit')` with `@Roles(Role.GURU)`
    - Body: `{ kelas_id: string, mata_pelajaran_id: string, periode_rapor_id: string }`
    - Create UnsubmitNilaiDto with appropriate validators
    - _Requirements: 2.4_

  - [x] 7.3 Add "Tarik Kembali" button in RaporInputView frontend
    - File: `apps/admin/src/views/RaporInputView.vue`
    - Show button when all siswa have status === 'submitted' and rapor is not finalized
    - On click, POST /rapor/nilai/unsubmit with current kelas, mapel, periode
    - On success, re-fetch nilai to refresh UI
    - _Requirements: 2.4_

- [x] 8. Audit trail (Bug 1.5)

  - [x] 8.1 Add audit record insertion in saveNilai transaction
    - File: `apps/api/src/modules/rapor/rapor-nilai.service.ts`
    - Inside the transaction, after bulk upsert, query the old values (before update) and compare with new values
    - For inserts: insert audit with action='insert', old_value=null, new_value=komponen JSON
    - For updates: insert audit with action='update', old_value=previous komponen JSON, new_value=new komponen JSON
    - Use the rapor_nilai_audit table from schema changes
    - _Bug_Condition: isBugCondition(input) where input.type == 'save' AND previousValue != newValue_
    - _Expected_Behavior: audit record exists with user_id, timestamp, old/new values_
    - _Preservation: saveNilai return shape unchanged (Req 3.2)_
    - _Requirements: 2.5_

- [x] 9. Finalization locking (Bug 1.6)

  - [x] 9.1 Wrap finalizeRapor in transaction with SELECT FOR UPDATE
    - File: `apps/api/src/modules/rapor/rapor-finalization.service.ts`
    - Wrap entire `finalizeRapor` body in `this.db.transaction(async (tx) => { ... })`
    - Replace the rapor status check with `SELECT ... FROM rapor WHERE ... FOR UPDATE` using raw SQL
    - This acquires a row-level lock preventing concurrent finalization
    - Second concurrent request will block until first completes, then see status='final' and throw
    - _Bug_Condition: isBugCondition(input) where input.type == 'finalize' AND concurrentRequests > 1_
    - _Expected_Behavior: exactly one finalization succeeds, others receive error_
    - _Preservation: Single finalization still works identically (Req 3.6)_
    - _Requirements: 2.6_

- [x] 10. Auto-save in frontend (Bug 1.8)

  - [x] 10.1 Add 30-second auto-save interval in RaporInputView
    - File: `apps/admin/src/views/RaporInputView.vue`
    - Add `isDirty` ref, set to true on deep watch of nilaiData
    - Add `onMounted` interval (30s) that calls `saveNilai('draft')` if isDirty && nilaiData.length > 0
    - Reset isDirty after successful save
    - Add `onUnmounted` cleanup for interval
    - Add small "Auto-save aktif" indicator in UI
    - Suppress success toast on auto-save (only show on manual save)
    - _Bug_Condition: isBugCondition(input) where input.type == 'frontend_edit' AND timeSinceLastSave > 30s_
    - _Expected_Behavior: draft auto-saved every 30s when changes exist_
    - _Preservation: Manual save buttons still work (Req 3.3)_
    - _Requirements: 2.8_

- [x] 11. Completeness validation on submit (Bug 1.9)

  - [x] 11.1 Add completeness check in saveNilai when status='submitted'
    - File: `apps/api/src/modules/rapor/rapor-nilai.service.ts`
    - When `status === 'submitted'`: query all active students in kelas, verify every student has an entry in `dto.nilai`
    - For each student entry, verify all `is_wajib` komponen have non-empty values
    - If incomplete, throw BadRequestException with details of which students/komponen are missing
    - _Bug_Condition: isBugCondition(input) where input.type == 'submit' AND NOT allStudentsHaveValues_
    - _Expected_Behavior: submit rejected if any active student missing wajib komponen_
    - _Preservation: Draft saves still allow partial data (Req 3.2); format validation unchanged (Req 3.7)_
    - _Requirements: 2.9_

- [x] 12. Komponen per-mapel support (Bug 1.10)

  - [x] 12.1 Update getKelasGrades to filter komponen by mapel
    - File: `apps/api/src/modules/rapor/rapor-nilai.service.ts`
    - When fetching komponen_penilaian, LEFT JOIN with komponen_penilaian_mapel
    - If mapel-specific assignments exist for this mata_pelajaran_id, return only those komponen
    - If no mapel-specific assignments exist, fall back to all tenant komponen (backward compatible)
    - _Bug_Condition: isBugCondition(input) where input.type == 'komponen_config' AND needsPerMapel == true_
    - _Expected_Behavior: each mapel gets its own komponen set when configured_
    - _Preservation: When no per-mapel config exists, behavior identical to current (global komponen)_
    - _Requirements: 2.10_

  - [x] 12.2 Update saveNilai validation to use per-mapel komponen
    - File: `apps/api/src/modules/rapor/rapor-nilai.service.ts`
    - Use same filtered komponen (per-mapel or global fallback) for validation in saveNilai
    - _Requirements: 2.10_

- [x] 13. saveCatatan persistence (Bug 1.11)

  - [x] 13.1 Implement actual DB writes in saveCatatan
    - File: `apps/api/src/modules/rapor/rapor-wali.service.ts`
    - Replace the no-op `return { saved: dto.catatan.length }` with actual persistence
    - Get rapor record for kelas_id + periode_rapor_id + active tahun_ajaran
    - For each catatan item: UPDATE rapor_nilai SET catatan_wali_kelas = item.catatan WHERE rapor_id AND siswa_id AND tenant_id
    - Handle p5_deskripsi field if present in CatatanItem
    - _Bug_Condition: isBugCondition(input) where input.type == 'catatan' AND dto.catatan.length > 0_
    - _Expected_Behavior: catatan persisted to DB, retrievable on subsequent reads_
    - _Preservation: Response shape `{ saved: N }` unchanged_
    - _Requirements: 2.11_

  - [x] 13.2 Update SaveCatatanDto to include p5_deskripsi
    - File: `apps/api/src/modules/rapor/dto/save-catatan.dto.ts`
    - Add `p5_deskripsi?: { dimensi: string; deskripsi: string }[]` field to CatatanItem
    - Add appropriate validators (@IsOptional, @IsArray, @ValidateNested)
    - _Requirements: 2.11_

- [x] 14. Ranking huruf conversion (Bug 1.12)

  - [x] 14.1 Update calculateRankings to include huruf grades
    - File: `apps/api/src/modules/rapor/rapor-finalization.service.ts`
    - Replace `angkaKomponenIds` filter with a map that includes both angka and huruf types
    - Add `HURUF_TO_NUMERIC: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, E: 0 }`
    - For each komponen_nilai item: if tipe==='angka' use numeric value; if tipe==='huruf' convert via HURUF_TO_NUMERIC; if tipe==='deskripsi' skip
    - Use bobot_huruf from komponen_penilaian if custom mapping exists, otherwise use default
    - _Bug_Condition: isBugCondition(input) where input.type == 'ranking' AND hasHurufKomponen == true_
    - _Expected_Behavior: huruf values (A=4, B=3, C=2, D=1, E=0) included in rata-rata calculation_
    - _Preservation: Angka-only rankings produce same result as before (Req 3.6)_
    - _Requirements: 2.12_

- [x] 15. Deadline enforcement (Bug 1.13)

  - [x] 15.1 Add deadline check in saveNilai
    - File: `apps/api/src/modules/rapor/rapor-nilai.service.ts`
    - After getting/creating rapor record, check `raporRecord.deadline`
    - If deadline is set and `new Date() > new Date(raporRecord.deadline)`, throw ForbiddenException('Batas waktu input nilai untuk periode ini sudah terlewat.')
    - _Bug_Condition: isBugCondition(input) where input.type == 'save' AND periodeDeadlinePassed == true_
    - _Expected_Behavior: save rejected after deadline with clear error message_
    - _Preservation: When deadline is null, no restriction (backward compatible)_
    - _Requirements: 2.13_

  - [x] 15.2 Add admin endpoint to set deadline
    - File: `apps/api/src/modules/rapor/rapor.controller.ts`
    - Add `PATCH /rapor/:raporId/deadline` with `@Roles(Role.ADMIN)`
    - Body: `{ deadline: string (ISO date) | null }`
    - Update rapor.deadline column
    - _Requirements: 2.13_

- [x] 16. Verify bug condition exploration tests now pass

  - [x] 16.1 Re-run bug condition exploration tests
    - **Property 1: Expected Behavior** - Rapor Input Nilai Pipeline Fixed
    - **IMPORTANT**: Re-run the SAME tests from task 1 - do NOT write new tests
    - The tests from task 1 encode the expected behavior
    - When these tests pass, it confirms all 14 bugs are fixed
    - Run bug condition exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14_

  - [x] 16.2 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Bug-Condition Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after all fixes (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 17. Checkpoint - Ensure all tests pass
  - Run full test suite: `npm run test` or `npx jest --run` in apps/api
  - Ensure all exploration tests (task 1) now PASS
  - Ensure all preservation tests (task 2) still PASS
  - Ensure no other existing tests are broken by the changes
  - Verify Drizzle migration is clean and schema matches code
  - Ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Write exploration and preservation tests BEFORE any code changes"
    },
    {
      "wave": 2,
      "tasks": ["3"],
      "description": "Database schema changes (migration) — prerequisite for all implementation"
    },
    {
      "wave": 3,
      "tasks": ["4", "5", "6", "7", "9", "10", "12", "13", "14", "15"],
      "description": "Core implementation fixes (can be done in parallel after schema changes)"
    },
    {
      "wave": 4,
      "tasks": ["8", "11"],
      "description": "Audit trail and completeness validation (depend on transaction from task 5)"
    },
    {
      "wave": 5,
      "tasks": ["16"],
      "description": "Verify all exploration tests pass and preservation tests still pass"
    },
    {
      "wave": 6,
      "tasks": ["17"],
      "description": "Final checkpoint — full test suite verification"
    }
  ]
}
```

## Notes

- Tests in tasks 1 and 2 are written BEFORE any implementation changes
- Task 1 tests are expected to FAIL on unfixed code (confirming bugs exist)
- Task 2 tests are expected to PASS on unfixed code (establishing preservation baseline)
- After all fixes (tasks 3–15), task 1 tests should PASS and task 2 tests should still PASS
- Schema changes (task 3) are additive only — no columns removed or renamed
- Frontend auto-save (task 10) is independent of backend fixes and can be done in parallel
- The bulk upsert (task 5.2) requires the unique constraint from task 3.5
