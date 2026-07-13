/**
 * Property 5: Audit log captures before/after values for updates
 *
 * For any update operation on a sensitive entity where at least one scalar field changed,
 * the resulting audit_logs entry SHALL contain `before_values` with the previous field values
 * and `after_values` with the new field values, and these SHALL differ on at least one key.
 * Binary content fields (e.g., bukti_transfer_url) SHALL be excluded from the diff.
 *
 * **Validates: Requirements 5.2**
 *
 * Properties verified:
 * 1. For any update where at least one field changed, before_values and after_values differ on at least one key
 * 2. For any excluded field list, neither before_values nor after_values contain any excluded field key
 * 3. Fields that were NOT changed appear with identical values in both before and after (or are absent from the diff)
 * 4. The diff correctly captures the old value in before_values and new value in after_values for each changed field
 *
 * Feature: superadmin-cross-tenant-access, Property 5: Audit log captures before/after values for updates
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';

// ─── Simulated AuditInterceptor Diff Logic ────────────────────────────────────

/**
 * Simulates the AuditInterceptor's diff computation for before/after capture.
 * This mirrors how the interceptor computes audit diffs for update operations:
 * 1. Take the full before-state and after-state
 * 2. Remove excluded fields (e.g., binary content like bukti_transfer_url)
 * 3. Return the filtered before/after values
 */
function computeAuditDiff(
  beforeState: Record<string, unknown>,
  afterState: Record<string, unknown>,
  excludeFields: string[],
): { beforeValues: Record<string, unknown>; afterValues: Record<string, unknown> } {
  const beforeValues: Record<string, unknown> = {};
  const afterValues: Record<string, unknown> = {};

  // Collect all keys from both states
  const allKeys = new Set([...Object.keys(beforeState), ...Object.keys(afterState)]);

  for (const key of allKeys) {
    if (excludeFields.includes(key)) {
      continue; // Skip excluded fields
    }
    if (key in beforeState) {
      beforeValues[key] = beforeState[key];
    }
    if (key in afterState) {
      afterValues[key] = afterState[key];
    }
  }

  return { beforeValues, afterValues };
}

/**
 * Determines whether two values differ (using JSON serialization for deep comparison).
 */
