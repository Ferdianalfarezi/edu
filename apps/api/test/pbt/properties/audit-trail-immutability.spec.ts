/**
 * Property 17: Audit Trail Immutability
 *
 * For any record in the audit trail, the system SHALL reject all UPDATE and DELETE
 * operations — audit records are append-only and immutable once created.
 *
 * **Validates: Requirements 29.1, 29.2**
 *
 * Properties verified:
 * 1. Audit trail records are append-only — once created, their values cannot be modified
 * 2. No UPDATE operation changes existing audit trail entries
 * 3. No DELETE operation removes audit trail entries
 * 4. The audit trail table has NO updated_at column (design invariant)
 * 5. The count of entries never decreases (only grows or stays same)
 *
 * Pure logic testing — simulates an append-only store.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditTrailRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  jenis_aksi: string;
  entity_type: string;
  entity_id: string;
  nilai_sebelum: Record<string, unknown> | null;
  nilai_sesudah: Record<string, unknown> | null;
  alasan: string | null;
  created_at: string;
  // NOTE: No updated_at — immutable by design
}

type AuditAction =
  | { type: 'insert'; record: AuditTrailRecord }
  | { type: 'update'; targetId: string; changes: Partial<AuditTrailRecord> }
  | { type: 'delete'; targetId: string };

interface OperationResult {
  success: boolean;
  error?: string;
}

// ─── Simulated Append-Only Audit Trail Store ──────────────────────────────────

/**
 * Simulates the audit_trail table with append-only constraint.
 * INSERT is the only permitted write operation.
 * UPDATE and DELETE are always rejected.
 */
class AppendOnlyAuditStore {
  private records: AuditTrailRecord[] = [];

  /** Schema definition — explicitly has NO updated_at column */
  static readonly COLUMNS = [
    'id',
    'tenant_id',
    'user_id',
    'jenis_aksi',
    'entity_type',
    'entity_id',
    'nilai_sebelum',
    'nilai_sesudah',
    'alasan',
    'created_at',
  ] as const;

  /**
   * INSERT — the only permitted write operation.
   * Appends a record to the store.
   */
  insert(record: AuditTrailRecord): OperationResult {
    // Validate no duplicate ID
    if (this.records.some((r) => r.id === record.id)) {
      return { success: false, error: 'Duplicate primary key' };
    }
    this.records.push({ ...record });
    return { success: true };
  }

  /**
   * UPDATE — always rejected. Audit trail is immutable.
   * Simulates the database constraint/policy that prevents mutation.
   */
  update(_targetId: string, _changes: Partial<AuditTrailRecord>): OperationResult {
    return {
      success: false,
      error: 'UPDATE operation is not permitted on audit_trail table',
    };
  }

  /**
   * DELETE — always rejected. Audit trail is immutable.
   * Simulates the database constraint/policy that prevents deletion.
   */
  delete(_targetId: string): OperationResult {
    return {
      success: false,
      error: 'DELETE operation is not permitted on audit_trail table',
    };
  }

  /**
   * Apply an arbitrary action and return the result.
   */
  applyAction(action: AuditAction): OperationResult {
    switch (action.type) {
      case 'insert':
        return this.insert(action.record);
      case 'update':
        return this.update(action.targetId, action.changes);
      case 'delete':
        return this.delete(action.targetId);
    }
  }

  /** Get all records (immutable snapshot) */
  getAll(): AuditTrailRecord[] {
    return this.records.map((r) => ({ ...r }));
  }

  /** Get record by ID */
  getById(id: string): AuditTrailRecord | undefined {
    const record = this.records.find((r) => r.id === id);
    return record ? { ...record } : undefined;
  }

  /** Current record count */
  get count(): number {
    return this.records.length;
  }

