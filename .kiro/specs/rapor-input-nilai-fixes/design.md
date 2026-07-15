# Rapor Input Nilai Fixes — Bugfix Design

## Overview

This design addresses 14 bugs in the rapor grade-input module that collectively cause: DTO validation rejecting valid inputs, data loss from missing transactions, frontend-backend contract mismatches, missing audit trails, race conditions on finalization, N+1 query performance issues, and incomplete business logic (saveCatatan no-op, ranking ignoring huruf grades, no period locking, no un-submit mechanism, no auto-save, no completeness validation, global komponen without per-mapel assignment).

The fix strategy is **minimal and targeted**: correct the immediate defects without rewriting the module architecture. Schema additions (audit trail table, komponen-mapel junction, deadline column) are additive — no existing columns are removed or renamed.

## Glossary

- **Bug_Condition (C)**: The set of inputs/operations that trigger any of the 14 documented bugs
- **Property (P)**: The correct behavior defined in requirements 2.1–2.14
- **Preservation**: Existing behaviors documented in requirements 3.1–3.10 that must remain unchanged
- **saveNilai**: The function in `rapor-nilai.service.ts` that persists grade entries per student
- **finalizeRapor**: The function in `rapor-finalization.service.ts` that locks a rapor as "final"
- **saveCatatan**: The function in `rapor-wali.service.ts` that should persist wali kelas notes
- **komponen_penilaian**: Tenant-level assessment component configuration (currently global, needs per-mapel support)
- **PeriodeRapor**: String enum (`uts_semester_1`, `semester_1`, `uts_semester_2`, `semester_2`)
- **N+1 Problem**: Anti-pattern where N individual queries are issued inside a loop instead of a single bulk query

## Bug Details

### Bug Condition

The bugs manifest across multiple entry points in the rapor module. They share a common theme: the grade-input pipeline (DTO validation → persistence → finalization → ranking) has gaps at each stage.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type RaporOperation (save, finalize, catatan, read)
  OUTPUT: boolean

  RETURN (input.type == 'save' AND input.periode_rapor_id NOT UUID)
         OR (input.type == 'save' AND input.nilai.length > 1)
         OR (input.type == 'read' AND input.queryParam == 'periode_id' AND backend.expects == 'periode_rapor_id')
         OR (input.type == 'unsubmit' AND input.currentStatus == 'submitted' AND rapor.status == 'draft')
         OR (input.type == 'save' AND previousValue != newValue)
         OR (input.type == 'finalize' AND concurrentRequests > 1)
         OR (input.type == 'save' AND input.nilai.length > 10)
         OR (input.type == 'frontend_edit' AND timeSinceLastSave > 30s)
         OR (input.type == 'submit' AND NOT allStudentsHaveValues)
         OR (input.type == 'komponen_config' AND needsPerMapel == true)
         OR (input.type == 'catatan' AND dto.catatan.length > 0)
         OR (input.type == 'ranking' AND hasHurufKomponen == true)
         OR (input.type == 'save' AND periodeDeadlinePassed == true)
         OR (input.type == 'read' AND frontend.expectsFormat != backend.returnsFormat)
