/**
 * Property 10: Payment Amount Validation
 *
 * For any payment attempt (upload or manual), the system SHALL reject the payment if:
 * (a) the amount is less than Rp 10,000 (for parent uploads only),
 * (b) the amount exceeds the remaining balance (nominal - total_dibayar).
 * For parent uploads where one cicilan already exists and is approved, the second
 * payment amount SHALL equal exactly the remaining balance.
 * For manual payments by bendahara, amount must be > 0 and <= sisa_tagihan (no minimum floor).
 * total_dibayar never exceeds nominal after any valid payment.
 *
 * **Validates: Requirements 11.9, 11.10, 11.13, 11.14, 13.7**
 *
 * Properties verified:
 * 1. Any nominal_bayar < 10000 is ALWAYS rejected (for upload)
 * 2. Any nominal_bayar > sisa_tagihan is ALWAYS rejected
 * 3. For upload with 1 approved cicilan, second payment must EXACTLY equal remaining balance
 * 4. For manual payments, amount must be <= sisa_tagihan but no minimum floor (just > 0)
 * 5. total_dibayar never exceeds nominal after any valid payment
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TagihanState {
  id: string;
  nominal: number;
  total_dibayar: number;
  approved_upload_count: number;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ─── Payment Validation Logic Under Test ──────────────────────────────────────

const MIN_NOMINAL_UPLOAD = 10000;

/**
 * Validates an upload payment attempt (by orang_tua).
 * Rules:
 * - nominal_bayar >= 10000 (Req 11.9)
 * - nominal_bayar <= sisa_tagihan (Req 11.10)
 * - Max 2 cicilan via upload (Req 11.13)
 * - If 1 approved cicilan exists, second must equal exactly sisa (Req 11.14)
 */
function validateUploadPayment(tagihan: TagihanState, nominalBayar: number): ValidationResult {
  const sisaTagihan = tagihan.nominal - tagihan.total_dibayar;

  // Req 11.9: Minimum Rp 10.000 for uploads
  if (nominalBayar < MIN_NOMINAL_UPLOAD) {
    return { valid: false, error: 'Nominal pembayaran minimal Rp 10.000' };
  }

  // Req 11.10: Cannot exceed remaining balance
  if (nominalBayar > sisaTagihan) {
    return { valid: false, error: 'Nominal melebihi sisa tagihan' };
  }

  // Req 11.13: Max 2 cicilan via upload
  if (tagihan.approved_upload_count >= 2) {
    return { valid: false, error: 'Maksimal 2 kali pembayaran cicilan via upload bukti transfer' };
  }

  // Req 11.14: Second upload must equal exactly remaining balance
  if (tagihan.approved_upload_count === 1 && nominalBayar !== sisaTagihan) {
    return {
      valid: false,
      error: `Pembayaran kedua wajib melunasi seluruh sisa tagihan`,
    };
  }

  return { valid: true };
}

/**
 * Validates a manual payment attempt (by bendahara).
 * Rules:
 * - jumlah_bayar > 0
 * - jumlah_bayar <= sisa_tagihan (Req 13.7)
 * - No minimum floor (unlike upload)
 * - No limit on cicilan count
 */
function validateManualPayment(tagihan: TagihanState, jumlahBayar: number): ValidationResult {
  const sisaTagihan = tagihan.nominal - tagihan.total_dibayar;

  if (jumlahBayar <= 0) {
    return { valid: false, error: 'Jumlah pembayaran harus lebih dari 0' };
  }

  // Req 13.7: Cannot exceed remaining balance
  if (jumlahBayar > sisaTagihan) {
    return { valid: false, error: 'Jumlah pembayaran melebihi sisa tagihan' };
  }

  return { valid: true };
}

/**
 * Applies a valid payment and returns updated total_dibayar.
 */
