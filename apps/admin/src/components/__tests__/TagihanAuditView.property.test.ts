// Feature: sistem-pengembangan-v2, Property 14: Setiap record audit_trail memiliki aksiLabel non-null, perubahan array, alasan boleh null

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Types — mirrors the AuditLog structure from TagihanAuditView.vue and
// the Audit_Log_Service contract defined in Requirements 8.4
// ---------------------------------------------------------------------------

interface PerubahanItem {
  namaField: string;
  labelField: string;
  nilaiSebelum: unknown;
  nilaiSesudah: unknown;
}

interface AuditLogRecord {
  aksiLabel: string;
  perubahan: PerubahanItem[];
  alasan: string | null;
}

// ---------------------------------------------------------------------------
// validateAuditLogStructure
//
// Returns true when all invariants defined in Req 8.4 hold:
//   1. aksiLabel is a non-empty string (never null, never empty, ≤ 100 chars)
//   2. perubahan is an array (may be empty, but never null/undefined)
//   3. alasan is null OR a non-empty string (never an empty string)
//   4. Every PerubahanItem has namaField and labelField as non-empty strings
// ---------------------------------------------------------------------------

export function validateAuditLogStructure(log: unknown): log is AuditLogRecord {
  if (log === null || typeof log !== 'object') return false;

  const record = log as Record<string, unknown>;

  // Invariant 1: aksiLabel — non-null, non-empty string, max 100 chars
  const { aksiLabel } = record;
  if (typeof aksiLabel !== 'string') return false;
  if (aksiLabel.length === 0) return false;
  if (aksiLabel.length > 100) return false;

  // Invariant 2: perubahan — must be an array (may be empty)
  const { perubahan } = record;
  if (!Array.isArray(perubahan)) return false;

  // Invariant 3: alasan — null or non-empty string (empty string is invalid)
  const { alasan } = record;
  if (alasan !== null) {
    if (typeof alasan !== 'string') return false;
    if (alasan.length === 0) return false;
  }

  // Invariant 4: each PerubahanItem must have non-empty namaField and labelField
  for (const item of perubahan) {
    if (item === null || typeof item !== 'object') return false;
    const p = item as Record<string, unknown>;
    if (typeof p.namaField !== 'string' || p.namaField.length === 0) return false;
    if (typeof p.labelField !== 'string' || p.labelField.length === 0) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty string, max 100 chars — valid aksiLabel */
const aksiLabelArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

/** Non-empty string — valid namaField / labelField */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.length > 0);

/** Valid PerubahanItem */
const perubahanItemArb: fc.Arbitrary<PerubahanItem> = fc.record({
  namaField: nonEmptyStringArb,
  labelField: nonEmptyStringArb,
  nilaiSebelum: fc.anything(),
  nilaiSesudah: fc.anything(),
});

/** alasan can be null or a non-empty string */
const alasanArb: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.string({ minLength: 1, maxLength: 255 }).filter((s) => s.length > 0),
);

/** A structurally valid AuditLogRecord */
const validAuditLogArb: fc.Arbitrary<AuditLogRecord> = fc.record({
  aksiLabel: aksiLabelArb,
  perubahan: fc.array(perubahanItemArb, { minLength: 0, maxLength: 10 }),
  alasan: alasanArb,
});

// ---------------------------------------------------------------------------
// Property 14: Setiap record audit_trail memiliki aksiLabel non-null,
//              perubahan array, alasan boleh null
// **Validates: Requirements 8.4**
// ---------------------------------------------------------------------------