END FUNCTION
```

### Examples

- **Bug 1.1**: POST `/rapor/nilai` with `{ periode_rapor_id: "uts_semester_1" }` → rejected with "harus berupa UUID" (DTO has `@IsUUID('4')`)
- **Bug 1.2**: Saving 40 students, DB constraint violation at student 20 → first 19 are persisted, 21 lost (no transaction)
- **Bug 1.3**: Frontend sends `?periode_id=uts_semester_1`, backend reads `@Query('periode_rapor_id')` → undefined
- **Bug 1.6**: Two finalize requests arrive within 50ms → both pass the `status !== 'final'` check, both calculate rankings
- **Bug 1.7**: 40 students × (1 SELECT + 1 INSERT/UPDATE) = 80 queries, ~2s response time
- **Bug 1.11**: `saveCatatan` returns `{ saved: N }` but never writes to DB
- **Bug 1.12**: Student has Seni (huruf: A=4) and Matematika (angka: 85), ranking only uses 85, ignores Seni

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- UUID validation on `kelas_id` and `mata_pelajaran_id` fields (Req 3.1)
- Successful save of all students returns `{ saved: N, rapor_id: ... }` (Req 3.2)
- Other endpoints (`GET /rapor/mata-pelajaran`, `GET /rapor/kelas`, `POST /rapor/nilai` contract shape) continue working (Req 3.3)
- Finalized rapor blocks guru edits with ForbiddenException (Req 3.4)
- Unassigned guru gets ForbiddenException (Req 3.5)
- Finalization flow: validate all submitted → calculate rankings → set final → notify parents (Req 3.6)
- Angka values outside skala_min–skala_max rejected with BadRequestException (Req 3.7)
- Invalid periode string rejected with BadRequestException (Req 3.8)
- Non-wali-kelas rejected from finalize/revert (Req 3.9)
- Revert on already-draft rapor rejected (Req 3.10)

**Scope:**
All inputs that do NOT trigger any of the 14 bug conditions should produce identical behavior to the current unfixed code. This includes:
- Valid UUID fields for kelas_id, mata_pelajaran_id
- Single-student saves (where atomicity isn't observable)
- Mouse-click interactions in frontend (non-auto-save paths)
- Finalization with no concurrency
- Rapor reads when response format is consumed correctly

## Hypothesized Root Cause

1. **Bug 1.1 — Wrong DTO Decorator**: `InputNilaiDto.periode_rapor_id` has `@IsUUID('4')` but the actual value is a string enum from `periodeRaporEnum`. The decorator should be `@IsIn(['uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'])`.

2. **Bug 1.2 — Missing Transaction**: `saveNilai` iterates over `nilai` array with individual INSERT/UPDATE without wrapping in `db.transaction()`. Any mid-loop failure leaves partial data.

3. **Bug 1.3 — Query Param Name Mismatch**: Controller `getNilai` uses `@Query('periode_rapor_id')` but `RaporInputView.vue` sends `periode_id`. The frontend also calls the wrong endpoint (`GET /rapor/nilai` with query params instead of `GET /rapor/kelas/:kelasId/mapel/:mapelId/periode/:periodeId`).

4. **Bug 1.4 — No Un-submit Endpoint**: No `POST /rapor/nilai/unsubmit` exists. The only way to revert is wali kelas reverting the entire rapor.

5. **Bug 1.5 — No Audit Table**: No `rapor_nilai_audit` table exists. `saveNilai` only updates `updatedAt`.

6. **Bug 1.6 — No Transaction/Locking in Finalization**: `finalizeRapor` does not use `db.transaction()` or `SELECT ... FOR UPDATE`. Two concurrent requests both read `status='draft'` and proceed.

7. **Bug 1.7 — N+1 Loop**: `saveNilai` has a `for (const entry of nilai)` loop with individual SELECT + INSERT/UPDATE per student instead of bulk upsert.

8. **Bug 1.8 — No Auto-Save**: Frontend `RaporInputView.vue` has no periodic auto-save mechanism.

9. **Bug 1.9 — No Completeness Check on Submit**: `saveNilai` validates format of provided entries but doesn't verify all active students are included when `status='submitted'`.

10. **Bug 1.10 — No Komponen-Mapel Relation**: `komponen_penilaian` table has no `mata_pelajaran_id` column. All komponen are global per tenant.

11. **Bug 1.11 — saveCatatan No-Op**: `RaporWaliService.saveCatatan()` validates wali kelas then returns `{ saved: dto.catatan.length }` without any DB write. The comment says "the actual note persistence depends on schema" — it was never implemented.

12. **Bug 1.12 — Ranking Ignores Huruf**: `calculateRankings` filters `angkaKomponenIds` and skips any komponen where `tipe !== 'angka'`. Huruf grades (A–E) are never converted to numeric equivalents.

13. **Bug 1.13 — No Deadline Mechanism**: No `deadline` column on any table. No check in `saveNilai` against a deadline date.

14. **Bug 1.14 — Response Format Mismatch**: Frontend expects `{ siswa: [...], komponen: [...] }` but backend `getKelasGrades` returns `{ students: [...], komponen_penilaian: [...], kelas_id, kelas_nama, mapel_id, mapel_nama, periode }`. The frontend `fetchNilai` calls `GET /rapor/nilai` which maps to `getKelasGrades` via the controller `getNilai` method.

## Correctness Properties

Property 1: Bug Condition — DTO Accepts Valid Periode Enum

_For any_ POST `/rapor/nilai` request where `periode_rapor_id` is one of the valid enum values (`uts_semester_1`, `semester_1`, `uts_semester_2`, `semester_2`), the fixed DTO validation SHALL accept the request without UUID validation errors.

**Validates: Requirements 2.1**

Property 2: Bug Condition — Atomic Save with Transaction

_For any_ `saveNilai` call with N students where an error occurs at student K (1 ≤ K ≤ N), the fixed function SHALL rollback all changes, resulting in 0 students persisted (not K-1).

**Validates: Requirements 2.2**

Property 3: Bug Condition — Consistent Query Parameter Names

_For any_ frontend request to fetch grades with a `periode_id` query parameter, the fixed system SHALL correctly route and read the parameter so that the correct period data is returned.

**Validates: Requirements 2.3, 2.14**

Property 4: Bug Condition — Un-submit Mechanism

_For any_ guru with `status='submitted'` grades where the rapor is still in `status='draft'`, the fixed system SHALL allow the guru to revert their submission to `status='draft'` via a dedicated endpoint.

**Validates: Requirements 2.4**

Property 5: Bug Condition — Audit Trail Recorded

_For any_ grade change (insert or update) via `saveNilai`, the fixed system SHALL persist an audit record containing: user_id, timestamp, siswa_id, komponen_id, old_value, new_value.

**Validates: Requirements 2.5**

Property 6: Bug Condition — Finalization Race Condition Prevented

_For any_ two concurrent finalize requests on the same rapor, the fixed system SHALL ensure exactly one succeeds and the other receives an error, with no duplicate ranking calculations or notifications.

**Validates: Requirements 2.6**

Property 7: Bug Condition — Bulk Upsert Performance

_For any_ `saveNilai` call with N students, the fixed function SHALL use at most O(1) queries for the upsert operation (bulk INSERT...ON CONFLICT), not O(N).

**Validates: Requirements 2.7**

Property 8: Bug Condition — Auto-Save Prevents Data Loss

_For any_ editing session in `RaporInputView` where changes exist and 30 seconds have elapsed since last save, the fixed frontend SHALL automatically trigger a draft save.

**Validates: Requirements 2.8**

Property 9: Bug Condition — Completeness Validation on Submit

_For any_ `saveNilai` call with `status='submitted'`, the fixed system SHALL verify that ALL active students in the kelas have grade entries with all required (is_wajib) komponen filled, rejecting the request if incomplete.

**Validates: Requirements 2.9**

Property 10: Bug Condition — Per-Mapel Komponen Assignment

_For any_ komponen penilaian configuration, the fixed system SHALL support associating komponen with specific mata pelajaran (or groups), so different subjects can have different assessment components.

**Validates: Requirements 2.10**

Property 11: Bug Condition — saveCatatan Persists Data

_For any_ `saveCatatan` call with valid catatan data, the fixed system SHALL persist `catatan_wali_kelas` and `p5_deskripsi` to the database and the data SHALL be retrievable on subsequent reads.

**Validates: Requirements 2.11**

Property 12: Bug Condition — Rankings Include Huruf Grades

_For any_ ranking calculation where students have komponen of type "huruf", the fixed system SHALL convert huruf values to numeric weights (A=4, B=3, C=2, D=1, E=0) and include them in the rata-rata calculation.

**Validates: Requirements 2.12**

Property 13: Bug Condition — Period Deadline Enforcement

_For any_ `saveNilai` call where the current date exceeds the configured deadline for the target period, the fixed system SHALL reject the request with an appropriate error message.

**Validates: Requirements 2.13**

Property 14: Preservation — Existing Behaviors Unchanged

_For any_ input where none of the 14 bug conditions hold (valid UUID fields, correct param names, no concurrency, no huruf komponen in ranking, etc.), the fixed system SHALL produce the same result as the original system, preserving all behaviors documented in requirements 3.1–3.10.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**

## Fix Implementation

### Changes Required

#### 1. Schema Changes (Database Migration)

**File**: `apps/api/src/drizzle/schema/rapor.ts`

**New Table — `rapor_nilai_audit`:**
```
rapor_nilai_audit:
  id: uuid PK
  tenant_id: uuid NOT NULL
  rapor_nilai_id: uuid NOT NULL (FK → rapor_nilai.id)
  user_id: uuid NOT NULL
  action: varchar ('insert' | 'update')
  siswa_id: uuid NOT NULL
  mata_pelajaran_id: uuid NOT NULL
  komponen_id: uuid
  old_value: text (null for inserts)
  new_value: text
  changed_at: timestamp with timezone DEFAULT now()
