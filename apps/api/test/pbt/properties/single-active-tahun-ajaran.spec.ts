/**
 * Property 23: Single Active Tahun Ajaran Per Tenant
 *
 * For any tenant at any point in time, there SHALL be at most one
 * tahun_ajaran with status `aktif`. Activating a new tahun_ajaran
 * SHALL deactivate the previously active one atomically.
 *
 * **Validates: Requirements 17.7, 17.8**
 *
 * This is a PURE property test — tests the LOGIC, not integration with DB.
 * We simulate the activation function and verify the invariant holds
 * across arbitrary inputs.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryTahunAjaran, type TahunAjaranData } from '../arbitraries/tahun-ajaran';
import { arbitraryUuid } from '../arbitraries/common';

// ─── Domain Types ─────────────────────────────────────────────────────────────

type TahunAjaranStatus = 'disiapkan' | 'aktif' | 'nonaktif';

interface TahunAjaranRecord {
  id: string;
  tenant_id: string;
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  status: TahunAjaranStatus;
}

// ─── Core Logic Under Test ────────────────────────────────────────────────────

/**
 * Validates that a list of tahun_ajaran records for a single tenant
 * satisfies the single-active invariant: at most one is 'aktif'.
 */
function validateSingleActiveInvariant(records: TahunAjaranRecord[]): boolean {
  const activeCount = records.filter((r) => r.status === 'aktif').length;
  return activeCount <= 1;
}

/**
 * Simulates the activation of a tahun_ajaran within a tenant.
 * This mirrors the service-layer logic:
 * 1. Deactivate the currently active tahun_ajaran (set to 'nonaktif')
 * 2. Set the target tahun_ajaran to 'aktif'
 *
 * Returns the updated list of records.
 */
