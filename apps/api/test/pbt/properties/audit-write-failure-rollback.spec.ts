/**
 * Property 8: Audit write failure causes operation rollback for sensitive entities
 *
 * For any sensitive entity operation (Tagihan, Pembayaran, User create/update/deactivate,
 * Role assignment change) where the audit_logs INSERT fails, the original entity modification
 * SHALL be rolled back — the entity's state in the database SHALL remain unchanged from
 * before the operation was attempted.
 *
 * **Validates: Requirements 5.7**
 *
 * Properties verified:
 * 1. When strictMode=true AND audit write fails → entity state remains unchanged
 * 2. When strictMode=true AND audit write succeeds → entity state reflects the modification
 * 3. When strictMode=false AND audit write fails → entity state still reflects the modification
 * 4. When strictMode=false AND audit write succeeds → entity state reflects the modification
 * 5. For any sensitive entity type, strict mode failure always causes rollback
 *
 * Pure logic testing — simulates transactional behavior of the audit system.
 *
 * Feature: superadmin-cross-tenant-access, Property 8: Audit write failure causes operation rollback for sensitive entities
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Sensitive entity types subject to strict audit rollback */
const SENSITIVE_ENTITY_TYPES = ['tagihan', 'pembayaran', 'user', 'role_assignment'] as const;
type SensitiveEntityType = (typeof SENSITIVE_ENTITY_TYPES)[number];

/** Operations that can be performed on sensitive entities */
const SENSITIVE_OPERATIONS = ['update', 'delete', 'deactivate', 'activate', 'role_change'] as const;
type SensitiveOperation = (typeof SENSITIVE_OPERATIONS)[number];

interface EntityState {
  id: string;
  name: string;
  status: string;
  amount: number;
  tenant_id: string;
  [key: string]: unknown;
}

interface EntityModification {
  operation: SensitiveOperation;
  changes: Partial<EntityState>;
}

interface AuditWriteAttempt {
  entityType: SensitiveEntityType;
  operation: SensitiveOperation;
  entityId: string;
  strictMode: boolean;
  auditWriteSucceeds: boolean;
}

// ─── Simulated Transactional Entity Store ─────────────────────────────────────

/**
 * Simulates a database with transaction support.
 * Mirrors the behavior described in the AuditInterceptor:
 * - beginTransaction() starts a new transaction
 * - commit() persists pending changes
 * - rollback() discards pending changes
 */
class TransactionalEntityStore {
  private committed: Map<string, EntityState> = new Map();
  private pending: Map<string, EntityState> = new Map();

  constructor(initialEntities?: Map<string, EntityState>) {
    if (initialEntities) {
      this.committed = new Map(initialEntities);
    }
  }

  beginTransaction(): void {
    this.pending = new Map(this.committed);
  }

  commit(): void {
    this.committed = new Map(this.pending);
  }

  rollback(): void {
    this.pending = new Map(this.committed);
  }

  update(id: string, changes: Partial<EntityState>): boolean {
    const entity = this.pending.get(id);
    if (!entity) return false;
    this.pending.set(id, { ...entity, ...changes });
    return true;
  }

  delete(id: string): boolean {
    return this.pending.delete(id);
  }

  getCommitted(id: string): EntityState | undefined {
    const entity = this.committed.get(id);
    return entity ? { ...entity } : undefined;
  }

  getPending(id: string): EntityState | undefined {
    const entity = this.pending.get(id);
    return entity ? { ...entity } : undefined;
  }

  getAllCommitted(): Map<string, EntityState> {
    return new Map(this.committed);
  }
}

// ─── Simulated Audit-Aware Operation Executor ─────────────────────────────────

/**
 * Simulates the behavior of the AuditInterceptor combined with a service operation:
 * 1. Begin transaction
 * 2. Apply entity modification
 * 3. Attempt audit write
 * 4. If strictMode=true and audit fails → rollback
 * 5. If strictMode=false and audit fails → commit anyway (log warning)
 * 6. If audit succeeds → commit
 */