```

**New Table — `komponen_penilaian_mapel`** (junction table):
```
komponen_penilaian_mapel:
  id: uuid PK
  tenant_id: uuid NOT NULL
  komponen_penilaian_id: uuid NOT NULL (FK → komponen_penilaian.id)
  mata_pelajaran_id: uuid NOT NULL (FK → mata_pelajaran.id)
  UNIQUE(tenant_id, komponen_penilaian_id, mata_pelajaran_id)
```

**New Column — `rapor.deadline`:**
```
rapor table ADD COLUMN:
  deadline: timestamp with timezone (nullable)
```

**New Column — `komponen_penilaian.bobot_huruf`** (optional JSON mapping):
```
komponen_penilaian ADD COLUMN:
  bobot_huruf: jsonb (nullable, default: {"A":4,"B":3,"C":2,"D":1,"E":0})
```

#### 2. DTO Fix (Bug 1.1)

**File**: `apps/api/src/modules/rapor/dto/input-nilai.dto.ts`

**Change**: Replace `@IsUUID('4')` on `periode_rapor_id` with `@IsIn(['uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'])`.

```typescript
// BEFORE
@IsUUID('4', { message: 'periode_rapor_id harus berupa UUID' })
periode_rapor_id: string;

// AFTER
@IsIn(['uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'], {
  message: 'periode_rapor_id harus salah satu dari: uts_semester_1, semester_1, uts_semester_2, semester_2',
})
periode_rapor_id: string;
```

#### 3. Transaction + Bulk Upsert in saveNilai (Bugs 1.2, 1.7)

**File**: `apps/api/src/modules/rapor/rapor-nilai.service.ts`

**Changes**:
1. Wrap the entire `saveNilai` method body in `this.db.transaction(async (tx) => { ... })`
2. Replace the per-student SELECT + INSERT/UPDATE loop with a single bulk upsert:
   ```sql
   INSERT INTO rapor_nilai (tenant_id, rapor_id, siswa_id, mata_pelajaran_id, guru_id, komponen_nilai, capaian_pembelajaran, status)
   VALUES ($1, $2, $3, ...), ($1, $2, $4, ...), ...
   ON CONFLICT (rapor_id, siswa_id, mata_pelajaran_id, tenant_id) 
   DO UPDATE SET komponen_nilai = EXCLUDED.komponen_nilai, status = EXCLUDED.status, updated_at = NOW()
   ```
3. Add unique constraint on `rapor_nilai(rapor_id, siswa_id, mata_pelajaran_id, tenant_id)` to support ON CONFLICT

#### 4. Query Param Alignment (Bugs 1.3, 1.14)

**File**: `apps/api/src/modules/rapor/rapor.controller.ts`

**Change**: In the `getNilai` controller method, rename `@Query('periode_rapor_id')` to `@Query('periode_id')` to match what the frontend sends.

**File**: `apps/admin/src/views/RaporInputView.vue`

**Change**: Update `fetchNilai` to correctly read the backend response format. The backend returns `KelasGradeResult` shape, so the frontend should map:
- `data.students` → `nilaiData`  
- `data.komponen_penilaian` → `komponenList`

Or alternatively, create a dedicated `GET /rapor/nilai` endpoint that returns the shape the frontend expects. The simpler fix is to adapt the frontend to the existing backend response.

#### 5. Un-submit Endpoint (Bug 1.4)

**File**: `apps/api/src/modules/rapor/rapor.controller.ts` + `rapor-nilai.service.ts`

**New Endpoint**: `POST /rapor/nilai/unsubmit`
```typescript
// Body: { kelas_id, mata_pelajaran_id, periode_rapor_id }
// Logic: verify rapor.status == 'draft', then UPDATE rapor_nilai SET status='draft'
//        WHERE raporId AND mataPelajaranId AND guruId
```

**File**: `apps/admin/src/views/RaporInputView.vue`

**Change**: Add "Tarik Kembali (Un-submit)" button visible when `status === 'submitted'` and rapor is not finalized.

#### 6. Audit Trail (Bug 1.5)

**File**: `apps/api/src/modules/rapor/rapor-nilai.service.ts`

**Change**: Inside the transaction in `saveNilai`, after bulk upsert, insert audit records into `rapor_nilai_audit`. For updates, diff old vs new `komponen_nilai`. For inserts, record `old_value = null`.

#### 7. Finalization Transaction + Locking (Bug 1.6)

**File**: `apps/api/src/modules/rapor/rapor-finalization.service.ts`

**Change**: Wrap `finalizeRapor` in `db.transaction()` with `SELECT ... FOR UPDATE` on the rapor row:
```typescript
await this.db.transaction(async (tx) => {
  // SELECT rapor WHERE id = ... FOR UPDATE (pessimistic lock)
  const raporRecord = await tx.execute(
    sql`SELECT id, status FROM rapor WHERE id = ${raporId} FOR UPDATE`
  );
  if (raporRecord.rows[0].status === 'final') {
    throw new BadRequestException('Rapor sudah dalam status final');
  }
  // ... rest of finalization logic using tx
});
```

#### 8. Auto-Save in Frontend (Bug 1.8)

**File**: `apps/admin/src/views/RaporInputView.vue`

**Change**: Add a 30-second interval that triggers `saveNilai('draft')` if `isDirty` flag is true:
```typescript
const isDirty = ref(false);
let autoSaveTimer: number | null = null;

