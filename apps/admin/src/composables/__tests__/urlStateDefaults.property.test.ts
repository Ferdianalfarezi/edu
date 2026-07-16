import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildQueryObject } from '../urlStateParsers';
import {
  ALLOWED_PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  type TableUrlStateConfig,
} from '../useTableUrlState';

/**
 * Property 2: Default Values Are Omitted from URL
 *
 * For any table state configuration, when a state value equals its default
 * (page=1, pageSize=config.defaultPageSize, search='', filter=undefined or filter=default),
 * the corresponding query parameter must NOT appear in the serialized URL query object.
 *
 * **Validates: Requirements 1.6, 2.8, 3.3, 4.4, 5.3, 6.6**
 */
describe('Feature: url-state-persistence, Property 2: Default Values Are Omitted from URL', () => {
  // Arbitrary for generating a defaultPageSize from the allowed set
  const arbDefaultPageSize = fc.constantFrom(...ALLOWED_PAGE_SIZES);

  // Arbitrary for generating a config with random filters
  const arbFilterKey = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[a-z][a-z0-9_]*$/.test(s) && !['page', 'page_size', 'search'].includes(s));

  const arbFilterDefault = fc.oneof(
    fc.constant(undefined as string | undefined),
    fc.string({ minLength: 1, maxLength: 10 }),
  );

  it('when page === 1, the result should NOT have a "page" key', () => {
    fc.assert(
      fc.property(arbDefaultPageSize, fc.string(), (defaultPageSize, search) => {
        const config: TableUrlStateConfig = { defaultPageSize };
        const state = {
          page: 1,
          pageSize: defaultPageSize,
          search,
          filters: {},
        };
        const result = buildQueryObject(state, config, {});
        expect(result).not.toHaveProperty('page');
      }),
      { numRuns: 100 },
    );
  });

  it('when pageSize === config.defaultPageSize, the result should NOT have a "page_size" key', () => {
    fc.assert(
      fc.property(
        arbDefaultPageSize,
        fc.integer({ min: 1, max: 100 }),
        fc.string(),
        (defaultPageSize, page, search) => {
          const config: TableUrlStateConfig = { defaultPageSize };
          const state = {
            page,
            pageSize: defaultPageSize,
            search,
            filters: {},
          };
          const result = buildQueryObject(state, config, {});
          expect(result).not.toHaveProperty('page_size');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when search === "", the result should NOT have the searchKey', () => {
    fc.assert(
      fc.property(
        arbDefaultPageSize,
        fc.oneof(
          fc.constant(undefined as string | undefined),
          fc.constant('search'),
          fc.constant('q'),
        ),
        (defaultPageSize, searchKey) => {
          const resolvedSearchKey = searchKey ?? 'search';
          const config: TableUrlStateConfig = { defaultPageSize, searchKey };
          const state = {
            page: 1,
            pageSize: defaultPageSize,
            search: '',
            filters: {},
          };
          const result = buildQueryObject(state, config, {});
          expect(result).not.toHaveProperty(resolvedSearchKey);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when a filter value is undefined, the result should NOT have that filter key', () => {
    fc.assert(
      fc.property(arbDefaultPageSize, arbFilterKey, (defaultPageSize, filterKey) => {
        const config: TableUrlStateConfig = {
          defaultPageSize,
          filters: [{ key: filterKey, type: 'string' }],
        };
        const state = {
          page: 1,
          pageSize: defaultPageSize,
          search: '',
          filters: { [filterKey]: undefined },
        };
        const result = buildQueryObject(state, config, {});
        expect(result).not.toHaveProperty(filterKey);
      }),
      { numRuns: 100 },
    );
  });

  it('when a filter value equals its configured default, the result should NOT have that filter key', () => {
    fc.assert(
      fc.property(
        arbDefaultPageSize,
        arbFilterKey,
        fc.string({ minLength: 1, maxLength: 10 }),
        (defaultPageSize, filterKey, filterDefault) => {
          const config: TableUrlStateConfig = {
            defaultPageSize,
            filters: [{ key: filterKey, type: 'string', default: filterDefault }],
          };
          const state = {
            page: 1,
            pageSize: defaultPageSize,
            search: '',
            filters: { [filterKey]: filterDefault },
          };
          const result = buildQueryObject(state, config, {});
          expect(result).not.toHaveProperty(filterKey);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when ALL values are at defaults, the result has NO managed keys', () => {
    fc.assert(
      fc.property(
        arbDefaultPageSize,
        fc.oneof(
          fc.constant(undefined as string | undefined),
          fc.constant('search'),
          fc.constant('q'),
        ),
        fc.array(
          fc.record({
            key: arbFilterKey,
            hasDefault: fc.boolean(),
            defaultValue: fc.string({ minLength: 1, maxLength: 10 }),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        (defaultPageSize, searchKey, filterSpecs) => {
          // Deduplicate filter keys
          const seenKeys = new Set<string>();
          const uniqueFilterSpecs = filterSpecs.filter((f) => {
            if (seenKeys.has(f.key)) return false;
            seenKeys.add(f.key);
            return true;
          });

          const resolvedSearchKey = searchKey ?? 'search';

          const filters = uniqueFilterSpecs.map((f) => ({
            key: f.key,
            type: 'string' as const,
            default: f.hasDefault ? f.defaultValue : undefined,
          }));

          const config: TableUrlStateConfig = {
            defaultPageSize,
            searchKey,
            filters,
          };

          // Set all filter values to their defaults (undefined if no default configured)
          const filterState: Record<string, string | undefined> = {};
          for (const f of uniqueFilterSpecs) {
            filterState[f.key] = f.hasDefault ? f.defaultValue : undefined;
          }

          const state = {
            page: 1,
            pageSize: defaultPageSize,
            search: '',
            filters: filterState,
          };

          const result = buildQueryObject(state, config, {});

          // Verify NO managed keys exist in the result
          const managedKeys = new Set<string>(['page', 'page_size', resolvedSearchKey]);
          for (const f of uniqueFilterSpecs) {
            managedKeys.add(f.key);
          }

          for (const key of managedKeys) {
            expect(result).not.toHaveProperty(key);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
