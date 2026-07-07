import fc from 'fast-check';
import {
  arbitraryUuid,
  arbitraryPaymentStatus,
  arbitraryRupiahAmount,
  VALID_TRANSITIONS,
  type PaymentStatus,
} from './common';

// ─── Tagihan Types ────────────────────────────────────────────────────────────

export interface TagihanData {
  id: string;
  tenant_id: string;
  siswa_id: string;
  bulan: number;
  tahun: number;
  nominal: number;
  status: PaymentStatus;
  total_dibayar: number;
  tanggal_jatuh_tempo: string;
}

export interface TransitionAttempt {
  from: PaymentStatus;
  to: PaymentStatus;
}

export interface PaymentAttempt {
  tagihan_id: string;
  nominal_bayar: number;
  sisa_tagihan: number;
  cicilan_count: number;
  method: 'upload' | 'manual';
}

// ─── Tagihan Arbitraries ──────────────────────────────────────────────────────

/**
 * Generates a valid tagihan (billing) record.
 */
export function arbitraryTagihan(options?: {
  tenantId?: string;
  siswaId?: string;
  status?: PaymentStatus;
}): fc.Arbitrary<TagihanData> {
  return fc
    .record({
      id: arbitraryUuid(),
      tenant_id: options?.tenantId ? fc.constant(options.tenantId) : arbitraryUuid(),
      siswa_id: options?.siswaId ? fc.constant(options.siswaId) : arbitraryUuid(),
      bulan: fc.integer({ min: 1, max: 12 }),
      tahun: fc.integer({ min: 2023, max: 2027 }),
      nominal: arbitraryRupiahAmount(),
      status: options?.status ? fc.constant(options.status) : arbitraryPaymentStatus(),
    })
    .filter((base) => {
      // For cicilan/menunggu_verifikasi, nominal must be > minimum payment (10k)
      // to allow a valid partial payment range
      if (base.status === 'cicilan' || base.status === 'menunggu_verifikasi') {
        return base.nominal > 10000;
      }
      return true;
    })
    .chain((base) => {
      // total_dibayar must be consistent with status
      let totalDibayar: fc.Arbitrary<number>;
      switch (base.status) {
        case 'belum_bayar':
        case 'dibatalkan':
          totalDibayar = fc.constant(0);
          break;
        case 'lunas':
          totalDibayar = fc.constant(base.nominal);
          break;
        case 'cicilan':
        case 'menunggu_verifikasi':
          // Partial payment: between min payment (10k) and strictly less than nominal
          totalDibayar =
            base.nominal > 20000
              ? fc.integer({ min: 10000, max: base.nominal - 10000 })
              : fc.constant(10000);
          break;
        case 'ditolak':
          totalDibayar = fc.constant(0);
          break;
        default:
          totalDibayar = fc.constant(0);
      }

      return totalDibayar.map((td) => ({
        ...base,
        total_dibayar: td,
        tanggal_jatuh_tempo: `${base.tahun}-${String(base.bulan).padStart(2, '0')}-10`,
      }));
    });
}

/**
 * Generates a valid state transition attempt.
 * Can be either valid or invalid for testing.
 */
export function arbitraryTransitionAttempt(): fc.Arbitrary<TransitionAttempt> {
  return fc.record({
    from: arbitraryPaymentStatus(),
    to: arbitraryPaymentStatus(),
  });
}

/**
 * Generates only VALID state transitions (for positive testing).
 */
export function arbitraryValidTransition(): fc.Arbitrary<TransitionAttempt> {
  return arbitraryPaymentStatus()
    .filter((status) => VALID_TRANSITIONS[status].length > 0)
    .chain((from) => fc.constantFrom(...VALID_TRANSITIONS[from]).map((to) => ({ from, to })));
}

/**
 * Generates only INVALID state transitions (for negative testing).
 */
export function arbitraryInvalidTransition(): fc.Arbitrary<TransitionAttempt> {
  return arbitraryPaymentStatus().chain((from) => {
    const valid = new Set(VALID_TRANSITIONS[from]);
    const allStatuses = [
      'belum_bayar',
      'menunggu_verifikasi',
      'cicilan',
      'lunas',
      'ditolak',
      'dibatalkan',
    ] as PaymentStatus[];
    const invalid = allStatuses.filter((s) => !valid.has(s) && s !== from);

    if (invalid.length === 0) {
      // All statuses except 'from' are valid — very unlikely but handle it
      return fc.constant({ from, to: from });
    }

    return fc.constantFrom(...invalid).map((to) => ({ from, to }));
  });
}

/**
 * Generates a payment attempt for testing amount validation (Property 10).
 */
export function arbitraryPaymentAttempt(options?: {
  tagihanNominal?: number;
}): fc.Arbitrary<PaymentAttempt> {
  const nominal = options?.tagihanNominal || 500000;
  const sisa = nominal; // Full remaining for simplicity

  return fc.record({
    tagihan_id: arbitraryUuid(),
    nominal_bayar: fc.integer({ min: 1000, max: nominal + 100000 }), // Can exceed for testing
    sisa_tagihan: fc.constant(sisa),
    cicilan_count: fc.integer({ min: 0, max: 2 }),
    method: fc.constantFrom<'upload' | 'manual'>('upload', 'manual'),
  });
}

/**
 * Generates a tagihan specifically in belum_bayar status.
 * Useful for billing generation tests (Property 8).
 */
export function arbitraryNewTagihan(options?: {
  tenantId?: string;
  siswaId?: string;
}): fc.Arbitrary<TagihanData> {
  return arbitraryTagihan({ ...options, status: 'belum_bayar' });
}