watch(nilaiData, () => { isDirty.value = true; }, { deep: true });

onMounted(() => {
  autoSaveTimer = window.setInterval(() => {
    if (isDirty.value && nilaiData.value.length > 0) {
      saveNilai('draft');
      isDirty.value = false;
    }
  }, 30000);
});

onUnmounted(() => { if (autoSaveTimer) clearInterval(autoSaveTimer); });
```

#### 9. Completeness Validation on Submit (Bug 1.9)

**File**: `apps/api/src/modules/rapor/rapor-nilai.service.ts`

**Change**: When `status === 'submitted'`, query all active students in the kelas and verify every student has an entry in `dto.nilai` with all `is_wajib` komponen filled. Reject with 400 if incomplete.

#### 10. Komponen Per-Mapel Support (Bug 1.10)

**File**: `apps/api/src/modules/rapor/rapor-nilai.service.ts`

**Change**: When fetching komponen in `getKelasGrades` and `saveNilai`, join with `komponen_penilaian_mapel` to filter komponen by the target `mata_pelajaran_id`. Fall back to all tenant komponen if no mapel-specific assignment exists (backward compatible).

#### 11. saveCatatan Persistence (Bug 1.11)

**File**: `apps/api/src/modules/rapor/rapor-wali.service.ts`

**Change**: Replace the no-op in `saveCatatan` with actual DB writes:
```typescript
async saveCatatan(tenantId: string, userId: string, dto: SaveCatatanDto) {
  await this.raporFinalizationService.validateWaliKelas(tenantId, userId, dto.kelas_id);
  
  // Get rapor record
  const raporRecord = await this.getRaporRecord(tenantId, dto.kelas_id, dto.periode_rapor_id);
  
  // Update catatan for each student's rapor_nilai records
  for (const item of dto.catatan) {
    await this.db.update(raporNilai)
      .set({ catatanWaliKelas: item.catatan, updatedAt: new Date() })
      .where(and(
        eq(raporNilai.raporId, raporRecord.id),
        eq(raporNilai.siswaId, item.siswa_id),
        eq(raporNilai.tenantId, tenantId),
      ));
  }
  
  return { saved: dto.catatan.length };
}
```

Also update `SaveCatatanDto` to include `p5_deskripsi` field in `CatatanItem`.

#### 12. Ranking Huruf Conversion (Bug 1.12)

**File**: `apps/api/src/modules/rapor/rapor-finalization.service.ts`

**Change**: In `calculateRankings`, include huruf komponen with numeric conversion:
```typescript
const HURUF_TO_NUMERIC: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, E: 0 };