function applyPayment(tagihan: TagihanState, amount: number): TagihanState {
  return {
    ...tagihan,
    total_dibayar: tagihan.total_dibayar + amount,
  };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a tagihan with remaining balance > 0 and consistent state.
 */
function arbitraryTagihanWithBalance(options?: {
  minNominal?: number;
  approvedUploadCount?: number;
}): fc.Arbitrary<TagihanState> {
  const minNom = options?.minNominal ?? 20000;

  return fc
    .record({
      id: arbitraryUuid(),
      nominal: fc.integer({ min: minNom, max: 5000000 }),
      approvedCount:
        options?.approvedUploadCount !== undefined
          ? fc.constant(options.approvedUploadCount)
          : fc.integer({ min: 0, max: 1 }),
    })
    .chain((base) => {
      // total_dibayar: [0, nominal - 1] to ensure there's a positive remaining balance
      return fc.integer({ min: 0, max: base.nominal - 1 }).map((totalDibayar) => ({
        id: base.id,
        nominal: base.nominal,
        total_dibayar: totalDibayar,
        approved_upload_count: base.approvedCount,
      }));
    });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 10: Payment Amount Validation', () => {
  describe('Upload payments (orang_tua)', () => {
    it('any nominal_bayar < 10000 is ALWAYS rejected for upload', () => {
      fc.assert(
        fc.property(
          arbitraryTagihanWithBalance({ approvedUploadCount: 0 }),
          fc.integer({ min: 1, max: MIN_NOMINAL_UPLOAD - 1 }), // below minimum
          (tagihan, nominalBayar) => {
            const result = validateUploadPayment(tagihan, nominalBayar);

            // PROPERTY: below-minimum uploads are always rejected
            return (
              result.valid === false && result.error === 'Nominal pembayaran minimal Rp 10.000'
            );
          },
        ),
        PBT_CONFIG,
      );
    });

    it('any nominal_bayar > sisa_tagihan is ALWAYS rejected for upload (when amount also >= minimum)', () => {
      fc.assert(
        fc.property(
          // Ensure sisa >= MIN_NOMINAL so the "exceeds sisa" error is reachable
          arbitraryTagihanWithBalance({ approvedUploadCount: 0, minNominal: 30000 }).filter(
            (t) => t.nominal - t.total_dibayar >= MIN_NOMINAL_UPLOAD,
          ),
          fc.integer({ min: 1, max: 500000 }), // excess over sisa
          (tagihan, excess) => {
            const sisaTagihan = tagihan.nominal - tagihan.total_dibayar;
            const nominalBayar = sisaTagihan + excess;
            // nominalBayar >= sisa + 1 >= MIN_NOMINAL + 1, so minimum check passes

            const result = validateUploadPayment(tagihan, nominalBayar);

            // PROPERTY: over-balance uploads are always rejected with correct error
            return result.valid === false && result.error === 'Nominal melebihi sisa tagihan';
          },
        ),
        PBT_CONFIG,
      );
    });

    it('for upload with 1 approved cicilan, non-exact amount is rejected', () => {
      fc.assert(
        fc.property(
          // Tagihan with 1 approved upload, sisa >= MIN_NOMINAL_UPLOAD
          arbitraryTagihanWithBalance({ minNominal: 30000, approvedUploadCount: 1 }).filter((t) => {
            const sisa = t.nominal - t.total_dibayar;
            // Need sisa > MIN_NOMINAL to have room for wrong amounts in [MIN, sisa)
            return sisa > MIN_NOMINAL_UPLOAD;
          }),
          fc.double({ min: 0.01, max: 0.99, noNaN: true }), // fraction to create wrong amount
          (tagihan, fraction) => {
            const sisaTagihan = tagihan.nominal - tagihan.total_dibayar;

            // Generate a valid-range amount that is NOT equal to sisa
            // Amount in [MIN_NOMINAL, sisa - 1]
            const range = sisaTagihan - MIN_NOMINAL_UPLOAD;
            const wrongAmount = MIN_NOMINAL_UPLOAD + Math.floor(fraction * range);

            // Skip if we accidentally hit the exact sisa (very unlikely with range > 0)
            if (wrongAmount === sisaTagihan) return true;
            if (wrongAmount >= sisaTagihan) return true;

            const result = validateUploadPayment(tagihan, wrongAmount);

            // PROPERTY: non-exact amount on second payment is always rejected
            return (
              result.valid === false && result.error!.includes('Pembayaran kedua wajib melunasi')
            );
          },
        ),
        PBT_CONFIG,
      );
    });

    it('for upload with 1 approved cicilan, exact remaining balance is accepted', () => {
      fc.assert(
        fc.property(
          arbitraryTagihanWithBalance({ minNominal: 30000, approvedUploadCount: 1 }).filter((t) => {
            const sisa = t.nominal - t.total_dibayar;
            return sisa >= MIN_NOMINAL_UPLOAD;
          }),
          (tagihan) => {
            const sisaTagihan = tagihan.nominal - tagihan.total_dibayar;

            const result = validateUploadPayment(tagihan, sisaTagihan);

            // PROPERTY: exact remaining balance is always accepted for second payment
            return result.valid === true;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Manual payments (bendahara)', () => {
    it('any jumlah_bayar > sisa_tagihan is ALWAYS rejected for manual payments', () => {
      fc.assert(
        fc.property(
          arbitraryTagihanWithBalance(),
          fc.integer({ min: 1, max: 500000 }), // excess over sisa
          (tagihan, excess) => {
            const sisaTagihan = tagihan.nominal - tagihan.total_dibayar;
            const jumlahBayar = sisaTagihan + excess;

            const result = validateManualPayment(tagihan, jumlahBayar);

            // PROPERTY: over-balance manual payments are always rejected
            return (
              result.valid === false && result.error === 'Jumlah pembayaran melebihi sisa tagihan'
            );
          },
        ),
        PBT_CONFIG,
      );
    });

    it('manual payments have no minimum floor — any amount > 0 and <= sisa is valid', () => {
      fc.assert(
        fc.property(
          arbitraryTagihanWithBalance({ minNominal: 20000 }),
          fc.double({ min: 0.001, max: 1.0, noNaN: true }), // fraction of sisa
          (tagihan, fraction) => {
            const sisaTagihan = tagihan.nominal - tagihan.total_dibayar;
            // Generate amount in valid range: [1, sisa]
            const jumlahBayar = Math.max(1, Math.floor(fraction * sisaTagihan));

            const result = validateManualPayment(tagihan, jumlahBayar);

            // PROPERTY: any amount > 0 and <= sisa is valid for manual (no 10k minimum)
            return result.valid === true;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('manual payments with amount <= 0 are ALWAYS rejected', () => {
      fc.assert(
        fc.property(
          arbitraryTagihanWithBalance(),
          fc.integer({ min: -1000000, max: 0 }),
          (tagihan, jumlahBayar) => {
            const result = validateManualPayment(tagihan, jumlahBayar);

            // PROPERTY: non-positive amounts are always rejected
            return (
              result.valid === false && result.error === 'Jumlah pembayaran harus lebih dari 0'
            );
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('total_dibayar invariant', () => {
    it('total_dibayar never exceeds nominal after any valid upload payment', () => {
      fc.assert(
        fc.property(
          // Ensure sisa >= MIN_NOMINAL_UPLOAD for valid upload
          arbitraryTagihanWithBalance({ minNominal: 30000, approvedUploadCount: 0 }).filter(
            (t) => t.nominal - t.total_dibayar >= MIN_NOMINAL_UPLOAD,
          ),
          fc.double({ min: 0.0, max: 1.0, noNaN: true }), // fraction for amount within [MIN, sisa]
          (tagihan, fraction) => {
            const sisaTagihan = tagihan.nominal - tagihan.total_dibayar;
            // Generate valid upload amount in [MIN_NOMINAL, sisa]
            const range = sisaTagihan - MIN_NOMINAL_UPLOAD;
            const amount = MIN_NOMINAL_UPLOAD + Math.floor(fraction * range);

            const result = validateUploadPayment(tagihan, amount);
            if (!result.valid) return true; // skip invalid (shouldn't happen but safety)

            // Apply the payment
            const updatedTagihan = applyPayment(tagihan, amount);

            // PROPERTY: total_dibayar NEVER exceeds nominal
            return updatedTagihan.total_dibayar <= tagihan.nominal;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('total_dibayar never exceeds nominal after any valid manual payment', () => {
      fc.assert(
        fc.property(
          arbitraryTagihanWithBalance({ minNominal: 20000 }),
          fc.double({ min: 0.001, max: 1.0, noNaN: true }), // fraction for amount within [1, sisa]
          (tagihan, fraction) => {
            const sisaTagihan = tagihan.nominal - tagihan.total_dibayar;
            const amount = Math.max(1, Math.floor(fraction * sisaTagihan));

            const result = validateManualPayment(tagihan, amount);
            if (!result.valid) return true; // skip invalid

            // Apply the payment
            const updatedTagihan = applyPayment(tagihan, amount);

            // PROPERTY: total_dibayar NEVER exceeds nominal
            return updatedTagihan.total_dibayar <= tagihan.nominal;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('sequence of valid manual payments never causes total_dibayar to exceed nominal', () => {
      fc.assert(
        fc.property(
          arbitraryTagihanWithBalance({ minNominal: 50000 }),
          fc.array(fc.double({ min: 0.01, max: 0.5, noNaN: true }), {
            minLength: 1,
            maxLength: 10,
          }),
          (initialTagihan, fractions) => {
            let currentTagihan = { ...initialTagihan };

            for (const fraction of fractions) {
              const sisaTagihan = currentTagihan.nominal - currentTagihan.total_dibayar;
              if (sisaTagihan <= 0) break; // Already fully paid

              // Generate amount as fraction of remaining
              const amount = Math.max(1, Math.floor(fraction * sisaTagihan));

              const result = validateManualPayment(currentTagihan, amount);
              if (!result.valid) break;

              currentTagihan = applyPayment(currentTagihan, amount);

              // PROPERTY: at every step, total_dibayar <= nominal
              if (currentTagihan.total_dibayar > currentTagihan.nominal) {
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
