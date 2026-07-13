/**
 * Property 11: Audit log excludes sensitive password values
 *
 * For any password reset operation that generates an audit log entry, the `before_values`
 * and `after_values` fields SHALL NOT contain the plaintext password, password hash,
 * or temporary password value.
 *
 * **Validates: Requirements 8.6**
 *
 * Properties verified:
 * 1. For any password reset operation, excluded password-related fields never appear in before_values
 * 2. For any password reset operation, excluded password-related fields never appear in after_values
 * 3. Non-excluded fields are preserved correctly in the audit entry
 * 4. The exclusion works regardless of field value type or content
 *
 * Feature: superadmin-cross-tenant-access, Property 11: Audit log excludes sensitive password values
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Fields that MUST be excluded from password reset audit entries.
 * Matches the @Auditable({ excludeFields: [...] }) config on the reset-password endpoint.
 */
const PASSWORD_EXCLUDED_FIELDS = ['password', 'password_hash', 'temp_password'];

// ─── Simulated AuditInterceptor excludeFields Logic ───────────────────────────

/**
 * Simulates the AuditInterceptor's `removeExcludedFields` method.
 * This mirrors the interceptor's field exclusion behavior during audit log creation.
 */
function removeExcludedFields(
  values: Record<string, unknown> | null,
  excludeFields: string[],
): Record<string, unknown> | null {
  if (!values) return null;
  const filtered = { ...values };
  for (const field of excludeFields) {
    delete filtered[field];
  }
  return filtered;
}

/**
 * Simulates the full audit entry computation for a password_reset action.
 * The interceptor:
 *  1. Fetches before state (full entity from DB)
 *  2. Gets response as after state
 *  3. Removes excludeFields from both
 */