// Instead of: if (!angkaKomponenIds.has(item.komponen_id)) continue;
// Use:
const def = komponenMap.get(item.komponen_id);
if (!def) continue;

let numVal: number;
if (def.tipe === 'angka') {
  numVal = typeof item.nilai === 'string' ? parseFloat(item.nilai) : item.nilai;
} else if (def.tipe === 'huruf') {
  numVal = HURUF_TO_NUMERIC[String(item.nilai).toUpperCase()] ?? 0;
} else {
  continue; // skip deskripsi
}
```

#### 13. Period Deadline Enforcement (Bug 1.13)

**File**: `apps/api/src/modules/rapor/rapor-nilai.service.ts`

**Change**: In `saveNilai`, after getting/creating the rapor record, check `rapor.deadline`:
```typescript
if (raporRecord.deadline && new Date() > new Date(raporRecord.deadline)) {
  throw new ForbiddenException(
    'Batas waktu input nilai untuk periode ini sudah terlewat.'
  );
}
```

Add admin endpoint to set deadline: `PATCH /rapor/:raporId/deadline` (admin only).

#### 14. Frontend Response Mapping Fix (Bug 1.14)

**File**: `apps/admin/src/views/RaporInputView.vue`

**Change**: Update `fetchNilai` to map the backend response correctly:
```typescript
// The backend GET /rapor/nilai returns KelasGradeResult shape
const { data } = await api.get<{ data: KelasGradeResult }>(`/rapor/nilai?${params.toString()}`);