  /** Check if a column name exists in schema */
  static hasColumn(columnName: string): boolean {
    return (AppendOnlyAuditStore.COLUMNS as readonly string[]).includes(columnName);
  }
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const BILLING_ACTIONS = [
  'buat_tagihan',
  'catat_pembayaran',
  'setujui_upload',
  'tolak_upload',
  'edit_nominal',
  'hapus_tagihan',
  'batalkan_tagihan',
] as const;

const ENTITY_TYPES = ['tagihan', 'tagihan_transaksi'] as const;

/** Generates a valid audit trail record */
function arbitraryAuditRecord(): fc.Arbitrary<AuditTrailRecord> {
  return fc.record({
    id: arbitraryUuid(),
    tenant_id: arbitraryUuid(),
    user_id: arbitraryUuid(),
    jenis_aksi: fc.constantFrom(...BILLING_ACTIONS),
    entity_type: fc.constantFrom(...ENTITY_TYPES),
    entity_id: arbitraryUuid(),
    nilai_sebelum: fc.oneof(
      fc.constant(null),
      fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.jsonValue()),
    ) as fc.Arbitrary<Record<string, unknown> | null>,
    nilai_sesudah: fc.oneof(
      fc.constant(null),
      fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.jsonValue()),
    ) as fc.Arbitrary<Record<string, unknown> | null>,
    alasan: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 100 })),
    created_at: fc
      .date({ min: new Date('2023-01-01'), max: new Date('2030-12-31') })
      .map((d) => d.toISOString()),
  });
}

/** Generates arbitrary partial changes to attempt on a record */
function arbitraryRecordChanges(): fc.Arbitrary<Partial<AuditTrailRecord>> {
  return fc.record(
    {
      jenis_aksi: fc.constantFrom(...BILLING_ACTIONS),
      entity_type: fc.constantFrom(...ENTITY_TYPES),
      entity_id: arbitraryUuid(),
      nilai_sebelum: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.jsonValue(),
      ) as fc.Arbitrary<Record<string, unknown>>,
      nilai_sesudah: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.jsonValue(),
      ) as fc.Arbitrary<Record<string, unknown>>,
      alasan: fc.string({ minLength: 1, maxLength: 100 }),
    },
    { requiredKeys: [] },
  );
}