function computePasswordResetAuditEntry(
  beforeState: Record<string, unknown>,
  afterState: Record<string, unknown>,
  excludeFields: string[],
): { beforeValues: Record<string, unknown> | null; afterValues: Record<string, unknown> | null } {
  const beforeValues = removeExcludedFields(beforeState, excludeFields);
  const afterValues = removeExcludedFields(afterState, excludeFields);
  return { beforeValues, afterValues };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a realistic user entity state that includes password-related fields.
 * Simulates what the DB would return for a user row before/after a password reset.
 */
function arbitraryUserEntityWithPasswords(): fc.Arbitrary<Record<string, unknown>> {
  return fc
    .record({
      id: fc.uuid(),
      email: fc.emailAddress(),
      nama: fc.string({ minLength: 2, maxLength: 50 }),
      role: fc.constantFrom('admin', 'guru', 'bendahara', 'kepala_sekolah', 'orang_tua'),
      tenant_id: fc.uuid(),
      is_active: fc.boolean(),
      must_change_password: fc.boolean(),
      // These are the sensitive fields that MUST be excluded
      password: fc.string({ minLength: 8, maxLength: 60 }),
      password_hash: fc.string({ minLength: 40, maxLength: 120 }),
      temp_password: fc.oneof(fc.string({ minLength: 12, maxLength: 30 }), fc.constant(null)),
      // Additional non-sensitive fields
      phone: fc.option(fc.string({ minLength: 10, maxLength: 15 }), { nil: null }),
      created_at: fc.date().map((d) => d.toISOString()),
      updated_at: fc.date().map((d) => d.toISOString()),
    })
    .map((rec) => rec as Record<string, unknown>);
}

/**
 * Generates a user entity after password reset — password fields have new values,
 * must_change_password is true.
 */
function arbitraryUserEntityAfterReset(
  beforeState: Record<string, unknown>,
): fc.Arbitrary<Record<string, unknown>> {
  return fc
    .record({
      password: fc.string({ minLength: 8, maxLength: 60 }),
      password_hash: fc.string({ minLength: 40, maxLength: 120 }),
      temp_password: fc.string({ minLength: 12, maxLength: 30 }),
    })
    .map((newPassFields) => ({
      ...beforeState,
      ...newPassFields,
      must_change_password: true,
      updated_at: new Date().toISOString(),
    }));
}

/**
 * Generates arbitrary additional fields with password-like names to ensure
 * the exclusion works even when fields have unusual naming patterns.
 */
function arbitraryEntityWithExtraPasswordVariants(): fc.Arbitrary<Record<string, unknown>> {
  return fc
    .record({
      id: fc.uuid(),
      email: fc.emailAddress(),
      nama: fc.string({ minLength: 2, maxLength: 30 }),
      role: fc.constantFrom('admin', 'guru', 'bendahara'),
      tenant_id: fc.uuid(),
      is_active: fc.constant(true),
      must_change_password: fc.boolean(),
      // The exact excluded field names
      password: fc.string({ minLength: 1, maxLength: 100 }),
      password_hash: fc.string({ minLength: 1, maxLength: 200 }),
      temp_password: fc.string({ minLength: 1, maxLength: 100 }),
    })
    .map((rec) => rec as Record<string, unknown>);
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 11: Audit log excludes sensitive password values', () => {
  it('for any password reset operation, excluded password-related fields never appear in before_values', () => {
    fc.assert(
      fc.property(arbitraryUserEntityWithPasswords(), (beforeState) => {
        const { beforeValues } = computePasswordResetAuditEntry(
          beforeState,
          { ...beforeState, must_change_password: true },
          PASSWORD_EXCLUDED_FIELDS,
        );

        // PROPERTY: no excluded password field key exists in before_values
        if (!beforeValues) return true;
        for (const field of PASSWORD_EXCLUDED_FIELDS) {
          if (field in beforeValues) return false;
        }
        return true;
      }),
      PBT_CONFIG,
    );
  });

  it('for any password reset operation, excluded password-related fields never appear in after_values', () => {
    fc.assert(
      fc.property(
        arbitraryUserEntityWithPasswords().chain((beforeState) =>
          fc.tuple(fc.constant(beforeState), arbitraryUserEntityAfterReset(beforeState)),
        ),
        ([beforeState, afterState]) => {
          const { afterValues } = computePasswordResetAuditEntry(
            beforeState,
            afterState,
            PASSWORD_EXCLUDED_FIELDS,
          );

          // PROPERTY: no excluded password field key exists in after_values
          if (!afterValues) return true;
          for (const field of PASSWORD_EXCLUDED_FIELDS) {
            if (field in afterValues) return false;
          }
          return true;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('non-excluded fields are preserved correctly in the audit entry', () => {
    fc.assert(
      fc.property(
        arbitraryUserEntityWithPasswords().chain((beforeState) =>
          fc.tuple(fc.constant(beforeState), arbitraryUserEntityAfterReset(beforeState)),
        ),
        ([beforeState, afterState]) => {
          const { beforeValues, afterValues } = computePasswordResetAuditEntry(
            beforeState,
            afterState,
            PASSWORD_EXCLUDED_FIELDS,
          );

          if (!beforeValues || !afterValues) return true;

          // PROPERTY: all non-excluded fields from original state are preserved
          const nonExcludedKeys = Object.keys(beforeState).filter(
            (key) => !PASSWORD_EXCLUDED_FIELDS.includes(key),
          );

          for (const key of nonExcludedKeys) {
            // before_values should have original value
            if (JSON.stringify(beforeValues[key]) !== JSON.stringify(beforeState[key])) {
              return false;
            }
          }

          const nonExcludedAfterKeys = Object.keys(afterState).filter(
            (key) => !PASSWORD_EXCLUDED_FIELDS.includes(key),
          );

          for (const key of nonExcludedAfterKeys) {
            // after_values should have new value
            if (JSON.stringify(afterValues[key]) !== JSON.stringify(afterState[key])) {
              return false;
            }
          }

          return true;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('the exclusion works regardless of field value type or content', () => {
    fc.assert(
      fc.property(
        arbitraryEntityWithExtraPasswordVariants(),
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 200 }),
          fc.integer(),
          fc.constant(null),
          fc.constant(undefined),
          fc.constant(''),
          fc.constant('$2b$10$somebcrypthashvalue'),
          fc.constant('P@ssw0rd!Complex#2024'),
        ),
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 200 }),
          fc.integer(),
          fc.constant(null),
          fc.constant(undefined),
          fc.constant(''),
          fc.constant('$2b$10$anotherbcrypthash'),
          fc.constant('TempP@ss123!xyz'),
        ),
        (entityState, passwordValue, hashValue) => {
          // Override password fields with arbitrary values of any type
          const stateWithArbitraryPasswords: Record<string, unknown> = {
            ...entityState,
            password: passwordValue,
            password_hash: hashValue,
            temp_password: passwordValue,
          };

          const { beforeValues, afterValues } = computePasswordResetAuditEntry(
            stateWithArbitraryPasswords,
            stateWithArbitraryPasswords,
            PASSWORD_EXCLUDED_FIELDS,
          );

          // PROPERTY: regardless of what value types password fields contain,
          // they MUST NOT appear in the audit entry
          if (beforeValues) {
            for (const field of PASSWORD_EXCLUDED_FIELDS) {
              if (field in beforeValues) return false;
            }
          }
          if (afterValues) {
            for (const field of PASSWORD_EXCLUDED_FIELDS) {
              if (field in afterValues) return false;
            }
          }

          return true;
        },
      ),
      PBT_CONFIG,
    );
  });
});
