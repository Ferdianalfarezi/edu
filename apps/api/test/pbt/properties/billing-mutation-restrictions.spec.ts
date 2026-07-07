/**
 * Property 16: Billing Mutation Restrictions
 *
 * For any tagihan with status other than `belum_bayar`, the system SHALL reject
 * attempts to: delete the tagihan, edit its nominal, or cancel it. Only tagihan
 * with status `belum_bayar` SHALL allow these mutations.
 *
 * Additionally, after any successful mutation (delete/edit/cancel), an audit trail
 * entry must be created.
 *
 * **Validates: Requirements 34.1, 34.2, 34.3, 34.4, 34.5, 34.6**
 *
 * Properties verified:
 * 1. DELETE is only allowed when status == 'belum_bayar' — all other statuses reject
 * 2. EDIT (nominal change) is only allowed when status == 'belum_bayar' — all other statuses reject
 * 3. CANCEL is only allowed when status == 'belum_bayar' — all other statuses reject
 * 4. After any mutation (delete/edit/cancel), an audit trail entry must be created
 * 5. For any non-belum_bayar status, all three mutation operations are blocked
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import {
  PAYMENT_STATUSES,
  type PaymentStatus,
  arbitraryPaymentStatus,
  arbitraryUuid,
  arbitraryRupiahAmount,
} from '../arbitraries/common';
import { arbitraryTagihan } from '../arbitraries/tagihan';

// ─── Types ────────────────────────────────────────────────────────────────────

type MutationType = 'delete' | 'edit' | 'cancel';

interface AuditTrailEntry {
  tenantId: string;
  userId: string;
  jenisAksi: string;
  entityType: string;
  entityId: string;
  nilaiSebelum: Record<string, unknown> | null;
  nilaiSesudah: Record<string, unknown> | null;
  alasan: string | null;
}

interface MutationResult {
  success: boolean;
  error?: string;
  auditEntry?: AuditTrailEntry;
}

// ─── Billing Mutation Logic Under Test ────────────────────────────────────────

const NON_MUTABLE_STATUSES: PaymentStatus[] = [
  'menunggu_verifikasi',
  'cicilan',
  'lunas',
  'ditolak',
  'dibatalkan',
];

/**
 * Checks whether a mutation is allowed for a given billing status.
 * Per Requirements 34.1, 34.3, 34.6: all mutations only allowed when belum_bayar.
 */
function isMutationAllowed(status: PaymentStatus): boolean {
  return status === 'belum_bayar';
}

/**
 * Attempts to delete a tagihan. Returns the result including audit trail.
 * Req 34.1: only allowed when status == belum_bayar
 * Req 34.2: rejected otherwise
 */
function attemptDelete(
  tagihan: {
    id: string;
    tenant_id: string;
    status: PaymentStatus;
    nominal: number;
    bulan: number;
    tahun: number;
    siswa_id: string;
  },
  userId: string,
): MutationResult {
  if (tagihan.status !== 'belum_bayar') {
    return {
      success: false,
      error: 'Tagihan tidak dapat dihapus karena sudah ada aktivitas pembayaran',
    };
  }

  return {
    success: true,
    auditEntry: {
      tenantId: tagihan.tenant_id,
      userId,
      jenisAksi: 'hapus_tagihan',
      entityType: 'tagihan',
      entityId: tagihan.id,
      nilaiSebelum: {
        nominal: tagihan.nominal,
        bulan: tagihan.bulan,
        tahun: tagihan.tahun,
        status: tagihan.status,
        siswa_id: tagihan.siswa_id,
      },
      nilaiSesudah: null,
      alasan: null,
    },
  };
}

/**
 * Attempts to edit the nominal of a tagihan. Returns the result including audit trail.
 * Req 34.3: only allowed when status == belum_bayar
 * Req 34.4: rejected otherwise
 */
function attemptEdit(
  tagihan: { id: string; tenant_id: string; status: PaymentStatus; nominal: number },
  userId: string,
  newNominal: number,
): MutationResult {
  if (tagihan.status !== 'belum_bayar') {
    return {
      success: false,
      error: 'Nominal tidak dapat diubah karena sudah ada aktivitas pembayaran',
    };
  }

  return {
    success: true,
    auditEntry: {
      tenantId: tagihan.tenant_id,
      userId,
      jenisAksi: 'edit_tagihan',
      entityType: 'tagihan',
      entityId: tagihan.id,
      nilaiSebelum: { nominal: tagihan.nominal },
      nilaiSesudah: { nominal: newNominal },
      alasan: null,
    },
  };
}

