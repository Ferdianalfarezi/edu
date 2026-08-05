import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  parsePage,
  parsePageSize,
  parseStringFilter,
  parseEnumFilter,
  buildQueryObject,
} from '../urlStateParsers';
import {
  ALLOWED_PAGE_SIZES,
  type FilterConfig,
  type TableUrlStateConfig,
} from '../useTableUrlState';

// Feature: sistem-pengembangan-v2, Property 16: Filter aktif tersimpan di URL query params dan identik setelah navigasi kembali

/**
 * Helper: serialize a keuangan filter state into a URLSearchParams-compatible
 * plain object using buildQueryObject, then parse it back using the individual
 * parser functions. This is the pure round-trip logic extracted from
 * useTableUrlState (read → URL → read).
 *
 * This mirrors what happens when:
 * 1. User sets filters → composable calls buildQueryObject → router.replace(query)
 * 2. User navigates away and back → browser restores URL → route.query watcher
 *    re-reads values via parsePage / parsePageSize / parseStringFilter / parseEnumFilter
 */

/**
 * Represents the keuangan subpage filter state as the composable tracks it.
 */
interface KeuanganFilterState {
  page: number;
  pageSize: (typeof ALLOWED_PAGE_SIZES)[number];
  status: string | undefined;
  bulan: string | undefined;
  tahun: string | undefined;
  kelasId: string | undefined;
}

const STATUS_VALUES = ['lunas', 'belum_lunas', 'terlambat'] as const;
const BULAN_VALUES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const;

// ── Arbitraries ──────────────────────────────────────────────────────────────

const arbPage = fc.integer({ min: 1, max: 9999 });

const arbPageSize = fc.constantFrom(...ALLOWED_PAGE_SIZES);

/** A non-empty string that would survive the URL round-trip unchanged */
const arbNonEmptyString = fc
  .string({ minLength: 1, maxLength: 60 })
  .filter((s) => s.trim().length > 0 && !s.includes('\0'));

/** status is an enum; undefined means filter is not set */
const arbStatus = fc.option(fc.constantFrom(...STATUS_VALUES), { nil: undefined });

/** bulan is an enum (month number as string) or undefined */
const arbBulan = fc.option(fc.constantFrom(...BULAN_VALUES), { nil: undefined });

/** tahun is a four-digit year string or undefined */
const arbTahun = fc.option(fc.integer({ min: 2000, max: 2099 }).map(String), { nil: undefined });

/** kelasId is a free-form string (UUID-like) or undefined */
const arbKelasId = fc.option(arbNonEmptyString, { nil: undefined });

/** Complete arbitrary keuangan filter state */
const arbKeuanganState: fc.Arbitrary<KeuanganFilterState> = fc.record({
  page: arbPage,
  pageSize: arbPageSize,
  status: arbStatus,
  bulan: arbBulan,
  tahun: arbTahun,
  kelasId: arbKelasId,
});

// ── Serialize / Deserialize helpers ──────────────────────────────────────────

const KEUANGAN_FILTER_CONFIGS: FilterConfig[] = [
  { key: 'status', type: 'enum', enumValues: [...STATUS_VALUES] },
  { key: 'bulan', type: 'enum', enumValues: [...BULAN_VALUES] },
  { key: 'tahun', type: 'string' },
  { key: 'kelasId', type: 'string' },
];

const KEUANGAN_CONFIG: TableUrlStateConfig = {
  defaultPageSize: 15,
  filters: KEUANGAN_FILTER_CONFIGS,
};

/**
 * Serialize a KeuanganFilterState to the URL query object that buildQueryObject produces.
 * This is what `syncToUrl` does inside useTableUrlState.
 */
function serializeKeuanganFilters(state: KeuanganFilterState): Record<string, string | undefined> {
  return buildQueryObject(
    {
      page: state.page,
      pageSize: state.pageSize,
      search: '',
      filters: {
        status: state.status,
        bulan: state.bulan,
        tahun: state.tahun,
        kelasId: state.kelasId,
      },
    },
    KEUANGAN_CONFIG,
    {}, // no pre-existing unknown params
  );
}

/**
 * Deserialize a serialized URL query object back to a KeuanganFilterState.
 * This is what the route.query watcher does inside useTableUrlState.
 */
function deserializeKeuanganFilters(
  query: Record<string, string | undefined>,
): KeuanganFilterState {
  return {
    page: parsePage(query['page']),
    pageSize: parsePageSize(
      query['page_size'],
      KEUANGAN_CONFIG.defaultPageSize,
    ) as (typeof ALLOWED_PAGE_SIZES)[number],
    status: parseEnumFilter(query['status'], [...STATUS_VALUES]),
    bulan: parseEnumFilter(query['bulan'], [...BULAN_VALUES]),
    tahun: parseStringFilter(query['tahun']),
    kelasId: parseStringFilter(query['kelasId']),
  };
}

// ── Property 16 ──────────────────────────────────────────────────────────────

/**
 * Property 16: Filter aktif tersimpan di URL query params dan identik setelah navigasi kembali
 *
 * For any arbitrary combination of keuangan subpage filters:
 *   deserializeFilters(serializeFilters(state)) === state
 *
 * This ensures that when a user navigates away from a keuangan subpage and
 * returns, the exact same filters are restored from the URL query params —
 * satisfying Req 10.5 which mandates that filter state is not lost on
 * back-navigation.
 *
 * **Validates: Requirements 10.5**
 */
