/**
 * Property 10: Pagination metadata correctness
 *
 * For any list endpoint called with valid `page` and `page_size` parameters,
 * the response SHALL include:
 * - meta.total_pages === ceil(total_count / page_size)
 * - data.length <= page_size
 * - meta.page === requested page
 *
 * **Validates: Requirements 7.2, 7.4**
 *
 * Pure logic property test — exercises the offset-based paginate() utility
 * directly with arbitrary inputs. No DB or network dependencies.
 *
 * Tag: Feature: superadmin-cross-tenant-access, Property 10: Pagination metadata correctness
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { paginate } from '../../../src/common/utils/paginate';

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/**
 * Generates a valid total_count between 0 and 10000.
 */
function arbitraryTotalCount(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: 10000 });
}

/**
 * Generates a valid page number between 1 and 100.
 */
function arbitraryPage(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 100 });
}

/**
 * Generates a valid page_size between 1 and 100.
 */
function arbitraryPageSize(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 100 });
}

/**
 * Generates a list of placeholder items of a given length.
 * These represent the "slice" of data a DB would return for the current page.
 */
function generateItems(count: number): { id: number }[] {
  return Array.from({ length: count }, (_, i) => ({ id: i }));
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 10: Pagination metadata correctness', () => {
  describe('meta.total_pages === ceil(total_count / page_size)', () => {
    it('total_pages is always the ceiling of total_count divided by page_size', () => {
      fc.assert(
        fc.property(
          arbitraryTotalCount(),
          arbitraryPage(),
          arbitraryPageSize(),
          (totalCount, page, pageSize) => {
            // Simulate a page slice — items returned for this page
            // The actual data length is at most page_size, limited by remaining records
            const startIndex = (page - 1) * pageSize;
            const availableItems = Math.max(0, totalCount - startIndex);
            const itemsOnPage = Math.min(pageSize, availableItems);
            const items = generateItems(itemsOnPage);

            const result = paginate(items, totalCount, page, pageSize);

            // PROPERTY: total_pages equals ceil(total_count / page_size)
            const expectedTotalPages = Math.ceil(totalCount / pageSize);
            return result.meta.total_pages === expectedTotalPages;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('data.length <= page_size', () => {
    it('the number of items returned never exceeds page_size', () => {
      fc.assert(
        fc.property(
          arbitraryTotalCount(),
          arbitraryPage(),
          arbitraryPageSize(),
          (totalCount, page, pageSize) => {
            // Items on this page: at most page_size, but could be less on the last page
            const startIndex = (page - 1) * pageSize;
            const availableItems = Math.max(0, totalCount - startIndex);
            const itemsOnPage = Math.min(pageSize, availableItems);
            const items = generateItems(itemsOnPage);

            const result = paginate(items, totalCount, page, pageSize);

            // PROPERTY: data.length is at most page_size
            return result.data.length <= pageSize;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('meta.page === requested page', () => {
    it('the response meta.page always matches the requested page number', () => {
      fc.assert(
        fc.property(
          arbitraryTotalCount(),
          arbitraryPage(),
          arbitraryPageSize(),
          (totalCount, page, pageSize) => {
            const startIndex = (page - 1) * pageSize;
            const availableItems = Math.max(0, totalCount - startIndex);
            const itemsOnPage = Math.min(pageSize, availableItems);
            const items = generateItems(itemsOnPage);

            const result = paginate(items, totalCount, page, pageSize);

            // PROPERTY: meta.page equals the requested page
            return result.meta.page === page;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('meta.page_size === requested page_size', () => {
    it('the response meta.page_size always matches the requested page_size', () => {
      fc.assert(
        fc.property(
          arbitraryTotalCount(),
          arbitraryPage(),
          arbitraryPageSize(),
          (totalCount, page, pageSize) => {
            const startIndex = (page - 1) * pageSize;
            const availableItems = Math.max(0, totalCount - startIndex);
            const itemsOnPage = Math.min(pageSize, availableItems);
            const items = generateItems(itemsOnPage);

            const result = paginate(items, totalCount, page, pageSize);

            // PROPERTY: meta.page_size equals the requested page_size
            return result.meta.page_size === pageSize;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('meta.total_count === provided total_count', () => {
    it('the response meta.total_count reflects the actual total number of matching records', () => {
      fc.assert(
        fc.property(
          arbitraryTotalCount(),
          arbitraryPage(),
          arbitraryPageSize(),
          (totalCount, page, pageSize) => {
            const startIndex = (page - 1) * pageSize;
            const availableItems = Math.max(0, totalCount - startIndex);
            const itemsOnPage = Math.min(pageSize, availableItems);
            const items = generateItems(itemsOnPage);

            const result = paginate(items, totalCount, page, pageSize);

            // PROPERTY: meta.total_count equals the provided total count
            return result.meta.total_count === totalCount;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Edge case: total_count === 0 yields total_pages === 0', () => {
    it('when there are no records, total_pages is 0', () => {
      fc.assert(
        fc.property(arbitraryPage(), arbitraryPageSize(), (page, pageSize) => {
          const items: { id: number }[] = [];
          const result = paginate(items, 0, page, pageSize);

          // PROPERTY: zero records means zero pages
          return result.meta.total_pages === 0 && result.data.length === 0;
        }),
        PBT_CONFIG,
      );
    });
  });
});
