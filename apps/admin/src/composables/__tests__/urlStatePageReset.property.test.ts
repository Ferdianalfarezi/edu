import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { reactive, nextTick, effectScope } from 'vue';
import fc from 'fast-check';

const mockQuery = reactive<Record<string, string | undefined>>({});
const mockReplace = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace: mockReplace }),
}));

import { useTableUrlState, type TableUrlStateConfig } from '../useTableUrlState';

/**
 * Property 3: Filter Change Resets Page to 1
 *
 * For any table state where page > 1, and any filter change (including search),
 * the page value must be reset to 1 after the change is processed.
 *
 * **Validates: Requirements 1.9, 2.3, 2.4, 3.6, 3.7, 4.3, 6.3**
 */
describe('Property 3: Filter Change Resets Page to 1', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReplace.mockReset();
    // Clear all keys from mockQuery
    Object.keys(mockQuery).forEach((key) => delete mockQuery[key]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const config: TableUrlStateConfig = {
    searchKey: 'search',
    defaultPageSize: 15,
    filters: [
      { key: 'kelas_id', type: 'string' },
      { key: 'status', type: 'enum', enumValues: ['aktif', 'pindah_sekolah', 'keluar', 'lulus'] },
      { key: 'tahun_ajaran_id', type: 'string' },
    ],
  };

  it('non-search filter change resets page to 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 100 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (initialPage, filterValue) => {
          // Reset mock state
          Object.keys(mockQuery).forEach((key) => delete mockQuery[key]);
          mockQuery.page = String(initialPage);
          mockReplace.mockReset();

          const scope = effectScope();
          let page: ReturnType<typeof useTableUrlState>['page'];
          let filters: ReturnType<typeof useTableUrlState>['filters'];

          scope.run(() => {
            const state = useTableUrlState(config);
            page = state.page;
            filters = state.filters;
          });

          // Verify page was initialized correctly
          expect(page!.value).toBe(initialPage);

          // Change a non-search filter
          filters!['kelas_id'].value = filterValue;

          // Wait for the watcher and nextTick flush
          await nextTick();
          await nextTick();

          // Page must have been reset to 1
          expect(page!.value).toBe(1);

          scope.stop();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('enum filter change resets page to 1', async () => {
    const enumValues = ['aktif', 'pindah_sekolah', 'keluar', 'lulus'];

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 100 }),
        fc.constantFrom(...enumValues),
        async (initialPage, statusValue) => {
          Object.keys(mockQuery).forEach((key) => delete mockQuery[key]);
          mockQuery.page = String(initialPage);
          mockReplace.mockReset();

          const scope = effectScope();
          let page: ReturnType<typeof useTableUrlState>['page'];
          let filters: ReturnType<typeof useTableUrlState>['filters'];

          scope.run(() => {
            const state = useTableUrlState(config);
            page = state.page;
            filters = state.filters;
          });

          expect(page!.value).toBe(initialPage);

          // Change the enum filter
          filters!['status'].value = statusValue;

          await nextTick();
          await nextTick();

          expect(page!.value).toBe(1);

          scope.stop();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('pageSize change resets page to 1', async () => {
    const allowedPageSizes = [10, 25, 50] as const; // Exclude 15 (default) to ensure change

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 100 }),
        fc.constantFrom(...allowedPageSizes),
        async (initialPage, newPageSize) => {
          Object.keys(mockQuery).forEach((key) => delete mockQuery[key]);
          mockQuery.page = String(initialPage);
          mockReplace.mockReset();

          const scope = effectScope();
          let page: ReturnType<typeof useTableUrlState>['page'];
          let pageSize: ReturnType<typeof useTableUrlState>['pageSize'];

          scope.run(() => {
            const state = useTableUrlState(config);
            page = state.page;
            pageSize = state.pageSize;
          });

          expect(page!.value).toBe(initialPage);

          // Change page size
          pageSize!.value = newPageSize;

          await nextTick();
          await nextTick();

          expect(page!.value).toBe(1);

          scope.stop();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('search change resets page to 1 after debounce', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 100 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (initialPage, searchValue) => {
          Object.keys(mockQuery).forEach((key) => delete mockQuery[key]);
          mockQuery.page = String(initialPage);
          mockReplace.mockReset();

          const scope = effectScope();
          let page: ReturnType<typeof useTableUrlState>['page'];
          let search: ReturnType<typeof useTableUrlState>['search'];

          scope.run(() => {
            const state = useTableUrlState(config);
            page = state.page;
            search = state.search;
          });

          expect(page!.value).toBe(initialPage);

          // Change search (debounced)
          search!.value = searchValue;

          // The search watcher triggers synchronously, setting a 300ms timer.
          // We need to: advance fake timers, then flush microtasks (nextTick).
          await vi.advanceTimersByTimeAsync(300);
          await nextTick();
          await nextTick();

          expect(page!.value).toBe(1);

          scope.stop();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('page remains > 1 before debounce fires for search', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 100 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (initialPage, searchValue) => {
          Object.keys(mockQuery).forEach((key) => delete mockQuery[key]);
          mockQuery.page = String(initialPage);
          mockReplace.mockReset();

          const scope = effectScope();
          let page: ReturnType<typeof useTableUrlState>['page'];
          let search: ReturnType<typeof useTableUrlState>['search'];

          scope.run(() => {
            const state = useTableUrlState(config);
            page = state.page;
            search = state.search;
          });

          expect(page!.value).toBe(initialPage);

          // Change search (debounced)
          search!.value = searchValue;

          // Advance timer only 100ms (less than 300ms debounce)
          await vi.advanceTimersByTimeAsync(100);
          await nextTick();

          // Page should NOT have been reset yet (debounce hasn't fired)
          expect(page!.value).toBe(initialPage);

          scope.stop();
        },
      ),
      { numRuns: 100 },
    );
  });
});