describe('Feature: sistem-pengembangan-v2, Property 16: Filter aktif tersimpan di URL query params dan identik setelah navigasi kembali', () => {
  it('round-trip: deserializeFilters(serializeFilters(state)) is identical to the original state', () => {
    fc.assert(
      fc.property(arbKeuanganState, (original) => {
        const serialized = serializeKeuanganFilters(original);
        const restored = deserializeKeuanganFilters(serialized);

        expect(restored.page).toBe(original.page);
        expect(restored.pageSize).toBe(original.pageSize);
        expect(restored.status).toBe(original.status);
        expect(restored.bulan).toBe(original.bulan);
        expect(restored.tahun).toBe(original.tahun);
        expect(restored.kelasId).toBe(original.kelasId);
      }),
      { numRuns: 100 },
    );
  });

  it('page=1 is omitted from URL but correctly restored as 1 after round-trip', () => {
    fc.assert(
      fc.property(
        fc.record({
          pageSize: arbPageSize,
          status: arbStatus,
          bulan: arbBulan,
          tahun: arbTahun,
          kelasId: arbKelasId,
        }),
        (partial) => {
          const original: KeuanganFilterState = { ...partial, page: 1 };
          const serialized = serializeKeuanganFilters(original);

          // page=1 must be omitted from URL (clean URL invariant)
          expect(serialized).not.toHaveProperty('page');

          // Restoring from URL must still produce page=1
          const restored = deserializeKeuanganFilters(serialized);
          expect(restored.page).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('default pageSize (15) is omitted from URL but correctly restored after round-trip', () => {
    fc.assert(
      fc.property(
        fc.record({
          page: arbPage,
          status: arbStatus,
          bulan: arbBulan,
          tahun: arbTahun,
          kelasId: arbKelasId,
        }),
        (partial) => {
          const original: KeuanganFilterState = { ...partial, pageSize: 15 };
          const serialized = serializeKeuanganFilters(original);

          // pageSize=15 (default) must be omitted from URL
          expect(serialized).not.toHaveProperty('page_size');

          // Restoring from URL must still produce pageSize=15
          const restored = deserializeKeuanganFilters(serialized);
          expect(restored.pageSize).toBe(15);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('undefined filters are omitted from URL but correctly restored as undefined after round-trip', () => {
    fc.assert(
      fc.property(
        fc.record({
          page: arbPage,
          pageSize: arbPageSize,
        }),
        ({ page, pageSize }) => {
          // All keuangan-specific filters explicitly undefined
          const original: KeuanganFilterState = {
            page,
            pageSize,
            status: undefined,
            bulan: undefined,
            tahun: undefined,
            kelasId: undefined,
          };

          const serialized = serializeKeuanganFilters(original);

          // None of the filter keys should appear in the URL
          expect(serialized).not.toHaveProperty('status');
          expect(serialized).not.toHaveProperty('bulan');
          expect(serialized).not.toHaveProperty('tahun');
          expect(serialized).not.toHaveProperty('kelasId');

          // Restoring from URL must produce undefined for all filters
          const restored = deserializeKeuanganFilters(serialized);
          expect(restored.status).toBeUndefined();
          expect(restored.bulan).toBeUndefined();
          expect(restored.tahun).toBeUndefined();
          expect(restored.kelasId).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('active (non-undefined) filters appear in URL and survive round-trip', () => {
    fc.assert(
      fc.property(
        fc.record({
          page: arbPage,
          pageSize: arbPageSize,
          status: fc.constantFrom(...STATUS_VALUES), // always defined
          bulan: fc.constantFrom(...BULAN_VALUES), // always defined
          tahun: fc.integer({ min: 2020, max: 2030 }).map(String), // always defined
          kelasId: arbNonEmptyString, // always defined
        }),
        (original) => {
          const serialized = serializeKeuanganFilters(original);

          // All active filters MUST appear in the URL
          expect(serialized).toHaveProperty('status', original.status);
          expect(serialized).toHaveProperty('bulan', original.bulan);
          expect(serialized).toHaveProperty('tahun', original.tahun);
          expect(serialized).toHaveProperty('kelasId', original.kelasId);

          // And survive the full round-trip unchanged
          const restored = deserializeKeuanganFilters(serialized);
          expect(restored.status).toBe(original.status);
          expect(restored.bulan).toBe(original.bulan);
          expect(restored.tahun).toBe(original.tahun);
          expect(restored.kelasId).toBe(original.kelasId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('non-enum strings injected as status/bulan in URL deserialize to undefined (invalid values rejected)', () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => !(STATUS_VALUES as readonly string[]).includes(s)),
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => !(BULAN_VALUES as readonly string[]).includes(s)),
        (badStatus, badBulan) => {
          // Simulate a tampered / stale URL with invalid enum values
          const tamperedQuery: Record<string, string | undefined> = {
            status: badStatus,
            bulan: badBulan,
          };

          const restored = deserializeKeuanganFilters(tamperedQuery);

          // Invalid enum values must be rejected, not silently passed through
          expect(restored.status).toBeUndefined();
          expect(restored.bulan).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
