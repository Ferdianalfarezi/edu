/**
 * Property 9: Overdue invoice detection
 *
 * For any set of tenants with invoices at random dates and statuses, the
 * hasOverdueInvoices flag SHALL be true if and only if at least one invoice
 * has status IN ('belum_bayar', 'cicilan') AND tanggal_jatuh_tempo is MORE
 * than 30 days before the current date.
 *
 * **Validates: Requirements 3.5**
 *
 * Pure logic property test — simulates the overdue detection logic from
 * DashboardService.getCrossTenantMetrics().
 *
 * Tag: Feature: superadmin-cross-tenant-access, Property 9: Overdue invoice detection
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus =
  'belum_bayar' | 'menunggu_verifikasi' | 'cicilan' | 'lunas' | 'ditolak' | 'dibatalkan';

interface Invoice {
  id: string;
  tenant_id: string;
  status: InvoiceStatus;
  tanggal_jatuh_tempo: Date;
  nominal: number;
  total_dibayar: number;
}

// ─── Overdue Detection Logic (mirrors DashboardService SQL) ───────────────────

const UNPAID_STATUSES: InvoiceStatus[] = ['belum_bayar', 'cicilan'];

/**
 * Determines whether a tenant has overdue invoices.
 * Mirrors the SQL: EXISTS(SELECT 1 FROM tagihan WHERE tenant_id = t.id
 *   AND status IN ('belum_bayar', 'cicilan')
 *   AND tanggal_jatuh_tempo < NOW() - INTERVAL '30 days')
 *
 * "More than 30 days overdue" means tanggal_jatuh_tempo < (now - 30 days),
 * i.e., strictly less than (not equal to).
 */