function activateTahunAjaran(records: TahunAjaranRecord[], targetId: string): TahunAjaranRecord[] {
  return records.map((r) => {
    if (r.id === targetId) {
      return { ...r, status: 'aktif' as TahunAjaranStatus };
    }
    if (r.status === 'aktif') {
      return { ...r, status: 'nonaktif' as TahunAjaranStatus };
    }
    return r;
  });
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a list of tahun_ajaran records for a single tenant
 * with valid statuses. May start with zero or one 'aktif'.
 */
function arbitraryTahunAjaranList(tenantId: string): fc.Arbitrary<TahunAjaranRecord[]> {
  const statuses: TahunAjaranStatus[] = ['disiapkan', 'aktif', 'nonaktif'];

  return fc.array(
    fc.record({
      id: arbitraryUuid(),
      tenant_id: fc.constant(tenantId),
      nama: fc.constantFrom('2023/2024', '2024/2025', '2025/2026', '2026/2027', '2027/2028'),
      tanggal_mulai: fc.constant('2024-07-15'),
      tanggal_selesai: fc.constant('2025-06-13'),
      status: fc.constantFrom(...statuses),
    }),
    { minLength: 1, maxLength: 10 },
  );
}

/**
 * Generates a list of tahun_ajaran records guaranteed to have
 * at most one 'aktif' (a valid starting state).
 */
function arbitraryValidTahunAjaranList(tenantId: string): fc.Arbitrary<TahunAjaranRecord[]> {
  return fc
    .array(
      fc.record({
        id: arbitraryUuid(),
        tenant_id: fc.constant(tenantId),
        nama: fc.constantFrom('2023/2024', '2024/2025', '2025/2026', '2026/2027', '2027/2028'),
        tanggal_mulai: fc.constant('2024-07-15'),
        tanggal_selesai: fc.constant('2025-06-13'),
        status: fc.constantFrom<TahunAjaranStatus>('disiapkan', 'nonaktif'),
      }),
      { minLength: 1, maxLength: 10 },
    )
    .chain((records) =>
      // Optionally set one record as 'aktif'
      fc.boolean().map((hasActive) => {
        if (!hasActive || records.length === 0) return records;
        const idx = 0; // deterministic: first element is active
        return records.map((r, i) =>
          i === idx ? { ...r, status: 'aktif' as TahunAjaranStatus } : r,
        );
      }),
    );
}

/**
 * Generates a valid list with an index pointing to a 'disiapkan' record
 * that can be activated.
 */
function arbitraryActivationScenario(
  tenantId: string,
): fc.Arbitrary<{ records: TahunAjaranRecord[]; targetIdx: number }> {
  return arbitraryValidTahunAjaranList(tenantId)
    .filter((records) => records.some((r) => r.status === 'disiapkan'))
    .map((records) => {
      const disiapkanIndices = records
        .map((r, i) => (r.status === 'disiapkan' ? i : -1))
        .filter((i) => i >= 0);
      // Pick the first 'disiapkan' record as target
      return { records, targetIdx: disiapkanIndices[0] };
    });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 23: Single Active Tahun Ajaran Per Tenant', () => {
  describe('Invariant: at most one aktif per tenant', () => {
    it('given any list of tahun_ajaran records for a tenant, at most one should have status aktif after validation', () => {
      fc.assert(
        fc.property(
          arbitraryUuid().chain((tenantId) => arbitraryValidTahunAjaranList(tenantId)),
          (records) => {
            // PROPERTY: a valid state always has at most one 'aktif'
            return validateSingleActiveInvariant(records);
          },
        ),
        PBT_CONFIG,
      );
    });

    it('detects invalid state when multiple records are aktif', () => {
      fc.assert(
        fc.property(
          arbitraryUuid().chain((tenantId) =>
            fc.array(
              fc.record({
                id: arbitraryUuid(),
                tenant_id: fc.constant(tenantId),
                nama: fc.constantFrom('2023/2024', '2024/2025', '2025/2026'),
                tanggal_mulai: fc.constant('2024-07-15'),
                tanggal_selesai: fc.constant('2025-06-13'),
                status: fc.constant<TahunAjaranStatus>('aktif'),
              }),
              { minLength: 2, maxLength: 5 },
            ),
          ),
          (records) => {
            // PROPERTY: if 2+ records are 'aktif', invariant is violated
            return !validateSingleActiveInvariant(records);
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Activation function: exactly one aktif after activation', () => {
    it('after activating a tahun_ajaran, exactly one record has status aktif', () => {
      fc.assert(
        fc.property(
          arbitraryUuid().chain((tenantId) => arbitraryActivationScenario(tenantId)),
          ({ records, targetIdx }) => {
            const targetId = records[targetIdx].id;
            const updatedRecords = activateTahunAjaran(records, targetId);

            // PROPERTY: after activation, exactly one is 'aktif'
            const activeCount = updatedRecords.filter((r) => r.status === 'aktif').length;
            return activeCount === 1;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('after activation, the activated record is the one that was targeted', () => {
      fc.assert(
        fc.property(
          arbitraryUuid().chain((tenantId) => arbitraryActivationScenario(tenantId)),
          ({ records, targetIdx }) => {
            const targetId = records[targetIdx].id;
            const updatedRecords = activateTahunAjaran(records, targetId);

            // PROPERTY: the target record is now aktif
            const targetRecord = updatedRecords.find((r) => r.id === targetId);
            return targetRecord !== undefined && targetRecord.status === 'aktif';
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Activation deactivates the previously active one', () => {
    it('the previously active tahun_ajaran is set to nonaktif after a new activation', () => {
      fc.assert(
        fc.property(
          arbitraryUuid().chain((tenantId) =>
            arbitraryActivationScenario(tenantId).filter(({ records }) =>
              records.some((r) => r.status === 'aktif'),
            ),
          ),
          ({ records, targetIdx }) => {
            const previouslyActive = records.find((r) => r.status === 'aktif');
            const targetId = records[targetIdx].id;

            // Skip if target is already the active one (no-op scenario)
            if (previouslyActive && previouslyActive.id === targetId) return true;

            const updatedRecords = activateTahunAjaran(records, targetId);

            // PROPERTY: the previously active record is now 'nonaktif'
            if (previouslyActive) {
              const previousInUpdated = updatedRecords.find((r) => r.id === previouslyActive.id);
              return previousInUpdated !== undefined && previousInUpdated.status === 'nonaktif';
            }
            return true;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('activating when no current aktif exists just sets the target to aktif without side effects', () => {
      fc.assert(
        fc.property(
          arbitraryUuid().chain((tenantId) =>
            arbitraryActivationScenario(tenantId).filter(
              ({ records }) => !records.some((r) => r.status === 'aktif'),
            ),
          ),
          ({ records, targetIdx }) => {
            const targetId = records[targetIdx].id;
            const updatedRecords = activateTahunAjaran(records, targetId);

            // PROPERTY: only the target record changed
            const activeCount = updatedRecords.filter((r) => r.status === 'aktif').length;
            const targetIsActive =
              updatedRecords.find((r) => r.id === targetId)?.status === 'aktif';

            // Other records unchanged
            const otherRecordsUnchanged = updatedRecords
              .filter((r) => r.id !== targetId)
              .every((r, i) => {
                const original = records.filter((orig) => orig.id !== targetId)[i];
                return original && r.status === original.status;
              });

            return activeCount === 1 && targetIsActive && otherRecordsUnchanged;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('repeated activations of different records always maintain the single-active invariant', () => {
      fc.assert(
        fc.property(
          arbitraryUuid().chain((tenantId) =>
            fc.tuple(
              arbitraryValidTahunAjaranList(tenantId).filter(
                (records) => records.filter((r) => r.status === 'disiapkan').length >= 2,
              ),
              fc.nat({ max: 5 }),
            ),
          ),
          ([records, activationCount]) => {
            const disiapkanIds = records.filter((r) => r.status === 'disiapkan').map((r) => r.id);

            if (disiapkanIds.length === 0) return true;

            let currentRecords = [...records];
            // Perform multiple activations
            for (let i = 0; i <= activationCount && i < disiapkanIds.length; i++) {
              currentRecords = activateTahunAjaran(currentRecords, disiapkanIds[i]);
              // PROPERTY: after every activation, invariant holds
              if (!validateSingleActiveInvariant(currentRecords)) {
                return false;
              }
            }
            return true;
          },
        ),
        PBT_CONFIG,
      );
    });
  });
});