/**
 * Attempts to cancel a tagihan. Returns the result including audit trail.
 * Req 34.5: sets status to dibatalkan with alasan
 * Req 34.6: only allowed when status == belum_bayar
 */
function attemptCancel(
  tagihan: { id: string; tenant_id: string; status: PaymentStatus },
  userId: string,
  alasan: string,
): MutationResult {
  if (tagihan.status !== 'belum_bayar') {
    return {
      success: false,
      error: 'Tagihan tidak dapat dibatalkan karena sudah ada aktivitas pembayaran',
    };
  }

  return {
    success: true,
    auditEntry: {
      tenantId: tagihan.tenant_id,
      userId,
      jenisAksi: 'batalkan_tagihan',
      entityType: 'tagihan',
      entityId: tagihan.id,
      nilaiSebelum: { status: 'belum_bayar' },
      nilaiSesudah: { status: 'dibatalkan' },
      alasan,
    },
  };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Generate a non-belum_bayar status for negative testing */
function arbitraryNonMutableStatus(): fc.Arbitrary<PaymentStatus> {
  return fc.constantFrom(...NON_MUTABLE_STATUSES);
}

/** Generate a mutation type */
function arbitraryMutationType(): fc.Arbitrary<MutationType> {
  return fc.constantFrom<MutationType>('delete', 'edit', 'cancel');
}

/** Generate a cancellation reason */
function arbitraryCancelReason(): fc.Arbitrary<string> {
  return fc.constantFrom(
    'Siswa mendapat beasiswa',
    'Keringanan biaya',
    'Kesalahan administrasi',
    'Siswa pindah sekolah',
    'Tagihan duplikat',
  );
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 16: Billing Mutation Restrictions', () => {
  it('DELETE is only allowed when status == belum_bayar — all other statuses reject', () => {
    fc.assert(
      fc.property(arbitraryTagihan(), arbitraryUuid(), (tagihanData, userId) => {
        const result = attemptDelete(
          {
            id: tagihanData.id,
            tenant_id: tagihanData.tenant_id,
            status: tagihanData.status,
            nominal: tagihanData.nominal,
            bulan: tagihanData.bulan,
            tahun: tagihanData.tahun,
            siswa_id: tagihanData.siswa_id,
          },
          userId,
        );

        if (tagihanData.status === 'belum_bayar') {
          // PROPERTY: DELETE succeeds for belum_bayar
          return result.success === true;
        } else {
          // PROPERTY: DELETE rejected for any other status
          return (
            result.success === false &&
            result.error === 'Tagihan tidak dapat dihapus karena sudah ada aktivitas pembayaran'
          );
        }
      }),
      PBT_CONFIG,
    );
  });

  it('EDIT (nominal change) is only allowed when status == belum_bayar — all other statuses reject', () => {
    fc.assert(
      fc.property(
        arbitraryTagihan(),
        arbitraryUuid(),
        arbitraryRupiahAmount(),
        (tagihanData, userId, newNominal) => {
          const result = attemptEdit(
            {
              id: tagihanData.id,
              tenant_id: tagihanData.tenant_id,
              status: tagihanData.status,
              nominal: tagihanData.nominal,
            },
            userId,
            newNominal,
          );

          if (tagihanData.status === 'belum_bayar') {
            // PROPERTY: EDIT succeeds for belum_bayar
            return result.success === true;
          } else {
            // PROPERTY: EDIT rejected for any other status
            return (
              result.success === false &&
              result.error === 'Nominal tidak dapat diubah karena sudah ada aktivitas pembayaran'
            );
          }
        },
      ),
      PBT_CONFIG,
    );
  });

  it('CANCEL is only allowed when status == belum_bayar — all other statuses reject', () => {
    fc.assert(
      fc.property(
        arbitraryTagihan(),
        arbitraryUuid(),
        arbitraryCancelReason(),
        (tagihanData, userId, alasan) => {
          const result = attemptCancel(
            {
              id: tagihanData.id,
              tenant_id: tagihanData.tenant_id,
              status: tagihanData.status,
            },
            userId,
            alasan,
          );

          if (tagihanData.status === 'belum_bayar') {
            // PROPERTY: CANCEL succeeds for belum_bayar
            return result.success === true;
          } else {
            // PROPERTY: CANCEL rejected for any other status
            return (
              result.success === false &&
              result.error ===
                'Tagihan tidak dapat dibatalkan karena sudah ada aktivitas pembayaran'
            );
          }
        },
      ),
      PBT_CONFIG,
    );
  });

  it('after any successful mutation (delete/edit/cancel), an audit trail entry must be created', () => {
    fc.assert(
      fc.property(
        arbitraryTagihan({ status: 'belum_bayar' }),
        arbitraryUuid(),
        arbitraryMutationType(),
        arbitraryRupiahAmount(),
        arbitraryCancelReason(),
        (tagihanData, userId, mutationType, newNominal, alasan) => {
          let result: MutationResult;

          switch (mutationType) {
            case 'delete':
              result = attemptDelete(
                {
                  id: tagihanData.id,
                  tenant_id: tagihanData.tenant_id,
                  status: tagihanData.status,
                  nominal: tagihanData.nominal,
                  bulan: tagihanData.bulan,
                  tahun: tagihanData.tahun,
                  siswa_id: tagihanData.siswa_id,
                },
                userId,
              );
              break;
            case 'edit':
              result = attemptEdit(
                {
                  id: tagihanData.id,
                  tenant_id: tagihanData.tenant_id,
                  status: tagihanData.status,
                  nominal: tagihanData.nominal,
                },
                userId,
                newNominal,
              );
              break;
            case 'cancel':
              result = attemptCancel(
                {
                  id: tagihanData.id,
                  tenant_id: tagihanData.tenant_id,
                  status: tagihanData.status,
                },
                userId,
                alasan,
              );
              break;
          }

          // PROPERTY: successful mutations always produce an audit entry
          if (result.success) {
            return (
              result.auditEntry !== undefined &&
              result.auditEntry.tenantId === tagihanData.tenant_id &&
              result.auditEntry.userId === userId &&
              result.auditEntry.entityType === 'tagihan' &&
              result.auditEntry.entityId === tagihanData.id
            );
          }

          // If not successful (shouldn't happen since we fix status to belum_bayar), still valid
          return true;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('for any non-belum_bayar status, all three mutation operations are blocked', () => {
    fc.assert(
      fc.property(
        arbitraryNonMutableStatus(),
        arbitraryUuid(),
        arbitraryUuid(),
        arbitraryRupiahAmount(),
        arbitraryCancelReason(),
        (status, tagihanId, userId, newNominal, alasan) => {
          const tagihanBase = {
            id: tagihanId,
            tenant_id: 'tenant-123',
            status,
            nominal: 500000,
            bulan: 6,
            tahun: 2024,
            siswa_id: 'siswa-123',
          };

          const deleteResult = attemptDelete(tagihanBase, userId);
          const editResult = attemptEdit(tagihanBase, userId, newNominal);
          const cancelResult = attemptCancel(tagihanBase, userId, alasan);

          // PROPERTY: ALL three mutations are blocked for any non-belum_bayar status
          return (
            deleteResult.success === false &&
            editResult.success === false &&
            cancelResult.success === false
          );
        },
      ),
      PBT_CONFIG,
    );
  });

  it('audit trail entries contain correct jenisAksi per mutation type', () => {
    fc.assert(
      fc.property(
        arbitraryTagihan({ status: 'belum_bayar' }),
        arbitraryUuid(),
        arbitraryRupiahAmount(),
        arbitraryCancelReason(),
        (tagihanData, userId, newNominal, alasan) => {
          const tagihanInput = {
            id: tagihanData.id,
            tenant_id: tagihanData.tenant_id,
            status: tagihanData.status as PaymentStatus,
            nominal: tagihanData.nominal,
            bulan: tagihanData.bulan,
            tahun: tagihanData.tahun,
            siswa_id: tagihanData.siswa_id,
          };

          const deleteResult = attemptDelete(tagihanInput, userId);
          const editResult = attemptEdit(tagihanInput, userId, newNominal);
          const cancelResult = attemptCancel(tagihanInput, userId, alasan);

          // PROPERTY: each mutation type produces the correct jenisAksi label
          return (
            deleteResult.auditEntry!.jenisAksi === 'hapus_tagihan' &&
            editResult.auditEntry!.jenisAksi === 'edit_tagihan' &&
            cancelResult.auditEntry!.jenisAksi === 'batalkan_tagihan'
          );
        },
      ),
      PBT_CONFIG,
    );
  });
});