// Map to frontend's expected structure
nilaiData.value = data.data.students.map(s => ({
  siswa_id: s.siswa_id,
  siswa_nama: s.siswa_nama,
  komponen: s.komponen_nilai ?? data.data.komponen_penilaian.map(k => ({ komponen_id: k.id, nilai: null })),
  capaian_pembelajaran: s.capaian_pembelajaran ?? '',
  status: s.status ?? 'draft',
}));
komponenList.value = data.data.komponen_penilaian;
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing fixes. Confirm or refute root cause analysis.

**Test Plan**: Write integration tests that exercise each bug condition against the unfixed code to observe failures.

**Test Cases**:
1. **DTO Validation Test**: POST `/rapor/nilai` with `periode_rapor_id: "uts_semester_1"` → expect 400 UUID error (will fail on unfixed code with wrong error)
2. **Transaction Atomicity Test**: POST `/rapor/nilai` with 10 students where student 5 has invalid data → expect partial save on unfixed code (demonstrates corruption)
3. **Query Param Mismatch Test**: GET `/rapor/nilai?periode_id=uts_semester_1` → expect undefined periode on unfixed code
4. **Concurrent Finalization Test**: Two simultaneous POST finalize requests → expect both succeed on unfixed code (demonstrates race condition)
5. **saveCatatan Persistence Test**: POST catatan, then GET → expect data missing on unfixed code
6. **Ranking Huruf Test**: Finalize rapor with huruf komponen → expect huruf excluded from rata-rata on unfixed code

