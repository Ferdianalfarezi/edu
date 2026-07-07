/**
 * Property 24: Cursor-Based Pagination Completeness
 *
 * Verifies that the `paginate()` helper function — which implements the
 * fetch-limit+1 cursor pattern — produces complete, non-overlapping pages
 * that together contain every item in the original dataset exactly once.
 *
 * **Validates: Requirements 35.1, 35.2, 35.3**
 *
 * Pure logic property test — exercises the paginate function directly
 * with arbitrary datasets. No DB or network dependencies.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { paginate, PaginatedResult } from '../../../src/common/helpers/pagination';
import { arbitraryUuid } from '../arbitraries';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TestItem {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulates the DB fetch pattern: given a full ordered dataset, a page size,
 * and an optional cursor, returns the rows the DB would return (limit + 1 rows
 * starting after the cursor position).
 *
 * This mirrors how service code uses paginate():
 * 1. Query DB with WHERE id > cursor ORDER BY id LIMIT pageSize + 1
 * 2. Pass the result to paginate(rows, pageSize)
 */
function simulateDbFetch(
  allItems: TestItem[],
  pageSize: number,
  cursor: string | null,
): TestItem[] {
  let startIdx = 0;

  if (cursor) {
    const cursorIdx = allItems.findIndex((item) => item.id === cursor);
    if (cursorIdx === -1) return [];
    startIdx = cursorIdx + 1;
  }

  // DB returns limit + 1 rows to detect has_next
  return allItems.slice(startIdx, startIdx + pageSize + 1);
}

/**
 * Iterates through all pages using the paginate function, simulating the
 * full pagination flow a client would perform.
 *
 * Returns all collected items and page-level metadata for assertions.
 */
