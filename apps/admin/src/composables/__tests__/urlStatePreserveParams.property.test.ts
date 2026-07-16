import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildQueryObject } from '../urlStateParsers';
import { DEFAULT_PAGE_SIZE, type TableUrlStateConfig } from '../useTableUrlState';

/**
 * Property 8: Unknown Query Parameters Are Preserved
 *
 * For any set of query parameters in the URL that are not part of the composable's
 * configuration (unknown params), after any state change triggers a URL update via
 * router.replace(), the resulting query object must still contain all those unknown
 * parameters with their original values.
 *
 * **Validates: Requirements 7.4**
 */
describe('Property 8: Unknown Query Parameters Are Preserved', () => {
  // Managed keys that should NOT be generated as "unknown" params
  const baseManagedKeys = ['page', 'page_size', 'search'];

  // Keys that have special behavior on JS objects and should be excluded from testing
  const reservedObjectKeys = ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'];

  // Arbitrary for unknown param keys: non-empty strings excluding managed and reserved keys
  function unknownKeyArb(extraManagedKeys: string[] = []) {
    const allExcluded = new Set([...baseManagedKeys, ...extraManagedKeys, ...reservedObjectKeys]);
    return fc
      .string({ minLength: 1, maxLength: 30 })
      .filter((key) => !allExcluded.has(key) && key.trim().length > 0);
  }

  // Arbitrary for query param values (strings, since all URL params are strings)
  const queryValueArb = fc.string({ maxLength: 100 });

  it('preserves all unknown query params when building query object with no filters', () => {
    fc.assert(
      fc.property(
        // Generate 1-5 unknown key-value pairs with unique keys
        fc.uniqueArray(fc.tuple(unknownKeyArb(), queryValueArb), {
          minLength: 1,
          maxLength: 5,
          selector: ([key]) => key,
        }),
        fc.integer({ min: 1, max: 100 }),
        fc.constantFrom(10, 15, 25, 50),
        fc.string(),
        (unknownParams, page, pageSize, search) => {
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

          // Build the currentQuery with unknown params
          const currentQuery: Record<string, string | string[] | undefined> = {};
          for (const [key, value] of unknownParams) {
            currentQuery[key] = value;
          }

          const result = buildQueryObject(state, config, currentQuery);

          // Verify ALL unknown params are preserved with their original values
          for (const [key, value] of unknownParams) {
            expect(result[key]).toBe(value);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('preserves unknown params when config has filters defined', () => {
    fc.assert(
      fc.property(
        // Generate a uniqueArray of unknown key-value pairs (excluding filter keys)
        fc.uniqueArray(
          fc.tuple(unknownKeyArb(['kelas_id', 'status', 'tahun_ajaran_id']), queryValueArb),
          { minLength: 1, maxLength: 5, selector: ([key]) => key },
        ),
        fc.integer({ min: 1, max: 100 }),
        fc.constantFrom(10, 15, 25, 50),
        fc.string(),
        fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        fc.option(fc.constantFrom('aktif', 'pindah_sekolah', 'keluar', 'alumni'), {
          nil: undefined,
        }),
        (unknownParams, page, pageSize, search, kelasFilter, statusFilter) => {
          const config: TableUrlStateConfig = {
            searchKey: 'search',
            defaultPageSize: DEFAULT_PAGE_SIZE,
            filters: [
              { key: 'kelas_id', type: 'string' },
              {
                key: 'status',
                type: 'enum',
                enumValues: ['aktif', 'pindah_sekolah', 'keluar', 'alumni'],
              },
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
              tahun_ajaran_id: undefined,
            } as Record<string, string | undefined>,
          };

          // Build the currentQuery with both managed and unknown params
          const currentQuery: Record<string, string | string[] | undefined> = {};
          for (const [key, value] of unknownParams) {
            currentQuery[key] = value;
          }

          const result = buildQueryObject(state, config, currentQuery);

          // Verify ALL unknown params are preserved with their original values
          for (const [key, value] of unknownParams) {
            expect(result[key]).toBe(value);
          }

          // Also verify managed params are correctly handled
          if (page === 1) {
            expect(result['page']).toBeUndefined();
          }
          if (pageSize === DEFAULT_PAGE_SIZE) {
            expect(result['page_size']).toBeUndefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('unknown params are not modified — same key, same value', () => {
    fc.assert(
      fc.property(
        // Generate random unknown params with unique keys and variety of values (including special chars)
        fc.uniqueArray(
          fc.tuple(
            unknownKeyArb(),
            fc.oneof(
              fc.string(),
              fc.string({ minLength: 1 }).map((s) => `${s}&=${s}`), // Values with special URL chars
              fc.integer().map(String), // Numeric strings
            ),
          ),
          { minLength: 1, maxLength: 5, selector: ([key]) => key },
        ),
        (unknownParams) => {
          const config: TableUrlStateConfig = {
            searchKey: 'search',
            defaultPageSize: DEFAULT_PAGE_SIZE,
            filters: [],
          };

          const state = {
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
            search: '',
            filters: {} as Record<string, string | undefined>,
          };

          // Build the currentQuery with unknown params
          const currentQuery: Record<string, string | string[] | undefined> = {};
          for (const [key, value] of unknownParams) {
            currentQuery[key] = value;
          }

          const result = buildQueryObject(state, config, currentQuery);

          // Verify each unknown param is exactly preserved (not modified in any way)
          for (const [key, value] of unknownParams) {
            expect(result[key]).toStrictEqual(value);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