function hasOverdueInvoices(invoices: Invoice[], now: Date): boolean {
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return invoices.some(
    (inv) => UNPAID_STATUSES.includes(inv.status) && inv.tanggal_jatuh_tempo < thirtyDaysAgo,
  );
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

const ALL_STATUSES: InvoiceStatus[] = [
  'belum_bayar',
  'menunggu_verifikasi',
  'cicilan',
  'lunas',
  'ditolak',
  'dibatalkan',
];

const NON_TRIGGERING_STATUSES: InvoiceStatus[] = [
  'menunggu_verifikasi',
  'lunas',
  'ditolak',
  'dibatalkan',
];

/**
 * Generates a random date between 90 days ago and 60 days in the future
 * relative to a given reference date.
 */
function arbitraryInvoiceDate(now: Date): fc.Arbitrary<Date> {
  const ninetyDaysAgo = now.getTime() - 90 * 24 * 60 * 60 * 1000;
  const sixtyDaysAhead = now.getTime() + 60 * 24 * 60 * 60 * 1000;
  return fc.integer({ min: ninetyDaysAgo, max: sixtyDaysAhead }).map((ts) => new Date(ts));
}

/**
 * Generates a single invoice for a given tenant.
 */
function arbitraryInvoice(tenantId: string, now: Date): fc.Arbitrary<Invoice> {
  return fc.record({
    id: arbitraryUuid(),
    tenant_id: fc.constant(tenantId),
    status: fc.constantFrom(...ALL_STATUSES),
    tanggal_jatuh_tempo: arbitraryInvoiceDate(now),
    nominal: fc.integer({ min: 10000, max: 5000000 }),
    total_dibayar: fc.integer({ min: 0, max: 5000000 }),
  });
}

/**
 * Generates 0-10 invoices for a tenant.
 */
function arbitraryTenantInvoices(tenantId: string, now: Date): fc.Arbitrary<Invoice[]> {
  return fc.array(arbitraryInvoice(tenantId, now), {
    minLength: 0,
    maxLength: 10,
  });
}

/**
 * Generates a set of 2-5 tenants, each with 0-10 random invoices.
 */
function arbitraryTenantsWithInvoices(
  now: Date,
): fc.Arbitrary<{ tenantId: string; invoices: Invoice[] }[]> {
  return fc.uniqueArray(arbitraryUuid(), { minLength: 2, maxLength: 5 }).chain((tenantIds) =>
    fc
      .tuple(
        ...tenantIds.map((tid) =>
          arbitraryTenantInvoices(tid, now).map((invoices) => ({
            tenantId: tid,
            invoices,
          })),
        ),
      )
      .map((tenants) => [...tenants]),
  );
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 9: Overdue invoice detection', () => {
  const now = new Date();

  it('returns true only when at least one invoice has unpaid status AND is more than 30 days overdue', () => {
    fc.assert(
      fc.property(arbitraryTenantsWithInvoices(now), (tenants) => {
        for (const { invoices } of tenants) {
          const result = hasOverdueInvoices(invoices, now);
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

          // Manually check: is there at least one qualifying invoice?
          const hasQualifying = invoices.some(
            (inv) =>
              UNPAID_STATUSES.includes(inv.status) && inv.tanggal_jatuh_tempo < thirtyDaysAgo,
          );

          // PROPERTY: result matches the manual check
          if (result !== hasQualifying) return false;
        }
        return true;
      }),
      PBT_CONFIG,
    );
  });

  it('when hasOverdueInvoices is true, there exists at least one invoice with unpaid status AND tanggal_jatuh_tempo > 30 days overdue', () => {
    fc.assert(
      fc.property(arbitraryTenantsWithInvoices(now), (tenants) => {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        for (const { invoices } of tenants) {
          const result = hasOverdueInvoices(invoices, now);
          if (result) {
            // There MUST exist a witness invoice
            const witness = invoices.find(
              (inv) =>
                UNPAID_STATUSES.includes(inv.status) && inv.tanggal_jatuh_tempo < thirtyDaysAgo,
            );
            if (!witness) return false;
          }
        }
        return true;
      }),
      PBT_CONFIG,
    );
  });

  it('when hasOverdueInvoices is false, no invoice satisfies both conditions', () => {
    fc.assert(
      fc.property(arbitraryTenantsWithInvoices(now), (tenants) => {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        for (const { invoices } of tenants) {
          const result = hasOverdueInvoices(invoices, now);
          if (!result) {
            // NO invoice should satisfy both conditions
            const badInvoice = invoices.find(
              (inv) =>
                UNPAID_STATUSES.includes(inv.status) && inv.tanggal_jatuh_tempo < thirtyDaysAgo,
            );
            if (badInvoice) return false;
          }
        }
        return true;
      }),
      PBT_CONFIG,
    );
  });

  it('invoices with non-triggering statuses never cause overdue detection regardless of date', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(),
        fc.array(
          fc.record({
            id: arbitraryUuid(),
            tenant_id: arbitraryUuid(),
            status: fc.constantFrom(...NON_TRIGGERING_STATUSES),
            // Force all dates to be far in the past (well over 30 days overdue)
            tanggal_jatuh_tempo: fc
              .integer({
                min: now.getTime() - 365 * 24 * 60 * 60 * 1000,
                max: now.getTime() - 60 * 24 * 60 * 60 * 1000,
              })
              .map((ts) => new Date(ts)),
            nominal: fc.integer({ min: 10000, max: 5000000 }),
            total_dibayar: fc.integer({ min: 0, max: 5000000 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (_tenantId, invoices) => {
          // PROPERTY: non-triggering statuses never trigger overdue,
          // even when dates are far in the past
          return hasOverdueInvoices(invoices, now) === false;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('an invoice exactly 30 days old is NOT overdue (must be MORE than 30 days)', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(),
        fc.constantFrom<InvoiceStatus>('belum_bayar', 'cicilan'),
        fc.integer({ min: 10000, max: 5000000 }),
        (tenantId, status, nominal) => {
          // Create an invoice with tanggal_jatuh_tempo exactly 30 days ago
          const exactlyThirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

          const invoice: Invoice = {
            id: 'test-invoice-id',
            tenant_id: tenantId,
            status,
            tanggal_jatuh_tempo: exactlyThirtyDaysAgo,
            nominal,
            total_dibayar: 0,
          };

          // PROPERTY: exactly 30 days is NOT overdue
          // The condition is strictly less than (tanggal_jatuh_tempo < thirtyDaysAgo)
          // When tanggal_jatuh_tempo === thirtyDaysAgo, the comparison is false
          return hasOverdueInvoices([invoice], now) === false;
        },
      ),
      PBT_CONFIG,
    );
  });
});
