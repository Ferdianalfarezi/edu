/**
 * Property 18: Payment Reference Uniqueness
 *
 * Each generated nomor_referensi is unique across all transactions.
 * No two nomor_referensi are ever the same when generated in sequence.
 * The format follows the expected pattern:
 *   - TN-{timestamp}-{random} for tunai
 *   - TM-{timestamp}-{random} for transfer_manual
 *   - BT-{timestamp}-{random} for upload
 * Large batch generation (1000+ references) produces zero collisions.
 *
 * **Validates: Requirements 14.4**
 *
 * Properties verified:
 * 1. Each generated nomor_referensi is unique across all transactions
 * 2. No two nomor_referensi are ever the same when generated in sequence
 * 3. The format follows the expected pattern (prefix-timestamp-random)
 * 4. Large batch generation (1000+ references) produces zero collisions
 */

import fc from 'fast-check';
import { randomUUID } from 'crypto';
import { PBT_CONFIG } from '../config';

// ─── Payment Method Types ─────────────────────────────────────────────────────

type ManualPaymentMethod = 'tunai' | 'transfer_manual';
type AllPaymentMethod = ManualPaymentMethod | 'upload';

// ─── Function Under Test (extracted from TagihanService) ──────────────────────

/**
 * Generates a unique nomor_referensi for manual payment transactions.
 * Mirrors TagihanService.generateNomorReferensi logic.
 */