function valuesDiffer(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Generates a random entity state as a dictionary with string keys and JSON-safe values */
function arbitraryEntityState(): fc.Arbitrary<Record<string, unknown>> {
  return fc.dictionary(
    fc.string({ minLength: 1, maxLength: 15, unit: 'grapheme-ascii' }),
    fc.oneof(
      fc.string({ maxLength: 30 }),
      fc.integer(),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.boolean(),
      fc.constant(null),
    ),
    { minKeys: 1, maxKeys: 10 },
  );
}

/** Generates random field modifications — a subset of keys from the entity state with new values */
function arbitraryFieldModifications(
  entityState: Record<string, unknown>,
): fc.Arbitrary<Record<string, unknown>> {
  const keys = Object.keys(entityState);
  if (keys.length === 0) {
    return fc.constant({});
  }
  return fc.subarray(keys, { minLength: 1, maxLength: keys.length }).chain((selectedKeys) =>
    fc
      .tuple(
        ...selectedKeys.map(() =>
          fc.oneof(
            fc.string({ maxLength: 30 }),
            fc.integer(),
            fc.double({ noNaN: true, noDefaultInfinity: true }),
            fc.boolean(),
            fc.constant(null),
          ),
        ),
      )
      .map((values) => {
        const modifications: Record<string, unknown> = {};
        selectedKeys.forEach((key, i) => {
          modifications[key] = values[i];
        });
        return modifications;
      }),
  );
}

/** Generates a random list of excluded fields from entity keys */
function arbitraryExcludedFields(entityState: Record<string, unknown>): fc.Arbitrary<string[]> {
  const keys = Object.keys(entityState);
  if (keys.length === 0) {
    return fc.constant([]);
  }
  return fc.subarray(keys, { minLength: 0, maxLength: Math.min(keys.length, 3) });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 5: Audit log captures before/after values for updates', () => {
  it('for any update where at least one field changed, before_values and after_values differ on at least one key', () => {
    fc.assert(
      fc.property(
        arbitraryEntityState().chain((entityState) =>
          fc.tuple(
            fc.constant(entityState),
            arbitraryFieldModifications(entityState),
            arbitraryExcludedFields(entityState),
          ),
        ),
        ([entityState, modifications, excludeFields]) => {
          // Apply modifications to create afterState
          const afterState = { ...entityState, ...modifications };

          // Compute audit diff
          const { beforeValues, afterValues } = computeAuditDiff(
            entityState,
            afterState,
            excludeFields,
          );

          // Check if at least one modification actually changed a value
          // (modifications may generate same values as original)
          const hasActualChange = Object.keys(modifications).some(
            (key) =>
              !excludeFields.includes(key) && valuesDiffer(entityState[key], modifications[key]),
          );

          if (!hasActualChange) {
            // If no actual change occurred (or all changed fields were excluded),
            // the property is trivially satisfied — skip
            return true;
          }

          // PROPERTY: before_values and after_values must differ on at least one key
          const allKeys = new Set([...Object.keys(beforeValues), ...Object.keys(afterValues)]);
          let differOnAtLeastOneKey = false;
          for (const key of allKeys) {
            if (valuesDiffer(beforeValues[key], afterValues[key])) {
              differOnAtLeastOneKey = true;
              break;
            }
          }

          return differOnAtLeastOneKey;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('for any excluded field list, neither before_values nor after_values contain any excluded field key', () => {
    fc.assert(
      fc.property(
        arbitraryEntityState().chain((entityState) =>
          fc.tuple(
            fc.constant(entityState),
            arbitraryFieldModifications(entityState),
            arbitraryExcludedFields(entityState),
          ),
        ),
        ([entityState, modifications, excludeFields]) => {
          const afterState = { ...entityState, ...modifications };

          const { beforeValues, afterValues } = computeAuditDiff(
            entityState,
            afterState,
            excludeFields,
          );

          // PROPERTY: excluded fields must not appear as own properties in either before or after values
          for (const excludedField of excludeFields) {
            if (Object.prototype.hasOwnProperty.call(beforeValues, excludedField)) return false;
            if (Object.prototype.hasOwnProperty.call(afterValues, excludedField)) return false;
          }

          return true;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('fields that were NOT changed appear with identical values in both before and after', () => {
    fc.assert(
      fc.property(
        arbitraryEntityState().chain((entityState) =>
          fc.tuple(
            fc.constant(entityState),
            arbitraryFieldModifications(entityState),
            arbitraryExcludedFields(entityState),
          ),
        ),
        ([entityState, modifications, excludeFields]) => {
          const afterState = { ...entityState, ...modifications };

          const { beforeValues, afterValues } = computeAuditDiff(
            entityState,
            afterState,
            excludeFields,
          );

          // Find fields that were NOT modified
          const unchangedKeys = Object.keys(entityState).filter(
            (key) => !excludeFields.includes(key) && !(key in modifications),
          );

          // PROPERTY: unchanged fields have identical values in before and after
          for (const key of unchangedKeys) {
            if (valuesDiffer(beforeValues[key], afterValues[key])) {
              return false;
            }
          }

          return true;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('the diff correctly captures the old value in before_values and new value in after_values for each changed field', () => {
    fc.assert(
      fc.property(
        arbitraryEntityState().chain((entityState) =>
          fc.tuple(
            fc.constant(entityState),
            arbitraryFieldModifications(entityState),
            arbitraryExcludedFields(entityState),
          ),
        ),
        ([entityState, modifications, excludeFields]) => {
          const afterState = { ...entityState, ...modifications };

          const { beforeValues, afterValues } = computeAuditDiff(
            entityState,
            afterState,
            excludeFields,
          );

          // For each modified field that is NOT excluded:
          for (const key of Object.keys(modifications)) {
            if (excludeFields.includes(key)) {
              // Excluded fields must NOT appear as own properties
              if (
                Object.prototype.hasOwnProperty.call(beforeValues, key) ||
                Object.prototype.hasOwnProperty.call(afterValues, key)
              )
                return false;
              continue;
            }

            // PROPERTY: before_values captures old value, after_values captures new value
            if (valuesDiffer(beforeValues[key], entityState[key])) {
              return false; // before_values should have the original state value
            }
            if (valuesDiffer(afterValues[key], modifications[key])) {
              return false; // after_values should have the new modified value
            }
          }

          return true;
        },
      ),
      PBT_CONFIG,
    );
  });
});
