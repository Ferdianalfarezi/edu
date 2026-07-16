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
  DEFAULT_PAGE_SIZE,
  type TableUrlStateConfig,
} from '../useTableUrlState';

/**
 * Property 1: State-to-URL Round Trip
 *
 * For any valid table state configuration and any set of valid state values
 * (page ≥ 1, pageSize ∈ {10, 15, 25, 50}, search string, filter values matching
 * their configured types), serializing state to URL query params and then parsing
 * those params back should produce the original state values.
 *
 * **Validates: Requirements 1.2, 1.3, 2.1**
 */
describe('Property 1: State-to-URL Round Trip', () => {
  const allowedPageSizes = [10, 15, 25, 50] as const;

  // Arbitrary for non-empty search strings (empty search has special behavior)
  const nonEmptySearchArb = fc.string({ minLength: 1 }).filter((s) => s !== '');

  // Enum values used for filter testing
  const sampleEnumValues = ['aktif', 'pindah_sekolah', 'keluar', 'alumni'];

  it('round-trips page, pageSize, and non-empty search correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom(...allowedPageSizes),
        nonEmptySearchArb,
        (page, pageSize, search) => {
          const config: TableUrlStateConfig = {
            searchKey: 'search',
            defaultPageSize: DEFAULT_PAGE_SIZE,
            filters: [],
          };

          const state = {
            page,
            pageSize,
            search,
            filters: {} as Record<string, string | undefined>,
          };

          // Serialize to query
          const query = buildQueryObject(state, config, {});

          // Parse back
          const parsedPage = parsePage(query['page']);
          const parsedPageSize = parsePageSize(query['page_size'], DEFAULT_PAGE_SIZE);
          const parsedSearch = parseStringFilter(query['search']);

          // Verify round-trip identity
          expect(parsedPage).toBe(page);
          expect(parsedPageSize).toBe(pageSize);
          // Non-empty search should survive round-trip exactly
          expect(parsedSearch).toBe(search);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('round-trips default page (1) correctly through omission', () => {
    fc.assert(
      fc.property(fc.constantFrom(...allowedPageSizes), nonEmptySearchArb, (pageSize, search) => {
        const config: TableUrlStateConfig = {
          searchKey: 'search',
          defaultPageSize: DEFAULT_PAGE_SIZE,
          filters: [],
        };

        const state = {
          page: 1,
          pageSize,
          search,
          filters: {} as Record<string, string | undefined>,
        };

        const query = buildQueryObject(state, config, {});

        // page=1 is omitted from URL
        expect(query['page']).toBeUndefined();
        // parsePage(undefined) returns 1
        expect(parsePage(query['page'])).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it('round-trips default pageSize correctly through omission', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), nonEmptySearchArb, (page, search) => {
        const config: TableUrlStateConfig = {
          searchKey: 'search',
          defaultPageSize: DEFAULT_PAGE_SIZE,
          filters: [],
        };

        const state = {
          page,
          pageSize: DEFAULT_PAGE_SIZE,
          search,
          filters: {} as Record<string, string | undefined>,
        };

        const query = buildQueryObject(state, config, {});

        // Default pageSize is omitted from URL
        expect(query['page_size']).toBeUndefined();
        // parsePageSize(undefined, default) returns default
        expect(parsePageSize(query['page_size'], DEFAULT_PAGE_SIZE)).toBe(DEFAULT_PAGE_SIZE);
      }),
      { numRuns: 100 },
    );
  });

  it('round-trips empty search correctly (omitted → parseStringFilter returns undefined)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom(...allowedPageSizes),
        (page, pageSize) => {
          const config: TableUrlStateConfig = {
            searchKey: 'search',
            defaultPageSize: DEFAULT_PAGE_SIZE,
            filters: [],
          };

          const state = {
            page,
            pageSize,
            search: '',
            filters: {} as Record<string, string | undefined>,
          };

          const query = buildQueryObject(state, config, {});

          // Empty search is omitted from URL
          expect(query['search']).toBeUndefined();
          // parseStringFilter(undefined) returns undefined — the composable maps this back to ''
          expect(parseStringFilter(query['search'])).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('round-trips string filters correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom(...allowedPageSizes),
        fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        (page, pageSize, filterValue) => {
          const config: TableUrlStateConfig = {
            searchKey: 'search',
            defaultPageSize: DEFAULT_PAGE_SIZE,
            filters: [{ key: 'kelas_id', type: 'string' }],
          };

          const state = {
            page,
            pageSize,
            search: '',
            filters: { kelas_id: filterValue } as Record<string, string | undefined>,
          };

          const query = buildQueryObject(state, config, {});

          // Parse back
          const parsedFilter = parseStringFilter(query['kelas_id']);

          if (filterValue === undefined) {
            // Undefined filter is omitted; parsing undefined gives undefined
            expect(parsedFilter).toBeUndefined();
          } else {
            // Non-empty string filter should round-trip
            expect(parsedFilter).toBe(filterValue);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('round-trips enum filters correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom(...allowedPageSizes),
        fc.option(fc.constantFrom(...sampleEnumValues), { nil: undefined }),
        (page, pageSize, filterValue) => {
          const config: TableUrlStateConfig = {
            searchKey: 'search',
            defaultPageSize: DEFAULT_PAGE_SIZE,
            filters: [{ key: 'status', type: 'enum', enumValues: sampleEnumValues }],
          };

          const state = {
            page,
            pageSize,
            search: '',
            filters: { status: filterValue } as Record<string, string | undefined>,
          };

          const query = buildQueryObject(state, config, {});

          // Parse back
          const parsedFilter = parseEnumFilter(query['status'], sampleEnumValues);

          if (filterValue === undefined) {
            expect(parsedFilter).toBeUndefined();
          } else {
            expect(parsedFilter).toBe(filterValue);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('round-trips full state with multiple filters correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 1000 }),
        fc.constantFrom(...allowedPageSizes).filter((s) => s !== DEFAULT_PAGE_SIZE),
        nonEmptySearchArb,
        fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        fc.option(fc.constantFrom(...sampleEnumValues), { nil: undefined }),
        fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        (page, pageSize, search, kelasFilter, statusFilter, tahunFilter) => {
          const config: TableUrlStateConfig = {
            searchKey: 'search',
            defaultPageSize: DEFAULT_PAGE_SIZE,
            filters: [
              { key: 'kelas_id', type: 'string' },
              { key: 'status', type: 'enum', enumValues: sampleEnumValues },
              { key: 'tahun_ajaran_id', type: 'string' },
            ],
          };

          const state = {
            page,
            pageSize,
            search,
            filters: {
              kelas_id: kelasFilter,
              status: statusFilter,
              tahun_ajaran_id: tahunFilter,
            } as Record<string, string | undefined>,
          };

          const query = buildQueryObject(state, config, {});

          // Parse everything back
          const parsedPage = parsePage(query['page']);
          const parsedPageSize = parsePageSize(query['page_size'], DEFAULT_PAGE_SIZE);
          const parsedSearch = parseStringFilter(query['search']);
          const parsedKelas = parseStringFilter(query['kelas_id']);
          const parsedStatus = parseEnumFilter(query['status'], sampleEnumValues);
          const parsedTahun = parseStringFilter(query['tahun_ajaran_id']);

          // All non-default values should survive round-trip
          expect(parsedPage).toBe(page);
          expect(parsedPageSize).toBe(pageSize);
          expect(parsedSearch).toBe(search);

          if (kelasFilter === undefined) {
            expect(parsedKelas).toBeUndefined();
          } else {
            expect(parsedKelas).toBe(kelasFilter);
          }

          if (statusFilter === undefined) {
            expect(parsedStatus).toBeUndefined();
          } else {
            expect(parsedStatus).toBe(statusFilter);
          }

          if (tahunFilter === undefined) {
            expect(parsedTahun).toBeUndefined();
          } else {
            expect(parsedTahun).toBe(tahunFilter);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