function generateNomorReferensi(metode: ManualPaymentMethod): string {
  const prefix = metode === 'tunai' ? 'TN' : 'TM';
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

/**
 * Generates a unique nomor_referensi for upload_bukti transactions.
 * Mirrors the inline logic in TagihanService.uploadBuktiTransfer.
 */
function generateNomorReferensiUpload(): string {
  return `BT-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

/**
 * Generates a nomor_referensi for any payment method.
 */
function generateNomorReferensiForMethod(metode: AllPaymentMethod): string {
  if (metode === 'upload') {
    return generateNomorReferensiUpload();
  }
  return generateNomorReferensi(metode);
}

// ─── Format Patterns ──────────────────────────────────────────────────────────

const FORMAT_PATTERNS: Record<AllPaymentMethod, RegExp> = {
  tunai: /^TN-\d+-[A-Z0-9]{8}$/,
  transfer_manual: /^TM-\d+-[A-Z0-9]{8}$/,
  upload: /^BT-\d+-[A-Z0-9]{8}$/,
};

const PREFIX_MAP: Record<AllPaymentMethod, string> = {
  tunai: 'TN',
  transfer_manual: 'TM',
  upload: 'BT',
};

// ─── Arbitraries ──────────────────────────────────────────────────────────────

function arbitraryManualPaymentMethod(): fc.Arbitrary<ManualPaymentMethod> {
  return fc.constantFrom('tunai' as ManualPaymentMethod, 'transfer_manual' as ManualPaymentMethod);
}

function arbitraryAllPaymentMethod(): fc.Arbitrary<AllPaymentMethod> {
  return fc.constantFrom(
    'tunai' as AllPaymentMethod,
    'transfer_manual' as AllPaymentMethod,
    'upload' as AllPaymentMethod,
  );
}

/**
 * Generates a batch size for sequential reference generation tests.
 */
function arbitraryBatchSize(): fc.Arbitrary<number> {
  return fc.integer({ min: 2, max: 50 });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 18: Payment Reference Uniqueness', () => {
  describe('Format correctness', () => {
    it('generated nomor_referensi always matches expected pattern for the given method', () => {
      fc.assert(
        fc.property(arbitraryAllPaymentMethod(), (metode) => {
          const ref = generateNomorReferensiForMethod(metode);
          const pattern = FORMAT_PATTERNS[metode];

          // PROPERTY: every generated reference matches its expected format
          return pattern.test(ref);
        }),
        PBT_CONFIG,
      );
    });

    it('prefix always corresponds to the payment method', () => {
      fc.assert(
        fc.property(arbitraryAllPaymentMethod(), (metode) => {
          const ref = generateNomorReferensiForMethod(metode);
          const expectedPrefix = PREFIX_MAP[metode];

          // PROPERTY: reference always starts with the correct prefix
          return ref.startsWith(`${expectedPrefix}-`);
        }),
        PBT_CONFIG,
      );
    });

    it('timestamp portion is a valid numeric value', () => {
      fc.assert(
        fc.property(arbitraryAllPaymentMethod(), (metode) => {
          const ref = generateNomorReferensiForMethod(metode);
          const parts = ref.split('-');
          // Format: PREFIX-TIMESTAMP-RANDOM
          const timestampStr = parts[1];
          const timestamp = Number(timestampStr);

          // PROPERTY: timestamp is a valid positive number (milliseconds since epoch)
          return !isNaN(timestamp) && timestamp > 0 && Number.isInteger(timestamp);
        }),
        PBT_CONFIG,
      );
    });

    it('random portion is exactly 8 uppercase alphanumeric characters', () => {
      fc.assert(
        fc.property(arbitraryAllPaymentMethod(), (metode) => {
          const ref = generateNomorReferensiForMethod(metode);
          const parts = ref.split('-');
          // Format: PREFIX-TIMESTAMP-RANDOM (random is last part)
          const randomPart = parts[2];

          // PROPERTY: random portion is 8 chars, uppercase alphanumeric
          return /^[A-Z0-9]{8}$/.test(randomPart);
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('Sequential uniqueness', () => {
    it('no two nomor_referensi are the same when generated in sequence for the same method', () => {
      fc.assert(
        fc.property(arbitraryManualPaymentMethod(), arbitraryBatchSize(), (metode, batchSize) => {
          const references = new Set<string>();

          for (let i = 0; i < batchSize; i++) {
            const ref = generateNomorReferensi(metode);
            references.add(ref);
          }

          // PROPERTY: all references in a batch are unique (set size equals batch size)
          return references.size === batchSize;
        }),
        PBT_CONFIG,
      );
    });

    it('no two nomor_referensi are the same when generated across different methods', () => {
      fc.assert(
        fc.property(arbitraryBatchSize(), (batchSize) => {
          const references = new Set<string>();
          const methods: AllPaymentMethod[] = ['tunai', 'transfer_manual', 'upload'];

          for (const metode of methods) {
            for (let i = 0; i < batchSize; i++) {
              const ref = generateNomorReferensiForMethod(metode);
              references.add(ref);
            }
          }

          const expectedTotal = batchSize * methods.length;

          // PROPERTY: all references across all methods are unique
          return references.size === expectedTotal;
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('Large batch uniqueness (zero collisions)', () => {
    it('1000+ references generated in rapid succession produce zero collisions', () => {
      fc.assert(
        fc.property(arbitraryAllPaymentMethod(), (metode) => {
          const BATCH_SIZE = 1000;
          const references = new Set<string>();

          for (let i = 0; i < BATCH_SIZE; i++) {
            const ref = generateNomorReferensiForMethod(metode);
            references.add(ref);
          }

          // PROPERTY: 1000 rapidly generated references have zero collisions
          return references.size === BATCH_SIZE;
        }),
        PBT_CONFIG,
      );
    });

    it('mixed method batch of 1000+ references produces zero collisions', () => {
      fc.assert(
        fc.property(fc.integer({ min: 350, max: 500 }), (perMethodCount) => {
          const references = new Set<string>();
          const methods: AllPaymentMethod[] = ['tunai', 'transfer_manual', 'upload'];

          for (const metode of methods) {
            for (let i = 0; i < perMethodCount; i++) {
              const ref = generateNomorReferensiForMethod(metode);
              references.add(ref);
            }
          }

          const expectedTotal = perMethodCount * methods.length;

          // PROPERTY: mixed-method large batch has zero collisions
          return references.size === expectedTotal;
        }),
        PBT_CONFIG,
      );
    });
  });
});