function executeOperationWithAudit(
  store: TransactionalEntityStore,
  entityId: string,
  modification: EntityModification,
  auditAttempt: AuditWriteAttempt,
): { committed: boolean; error?: string } {
  store.beginTransaction();

  // Apply the entity modification
  let modificationApplied = false;
  switch (modification.operation) {
    case 'delete':
      modificationApplied = store.delete(entityId);
      break;
    case 'deactivate':
      modificationApplied = store.update(entityId, { status: 'inactive' });
      break;
    case 'activate':
      modificationApplied = store.update(entityId, { status: 'active' });
      break;
    case 'role_change':
    case 'update':
      modificationApplied = store.update(entityId, modification.changes);
      break;
  }

  if (!modificationApplied) {
    store.rollback();
    return { committed: false, error: 'Entity not found' };
  }

  // Attempt audit write
  if (!auditAttempt.auditWriteSucceeds) {
    // Audit write failed
    if (auditAttempt.strictMode) {
      // strictMode=true: rollback the operation
      store.rollback();
      return {
        committed: false,
        error: 'Operasi tidak dapat diselesaikan karena pencatatan audit gagal',
      };
    } else {
      // strictMode=false: commit anyway, just log warning
      store.commit();
      return { committed: true };
    }
  }

  // Audit write succeeded — commit
  store.commit();
  return { committed: true };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

function arbitrarySensitiveEntityType(): fc.Arbitrary<SensitiveEntityType> {
  return fc.constantFrom(...SENSITIVE_ENTITY_TYPES);
}

function arbitrarySensitiveOperation(): fc.Arbitrary<SensitiveOperation> {
  return fc.constantFrom(...SENSITIVE_OPERATIONS);
}

function arbitraryEntityState(): fc.Arbitrary<EntityState> {
  return fc.record({
    id: arbitraryUuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    status: fc.constantFrom('active', 'inactive', 'pending'),
    amount: fc.integer({ min: 0, max: 10_000_000 }),
    tenant_id: arbitraryUuid(),
  });
}

function arbitraryModification(operation: SensitiveOperation): fc.Arbitrary<EntityModification> {
  const changesArbitrary = fc.record(
    {
      name: fc.string({ minLength: 1, maxLength: 50 }),
      status: fc.constantFrom('active', 'inactive', 'pending'),
      amount: fc.integer({ min: 0, max: 10_000_000 }),
    },
    { requiredKeys: [] },
  );

  return changesArbitrary.map((changes) => ({
    operation,
    changes: Object.keys(changes).length === 0 ? { name: 'modified' } : changes,
  }));
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 8: Audit write failure causes operation rollback for sensitive entities', () => {
  it('strictMode=true AND audit write fails → entity state remains unchanged (committed state equals initial state)', () => {
    fc.assert(
      fc.property(
        arbitraryEntityState(),
        arbitrarySensitiveOperation(),
        arbitrarySensitiveEntityType(),
        (initialEntity, operation, entityType) => {
          const initialMap = new Map<string, EntityState>([[initialEntity.id, initialEntity]]);
          const store = new TransactionalEntityStore(initialMap);

          const modification: EntityModification = {
            operation,
            changes: { name: 'modified-name', amount: initialEntity.amount + 1000 },
          };

          const auditAttempt: AuditWriteAttempt = {
            entityType,
            operation,
            entityId: initialEntity.id,
            strictMode: true,
            auditWriteSucceeds: false,
          };

          const result = executeOperationWithAudit(
            store,
            initialEntity.id,
            modification,
            auditAttempt,
          );

          // PROPERTY: operation should NOT be committed
          if (result.committed) return false;

          // PROPERTY: for non-delete operations, entity state should be unchanged
          if (operation !== 'delete') {
            const currentState = store.getCommitted(initialEntity.id);
            if (!currentState) return false;
            return JSON.stringify(currentState) === JSON.stringify(initialEntity);
          }

          // PROPERTY: for delete operations, entity should still exist
          const currentState = store.getCommitted(initialEntity.id);
          return currentState !== undefined;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('strictMode=true AND audit write succeeds → entity state reflects the modification', () => {
    fc.assert(
      fc.property(
        arbitraryEntityState(),
        arbitrarySensitiveOperation(),
        arbitrarySensitiveEntityType(),
        fc.record(
          {
            name: fc.string({ minLength: 1, maxLength: 50 }),
            amount: fc.integer({ min: 0, max: 10_000_000 }),
          },
          { requiredKeys: ['name'] },
        ),
        (initialEntity, operation, entityType, changes) => {
          const initialMap = new Map<string, EntityState>([[initialEntity.id, initialEntity]]);
          const store = new TransactionalEntityStore(initialMap);

          const modification: EntityModification = { operation, changes };

          const auditAttempt: AuditWriteAttempt = {
            entityType,
            operation,
            entityId: initialEntity.id,
            strictMode: true,
            auditWriteSucceeds: true,
          };

          const result = executeOperationWithAudit(
            store,
            initialEntity.id,
            modification,
            auditAttempt,
          );

          // PROPERTY: operation should be committed
          if (!result.committed) return false;

          // PROPERTY: entity state should reflect the modification
          if (operation === 'delete') {
            return store.getCommitted(initialEntity.id) === undefined;
          }

          const currentState = store.getCommitted(initialEntity.id);
          if (!currentState) return false;

          if (operation === 'deactivate') {
            return currentState.status === 'inactive';
          }
          if (operation === 'activate') {
            return currentState.status === 'active';
          }

          // For update/role_change, check that changes were applied
          for (const [key, value] of Object.entries(changes)) {
            if (currentState[key] !== value) return false;
          }
          return true;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('strictMode=false AND audit write fails → entity state still reflects the modification (no rollback)', () => {
    fc.assert(
      fc.property(
        arbitraryEntityState(),
        arbitrarySensitiveOperation(),
        arbitrarySensitiveEntityType(),
        fc.record(
          {
            name: fc.string({ minLength: 1, maxLength: 50 }),
            amount: fc.integer({ min: 0, max: 10_000_000 }),
          },
          { requiredKeys: ['name'] },
        ),
        (initialEntity, operation, entityType, changes) => {
          const initialMap = new Map<string, EntityState>([[initialEntity.id, initialEntity]]);
          const store = new TransactionalEntityStore(initialMap);

          const modification: EntityModification = { operation, changes };

          const auditAttempt: AuditWriteAttempt = {
            entityType,
            operation,
            entityId: initialEntity.id,
            strictMode: false,
            auditWriteSucceeds: false,
          };

          const result = executeOperationWithAudit(
            store,
            initialEntity.id,
            modification,
            auditAttempt,
          );

          // PROPERTY: operation SHOULD be committed even though audit failed
          if (!result.committed) return false;

          // PROPERTY: entity state reflects the modification
          if (operation === 'delete') {
            return store.getCommitted(initialEntity.id) === undefined;
          }

          const currentState = store.getCommitted(initialEntity.id);
          if (!currentState) return false;

          if (operation === 'deactivate') {
            return currentState.status === 'inactive';
          }
          if (operation === 'activate') {
            return currentState.status === 'active';
          }

          for (const [key, value] of Object.entries(changes)) {
            if (currentState[key] !== value) return false;
          }
          return true;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('strictMode=false AND audit write succeeds → entity state reflects the modification', () => {
    fc.assert(
      fc.property(
        arbitraryEntityState(),
        arbitrarySensitiveOperation(),
        arbitrarySensitiveEntityType(),
        fc.record(
          {
            name: fc.string({ minLength: 1, maxLength: 50 }),
            amount: fc.integer({ min: 0, max: 10_000_000 }),
          },
          { requiredKeys: ['name'] },
        ),
        (initialEntity, operation, entityType, changes) => {
          const initialMap = new Map<string, EntityState>([[initialEntity.id, initialEntity]]);
          const store = new TransactionalEntityStore(initialMap);

          const modification: EntityModification = { operation, changes };

          const auditAttempt: AuditWriteAttempt = {
            entityType,
            operation,
            entityId: initialEntity.id,
            strictMode: false,
            auditWriteSucceeds: true,
          };

          const result = executeOperationWithAudit(
            store,
            initialEntity.id,
            modification,
            auditAttempt,
          );

          // PROPERTY: operation should be committed
          if (!result.committed) return false;

          if (operation === 'delete') {
            return store.getCommitted(initialEntity.id) === undefined;
          }

          const currentState = store.getCommitted(initialEntity.id);
          if (!currentState) return false;

          if (operation === 'deactivate') {
            return currentState.status === 'inactive';
          }
          if (operation === 'activate') {
            return currentState.status === 'active';
          }

          for (const [key, value] of Object.entries(changes)) {
            if (currentState[key] !== value) return false;
          }
          return true;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('for any sensitive entity type (tagihan, pembayaran, user, role_assignment), strict mode failure always causes rollback', () => {
    fc.assert(
      fc.property(
        arbitrarySensitiveEntityType(),
        arbitrarySensitiveOperation(),
        arbitraryEntityState(),
        (entityType, operation, initialEntity) => {
          const initialMap = new Map<string, EntityState>([[initialEntity.id, initialEntity]]);
          const store = new TransactionalEntityStore(initialMap);

          const modification: EntityModification = {
            operation,
            changes: { name: 'changed', status: 'inactive', amount: 999 },
          };

          const auditAttempt: AuditWriteAttempt = {
            entityType,
            operation,
            entityId: initialEntity.id,
            strictMode: true,
            auditWriteSucceeds: false,
          };

          const result = executeOperationWithAudit(
            store,
            initialEntity.id,
            modification,
            auditAttempt,
          );

          // PROPERTY: regardless of entity type, strict mode + audit failure = rollback
          if (result.committed) return false;

          // PROPERTY: entity is unchanged in committed state
          const currentState = store.getCommitted(initialEntity.id);
          if (!currentState) return false;
          return JSON.stringify(currentState) === JSON.stringify(initialEntity);
        },
      ),
      PBT_CONFIG,
    );
  });
});