**Expected Counterexamples**:
- DTO rejects valid enum string with UUID validation error
- Partial saves observed after mid-loop failure
- Rankings exclude huruf grades entirely
- saveCatatan returns success but data not persisted

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedSystem(input)
  ASSERT expectedBehavior(result)
END FOR
```

Specifically:
- `saveNilai` with enum periode → accepted (Property 1)
- `saveNilai` with mid-failure → 0 records saved (Property 2)
- Frontend `periode_id` → correct data returned (Property 3)
- Un-submit when rapor is draft → status reverted (Property 4)
- Any grade change → audit record exists (Property 5)
- Concurrent finalize → exactly one succeeds (Property 6)
- 40 students → ≤5 queries total (Property 7)
- Auto-save fires after 30s of idle with dirty data (Property 8)
- Submit without all students → rejected (Property 9)
- Komponen filtered by mapel when assignment exists (Property 10)
- saveCatatan → data persisted and retrievable (Property 11)
- Rankings include huruf conversion (Property 12)
- Save after deadline → rejected (Property 13)

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalSystem(input) = fixedSystem(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches regressions that manual unit tests miss
- It provides strong guarantees that non-buggy inputs continue working

**Test Plan**: Observe behavior on UNFIXED code for normal operations (valid saves, valid reads, valid finalizations), then write property-based tests that assert identical behavior after fixes.

**Test Cases**:
1. **UUID Field Preservation**: POST with valid UUIDs for kelas_id, mata_pelajaran_id → same validation behavior
2. **Successful Save Preservation**: POST with all valid data for all students → same `{ saved: N, rapor_id }` result
3. **Finalized Rapor Block Preservation**: POST save when rapor is final → same ForbiddenException
4. **Guru Assignment Check Preservation**: Unassigned guru → same ForbiddenException
5. **Scale Validation Preservation**: Angka outside min-max → same BadRequestException
6. **Invalid Period Preservation**: Unknown period string → same BadRequestException
7. **Wali Kelas Authorization Preservation**: Non-wali finalize → same ForbiddenException

### Unit Tests

- DTO validation: valid enum values accepted, invalid strings rejected, UUID fields still validated
- `saveNilai` transaction: rollback on any failure within the transaction
- `saveNilai` bulk upsert: correct SQL generated, handles ON CONFLICT correctly
- Un-submit endpoint: validates rapor is draft, validates guru owns the submission
- Audit trail: correct diff calculation between old and new values
- Deadline check: respects null deadline (no limit), rejects past deadline
- Komponen per-mapel: falls back to global when no mapel assignment exists
- `saveCatatan`: actually persists to rapor_nilai records
- Ranking calculation: correctly converts A→4, B→3, C→2, D→1, E→0
- Completeness validation: identifies missing students and missing required komponen

### Property-Based Tests

- Generate random valid `InputNilaiDto` payloads and verify they save successfully with transaction atomicity
- Generate random concurrent finalization attempts and verify exactly one succeeds
- Generate random komponen configurations (mix of angka/huruf/deskripsi) and verify ranking includes all non-deskripsi types
- Generate random edit sequences and verify audit trail captures every change
- Generate random student subsets for submit and verify completeness check catches gaps
- Generate random deadline dates and verify enforcement is correct relative to current time

### Integration Tests

- Full flow: guru saves draft → auto-save triggers → guru submits → un-submits → re-submits → wali finalizes
- Concurrent finalization with database-level locking verification
- Frontend-backend round trip: save via frontend → read back → verify data integrity
- Komponen per-mapel: admin configures per-mapel → guru sees filtered komponen → saves correctly
- Catatan persistence: wali saves catatan → finalize → verify catatan visible in rapor export
- Deadline enforcement: admin sets deadline → guru tries to save after deadline → rejected