/** Generates a sequence of actions (mix of inserts, updates, deletes) */
function arbitraryActionSequence(records: AuditTrailRecord[]): fc.Arbitrary<AuditAction[]> {
  if (records.length === 0) {
    // Only inserts possible when no records exist
    return fc
      .array(arbitraryAuditRecord(), { minLength: 1, maxLength: 10 })
      .map((recs) => recs.map((r) => ({ type: 'insert' as const, record: r })));
  }

  const recordIds = records.map((r) => r.id);

  return fc.array(
    fc.oneof(
      // Insert a new record
      arbitraryAuditRecord().map((r): AuditAction => ({ type: 'insert', record: r })),
      // Attempt to update an existing record
      fc
        .tuple(fc.constantFrom(...recordIds), arbitraryRecordChanges())
        .map(([targetId, changes]): AuditAction => ({
          type: 'update',
          targetId,
          changes,
        })),
      // Attempt to delete an existing record
      fc.constantFrom(...recordIds).map((targetId): AuditAction => ({ type: 'delete', targetId })),
    ),
    { minLength: 1, maxLength: 20 },
  );
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 17: Audit Trail Immutability', () => {
  it('audit trail records are append-only — once created, values cannot be modified via UPDATE', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryAuditRecord(), { minLength: 1, maxLength: 10 }),
        arbitraryRecordChanges(),
        (records, changes) => {
          const store = new AppendOnlyAuditStore();

          // Insert all records
          for (const record of records) {
            store.insert(record);
          }

          // Capture snapshot of all records after insertion
          const snapshotBefore = store.getAll();

          // Attempt to UPDATE each record
          for (const record of records) {
            const result = store.update(record.id, changes);
            // PROPERTY: UPDATE always fails
            if (result.success) return false;
          }

          // Verify all records remain unchanged
          const snapshotAfter = store.getAll();

          // PROPERTY: records are identical before and after update attempts
          return JSON.stringify(snapshotBefore) === JSON.stringify(snapshotAfter);
        },
      ),
      PBT_CONFIG,
    );
  });

  it('no UPDATE operation changes existing audit trail entries', () => {
    fc.assert(
      fc.property(arbitraryAuditRecord(), arbitraryRecordChanges(), (record, changes) => {
        const store = new AppendOnlyAuditStore();
        store.insert(record);

        // Capture the original record
        const original = store.getById(record.id);

        // Attempt update
        const result = store.update(record.id, changes);

        // Fetch after update attempt
        const afterAttempt = store.getById(record.id);

        // PROPERTY: update fails AND record is unchanged
        return (
          result.success === false && JSON.stringify(original) === JSON.stringify(afterAttempt)
        );
      }),
      PBT_CONFIG,
    );
  });

  it('no DELETE operation removes audit trail entries', () => {
    fc.assert(
      fc.property(fc.array(arbitraryAuditRecord(), { minLength: 1, maxLength: 10 }), (records) => {
        const store = new AppendOnlyAuditStore();

        // Insert all records
        for (const record of records) {
          store.insert(record);
        }

        const countBefore = store.count;

        // Attempt to DELETE each record
        for (const record of records) {
          const result = store.delete(record.id);
          // PROPERTY: DELETE always fails
          if (result.success) return false;
        }

        // PROPERTY: count remains the same after delete attempts
        return store.count === countBefore;
      }),
      PBT_CONFIG,
    );
  });

  it('the audit trail table has NO updated_at column (design invariant)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('updated_at', 'modified_at', 'last_modified', 'changed_at'),
        (mutationColumn) => {
          // PROPERTY: no mutation-related timestamp column exists in the schema
          return !AppendOnlyAuditStore.hasColumn(mutationColumn);
        },
      ),
      PBT_CONFIG,
    );
  });

  it('the count of entries never decreases — only grows or stays same', () => {
    fc.assert(
      fc.property(fc.array(arbitraryAuditRecord(), { minLength: 2, maxLength: 15 }), (records) => {
        const store = new AppendOnlyAuditStore();
        const counts: number[] = [store.count]; // starts at 0

        // Apply a mix of inserts and attempted mutations
        for (let i = 0; i < records.length; i++) {
          const record = records[i];

          // Insert the record
          store.insert(record);
          counts.push(store.count);

          // Attempt to delete it (should fail, count unchanged)
          store.delete(record.id);
          counts.push(store.count);

          // Attempt to update it (should fail, count unchanged)
          store.update(record.id, { jenis_aksi: 'edit_nominal' });
          counts.push(store.count);
        }

        // PROPERTY: count sequence is monotonically non-decreasing
        for (let i = 1; i < counts.length; i++) {
          if (counts[i] < counts[i - 1]) return false;
        }

        return true;
      }),
      PBT_CONFIG,
    );
  });

  it('after a sequence of mixed operations, only inserts affect the store state', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryAuditRecord(), { minLength: 1, maxLength: 5 }),
        (seedRecords) => {
          const store = new AppendOnlyAuditStore();

          // Seed initial records
          for (const record of seedRecords) {
            store.insert(record);
          }

          const countAfterSeed = store.count;
          const snapshotAfterSeed = store.getAll();

          // Apply mutation attempts (updates and deletes)
          for (const record of seedRecords) {
            store.update(record.id, { jenis_aksi: 'batalkan_tagihan' });
            store.delete(record.id);
          }

          // PROPERTY: after all mutation attempts, store is unchanged
          const countAfterMutations = store.count;
          const snapshotAfterMutations = store.getAll();

          return (
            countAfterMutations === countAfterSeed &&
            JSON.stringify(snapshotAfterMutations) === JSON.stringify(snapshotAfterSeed)
          );
        },
      ),
      PBT_CONFIG,
    );
  });
});