function fetchAllPages(
  allItems: TestItem[],
  pageSize: number,
): { collectedItems: TestItem[]; pages: PaginatedResult<TestItem>[] } {
  const collectedItems: TestItem[] = [];
  const pages: PaginatedResult<TestItem>[] = [];
  let cursor: string | null = null;

  // Safety limit to prevent infinite loops
  const maxPages = Math.ceil(allItems.length / pageSize) + 2;
  let pageCount = 0;

  do {
    const rows = simulateDbFetch(allItems, pageSize, cursor);
    const result = paginate(rows, pageSize);

    collectedItems.push(...result.data);
    pages.push(result);
    cursor = result.meta.cursor;
    pageCount++;

    if (pageCount > maxPages) break;
  } while (cursor !== null);

  return { collectedItems, pages };
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/**
 * Generates a test item with a unique ID.
 */
function arbitraryTestItem(): fc.Arbitrary<TestItem> {
  return fc.record({
    id: arbitraryUuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
  });
}

/**
 * Generates a list of test items with unique IDs (simulating a sorted DB result).
 */
function arbitraryItemList(options?: { min?: number; max?: number }): fc.Arbitrary<TestItem[]> {
  return fc
    .array(arbitraryTestItem(), {
      minLength: options?.min ?? 0,
      maxLength: options?.max ?? 60,
    })
    .map((items) => {
      // Ensure unique IDs by deduplicating
      const seen = new Set<string>();
      return items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    });
}

/**
 * Generates a valid page size (1 to 25).
 */
function arbitraryPageSize(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 25 });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 24: Cursor-Based Pagination Completeness', () => {
  describe('Fetching all pages collects ALL original items (no items lost)', () => {
    it('every item in the original dataset appears in the paginated results', () => {
      fc.assert(
        fc.property(
          arbitraryItemList({ min: 1, max: 50 }),
          arbitraryPageSize(),
          (items, pageSize) => {
            const { collectedItems } = fetchAllPages(items, pageSize);

            // PROPERTY: Every original item ID exists in collected results
            const collectedIds = new Set(collectedItems.map((item) => item.id));
            for (const item of items) {
              if (!collectedIds.has(item.id)) return false;
            }
            return true;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('No item appears in more than one page (no duplicates)', () => {
    it('all collected item IDs are unique across all pages', () => {
      fc.assert(
        fc.property(
          arbitraryItemList({ min: 0, max: 50 }),
          arbitraryPageSize(),
          (items, pageSize) => {
            const { collectedItems } = fetchAllPages(items, pageSize);

            // PROPERTY: No duplicate IDs
            const ids = collectedItems.map((item) => item.id);
            const uniqueIds = new Set(ids);
            return ids.length === uniqueIds.size;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Total items across all pages equals the original dataset size', () => {
    it('collected count matches input count', () => {
      fc.assert(
        fc.property(
          arbitraryItemList({ min: 0, max: 50 }),
          arbitraryPageSize(),
          (items, pageSize) => {
            const { collectedItems } = fetchAllPages(items, pageSize);

            // PROPERTY: Total collected equals total input
            return collectedItems.length === items.length;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('The cursor of each page points to the last item of that page', () => {
    it('when has_next=true, cursor equals the last item id in the page data', () => {
      fc.assert(
        fc.property(
          arbitraryItemList({ min: 2, max: 50 }),
          // Use small page sizes to guarantee multi-page scenarios
          fc.integer({ min: 1, max: 5 }),
          (items, pageSize) => {
            fc.pre(items.length > pageSize); // Ensure at least 2 pages

            const { pages } = fetchAllPages(items, pageSize);

            // PROPERTY: For every page with has_next=true, cursor is the last item's id
            for (const page of pages) {
              if (page.meta.has_next) {
                if (page.data.length === 0) return false;
                const lastItem = page.data[page.data.length - 1];
                if (page.meta.cursor !== lastItem.id) return false;
              }
            }
            return true;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('when has_next=false, cursor is null', () => {
      fc.assert(
        fc.property(
          arbitraryItemList({ min: 0, max: 50 }),
          arbitraryPageSize(),
          (items, pageSize) => {
            const { pages } = fetchAllPages(items, pageSize);

            // PROPERTY: The last page always has has_next=false and cursor=null
            if (pages.length === 0) return true; // Empty input produces no pages... actually let's check

            const lastPage = pages[pages.length - 1];
            return lastPage.meta.has_next === false && lastPage.meta.cursor === null;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('When has_next=false, there are no remaining items', () => {
    it('after the last page (has_next=false), all items have been collected', () => {
      fc.assert(
        fc.property(
          arbitraryItemList({ min: 0, max: 50 }),
          arbitraryPageSize(),
          (items, pageSize) => {
            const { collectedItems, pages } = fetchAllPages(items, pageSize);

            // Find the first page where has_next=false
            const terminalPageIdx = pages.findIndex((p) => !p.meta.has_next);
            if (terminalPageIdx === -1 && items.length > 0) {
              // Should always have a terminal page if items exist
              return false;
            }

            // PROPERTY: Items collected up to and including terminal page = all items
            if (items.length === 0) {
              // Empty dataset: single page with empty data
              return pages.length === 1 && pages[0].data.length === 0;
            }

            return collectedItems.length === items.length;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('simulating a fetch after the last cursor returns no data', () => {
      fc.assert(
        fc.property(
          arbitraryItemList({ min: 1, max: 50 }),
          arbitraryPageSize(),
          (items, pageSize) => {
            const { pages } = fetchAllPages(items, pageSize);
            const lastPage = pages[pages.length - 1];

            // The last page should have has_next=false
            if (lastPage.meta.has_next) return false;

            // PROPERTY: If we try to fetch one more page using the last item's id
            // as cursor, we get an empty result
            const lastItemId =
              lastPage.data.length > 0 ? lastPage.data[lastPage.data.length - 1].id : null;

            if (lastItemId) {
              const extraRows = simulateDbFetch(items, pageSize, lastItemId);
              const extraResult = paginate(extraRows, pageSize);
              return (
                extraResult.data.length === 0 &&
                extraResult.meta.has_next === false &&
                extraResult.meta.cursor === null
              );
            }

            return true;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Edge cases', () => {
    it('empty dataset returns single page with no data and no cursor', () => {
      fc.assert(
        fc.property(arbitraryPageSize(), (pageSize) => {
          const result = paginate<TestItem>([], pageSize);
          return (
            result.data.length === 0 &&
            result.meta.has_next === false &&
            result.meta.cursor === null
          );
        }),
        PBT_CONFIG,
      );
    });

    it('dataset size exactly equals page size produces one page with no next', () => {
      fc.assert(
        fc.property(arbitraryItemList({ min: 1, max: 25 }), (items) => {
          // Use items.length as pageSize — exact fit
          const pageSize = items.length;
          // DB would fetch pageSize+1 but only get pageSize rows
          const rows = items.slice(0, pageSize); // exactly pageSize rows (no extra)
          const result = paginate(rows, pageSize);

          return (
            result.data.length === items.length &&
            result.meta.has_next === false &&
            result.meta.cursor === null
          );
        }),
        PBT_CONFIG,
      );
    });

    it('page size of 1 still collects all items correctly', () => {
      fc.assert(
        fc.property(arbitraryItemList({ min: 1, max: 15 }), (items) => {
          const { collectedItems } = fetchAllPages(items, 1);

          // PROPERTY: Even with page size 1, all items collected
          if (collectedItems.length !== items.length) return false;

          // All IDs match
          const originalIds = new Set(items.map((i) => i.id));
          const collectedIds = new Set(collectedItems.map((i) => i.id));
          if (originalIds.size !== collectedIds.size) return false;
          for (const id of originalIds) {
            if (!collectedIds.has(id)) return false;
          }
          return true;
        }),
        PBT_CONFIG,
      );
    });

    it('different page sizes produce the same complete item set', () => {
      fc.assert(
        fc.property(
          arbitraryItemList({ min: 1, max: 30 }),
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 6, max: 20 }),
          (items, smallPage, largePage) => {
            const { collectedItems: smallResult } = fetchAllPages(items, smallPage);
            const { collectedItems: largeResult } = fetchAllPages(items, largePage);

            // PROPERTY: Both page sizes collect the same items in the same order
            if (smallResult.length !== largeResult.length) return false;
            for (let i = 0; i < smallResult.length; i++) {
              if (smallResult[i].id !== largeResult[i].id) return false;
            }
            return true;
          },
        ),
        PBT_CONFIG,
      );
    });
  });
});