describe('Property 14: Structural invariants of audit_trail records', () => {
  // -------------------------------------------------------------------------
  // 14.1 — Well-formed records always pass validation
  // -------------------------------------------------------------------------

  it('14.1 valid records always satisfy all structural invariants', () => {
    fc.assert(
      fc.property(validAuditLogArb, (log) => {
        expect(validateAuditLogStructure(log)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 14.2 — aksiLabel: null is rejected
  // -------------------------------------------------------------------------

  it('14.2 aksiLabel null is always rejected', () => {
    fc.assert(
      fc.property(
        fc.record({
          aksiLabel: fc.constant(null) as fc.Arbitrary<unknown>,
          perubahan: fc.array(perubahanItemArb),
          alasan: alasanArb,
        }),
        (log) => {
          expect(validateAuditLogStructure(log)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 14.3 — aksiLabel: empty string is rejected
  // -------------------------------------------------------------------------

  it('14.3 aksiLabel empty string is always rejected', () => {
    fc.assert(
      fc.property(
        fc.record({
          aksiLabel: fc.constant(''),
          perubahan: fc.array(perubahanItemArb),
          alasan: alasanArb,
        }),
        (log) => {
          expect(validateAuditLogStructure(log)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 14.4 — aksiLabel exceeding 100 chars is rejected
  // -------------------------------------------------------------------------

  it('14.4 aksiLabel longer than 100 chars is always rejected', () => {
    fc.assert(
      fc.property(
        // Generate strings strictly longer than 100 chars
        fc.string({ minLength: 101, maxLength: 200 }),
        fc.record({
          perubahan: fc.array(perubahanItemArb),
          alasan: alasanArb,
        }),
        (tooLong, rest) => {
          const log = { ...rest, aksiLabel: tooLong };
          expect(validateAuditLogStructure(log)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 14.5 — perubahan: null is rejected (must be array, not null)
  // -------------------------------------------------------------------------

  it('14.5 perubahan null is always rejected', () => {
    fc.assert(
      fc.property(
        fc.record({
          aksiLabel: aksiLabelArb,
          perubahan: fc.constant(null) as fc.Arbitrary<unknown>,
          alasan: alasanArb,
        }),
        (log) => {
          expect(validateAuditLogStructure(log)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 14.6 — perubahan: undefined is rejected
  // -------------------------------------------------------------------------

  it('14.6 perubahan undefined is always rejected', () => {
    fc.assert(
      fc.property(
        fc.record({
          aksiLabel: aksiLabelArb,
          alasan: alasanArb,
        }),
        (partialLog) => {
          // perubahan field is absent → undefined
          const log = { ...partialLog };
          expect(validateAuditLogStructure(log)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 14.7 — perubahan: empty array is valid (perubahan may be empty)
  // -------------------------------------------------------------------------

  it('14.7 empty perubahan array is always valid', () => {
    fc.assert(
      fc.property(
        fc.record({
          aksiLabel: aksiLabelArb,
          alasan: alasanArb,
        }),
        (rest) => {
          const log = { ...rest, perubahan: [] };
          expect(validateAuditLogStructure(log)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 14.8 — alasan: empty string is always rejected (if present, must have content)
  // -------------------------------------------------------------------------

  it('14.8 alasan empty string is always rejected', () => {
    fc.assert(
      fc.property(
        fc.record({
          aksiLabel: aksiLabelArb,
          perubahan: fc.array(perubahanItemArb),
          alasan: fc.constant(''),
        }),
        (log) => {
          expect(validateAuditLogStructure(log)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 14.9 — alasan: null is always valid
  // -------------------------------------------------------------------------

  it('14.9 alasan null is always valid', () => {
    fc.assert(
      fc.property(
        fc.record({
          aksiLabel: aksiLabelArb,
          perubahan: fc.array(perubahanItemArb),
          alasan: fc.constant(null),
        }),
        (log) => {
          expect(validateAuditLogStructure(log)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 14.10 — PerubahanItem: namaField empty string is rejected
  // -------------------------------------------------------------------------

  it('14.10 perubahan item with empty namaField is always rejected', () => {
    fc.assert(
      fc.property(
        fc.record({
          aksiLabel: aksiLabelArb,
          alasan: alasanArb,
        }),
        fc.record({
          namaField: fc.constant(''),
          labelField: nonEmptyStringArb,
          nilaiSebelum: fc.anything(),
          nilaiSesudah: fc.anything(),
        }),
        fc.array(perubahanItemArb),
        (rest, invalidItem, otherItems) => {
          const log = {
            ...rest,
            perubahan: [invalidItem, ...otherItems],
          };
          expect(validateAuditLogStructure(log)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 14.11 — PerubahanItem: labelField empty string is rejected
  // -------------------------------------------------------------------------

  it('14.11 perubahan item with empty labelField is always rejected', () => {
    fc.assert(
      fc.property(
        fc.record({
          aksiLabel: aksiLabelArb,
          alasan: alasanArb,
        }),
        fc.record({
          namaField: nonEmptyStringArb,
          labelField: fc.constant(''),
          nilaiSebelum: fc.anything(),
          nilaiSesudah: fc.anything(),
        }),
        fc.array(perubahanItemArb),
        (rest, invalidItem, otherItems) => {
          const log = {
            ...rest,
            perubahan: [invalidItem, ...otherItems],
          };
          expect(validateAuditLogStructure(log)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 14.12 — nilaiSebelum / nilaiSesudah can be any value (no type restriction)
  // -------------------------------------------------------------------------

  it('14.12 perubahan item nilaiSebelum and nilaiSesudah accept any value', () => {
    fc.assert(
      fc.property(
        fc.record({
          aksiLabel: aksiLabelArb,
          alasan: alasanArb,
        }),
        fc.anything(),
        fc.anything(),
        (rest, nilaiSebelum, nilaiSesudah) => {
          const log = {
            ...rest,
            perubahan: [
              {
                namaField: 'nominal',
                labelField: 'Nominal',
                nilaiSebelum,
                nilaiSesudah,
              },
            ],
          };
          expect(validateAuditLogStructure(log)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
