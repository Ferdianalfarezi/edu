import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { reactive, nextTick } from 'vue';

// Mock vue-router
const mockRoute = reactive({ query: {} as Record<string, string | string[] | undefined> });
const mockReplace = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ replace: mockReplace }),
}));

import { useTableUrlState } from '../../composables/useTableUrlState';
import type { TableUrlStateConfig } from '../../composables/useTableUrlState';

/**
 * Integration tests for RppPortalView URL state.
 *
 * Tests the composable with RppPortalView's specific configuration
 * to verify correct behavior for the RPP portal page.
 *
 * Validates: Requirements 6.2, 6.3, 6.6
 */
describe('RppPortalView URL State Integration', () => {
  const rppConfig: TableUrlStateConfig = {
    searchKey: 'search',
    defaultPageSize: 15,
    filters: [
      { key: 'mapel', type: 'string' },
      { key: 'kategori', type: 'string' },
      { key: 'tahun', type: 'string' },
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockRoute.query = {};
    mockReplace.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Requirement 6.2: mounts with query params → initializes filters and fetches data', () => {
    it('initializes filter values from URL query parameters', () => {
      mockRoute.query = { mapel: 'mp-1', kategori: 'kat-1', page: '2' };

      const { page, pageSize, search, filters } = useTableUrlState(rppConfig);

      expect(filters['mapel'].value).toBe('mp-1');
      expect(filters['kategori'].value).toBe('kat-1');
      expect(filters['tahun'].value).toBeUndefined();
      expect(page.value).toBe(2);
      expect(pageSize.value).toBe(15);
      expect(search.value).toBe('');
    });

    it('initializes all filters when all query params are present', () => {
      mockRoute.query = {
        search: 'rpp baru',
        mapel: 'mp-2',
        kategori: 'kat-3',
        tahun: '2024',
        page: '3',
        page_size: '25',
      };

      const { page, pageSize, search, filters } = useTableUrlState(rppConfig);

      expect(search.value).toBe('rpp baru');
      expect(filters['mapel'].value).toBe('mp-2');
      expect(filters['kategori'].value).toBe('kat-3');
      expect(filters['tahun'].value).toBe('2024');
      expect(page.value).toBe(3);
      expect(pageSize.value).toBe(25);
    });

    it('provides correct queryParams computed for API calls', () => {
      mockRoute.query = { mapel: 'mp-1', kategori: 'kat-1', page: '2' };

      const { queryParams } = useTableUrlState(rppConfig);

      expect(queryParams.value).toEqual({
        page: 2,
        page_size: 15,
        mapel: 'mp-1',
        kategori: 'kat-1',
      });
    });
  });

  describe('Requirement 6.3: filter change updates URL and resets page to 1', () => {
    it('resets page to 1 and calls router.replace when mapel filter changes', async () => {
      mockRoute.query = { mapel: 'mp-1', page: '3' };

      const { page, filters } = useTableUrlState(rppConfig);

      expect(page.value).toBe(3);

      filters['mapel'].value = 'mp-2';
      await nextTick();
      await nextTick();

      expect(page.value).toBe(1);
      expect(mockReplace).toHaveBeenCalledWith({
        query: expect.objectContaining({ mapel: 'mp-2' }),
      });
      // page should not be in the query since it's reset to 1 (the default)
      const calledQuery = mockReplace.mock.calls[0][0].query;
      expect(calledQuery.page).toBeUndefined();
    });

    it('resets page to 1 and calls router.replace when kategori filter changes', async () => {
      mockRoute.query = { kategori: 'kat-1', page: '5' };

      const { page, filters } = useTableUrlState(rppConfig);

      expect(page.value).toBe(5);

      filters['kategori'].value = 'kat-2';
      await nextTick();
      await nextTick();

      expect(page.value).toBe(1);
      expect(mockReplace).toHaveBeenCalledWith({
        query: expect.objectContaining({ kategori: 'kat-2' }),
      });
    });

    it('resets page to 1 and calls router.replace when tahun filter changes', async () => {
      mockRoute.query = { tahun: '2023', page: '2' };

      const { page, filters } = useTableUrlState(rppConfig);

      expect(page.value).toBe(2);

      filters['tahun'].value = '2024';
      await nextTick();
      await nextTick();

      expect(page.value).toBe(1);
      expect(mockReplace).toHaveBeenCalledWith({
        query: expect.objectContaining({ tahun: '2024' }),
      });
    });
  });

  describe('Requirement 6.6: clearing filter removes param from URL', () => {
    it('removes mapel param from URL when cleared', async () => {
      mockRoute.query = { mapel: 'mp-1', kategori: 'kat-1' };

      const { filters } = useTableUrlState(rppConfig);

      expect(filters['mapel'].value).toBe('mp-1');

      filters['mapel'].value = undefined;
      await nextTick();
      await nextTick();

      expect(mockReplace).toHaveBeenCalled();
      const calledQuery = mockReplace.mock.calls[0][0].query;
      expect(calledQuery.mapel).toBeUndefined();
      // kategori should still be present
      expect(calledQuery.kategori).toBe('kat-1');
    });

    it('removes kategori param from URL when cleared', async () => {
      mockRoute.query = { mapel: 'mp-1', kategori: 'kat-1', tahun: '2024' };

      const { filters } = useTableUrlState(rppConfig);

      filters['kategori'].value = undefined;
      await nextTick();
      await nextTick();

      expect(mockReplace).toHaveBeenCalled();
      const calledQuery = mockReplace.mock.calls[0][0].query;
      expect(calledQuery.kategori).toBeUndefined();
      expect(calledQuery.mapel).toBe('mp-1');
      expect(calledQuery.tahun).toBe('2024');
    });

    it('removes search param from URL when cleared to empty string', async () => {
      mockRoute.query = { search: 'rpp baru', mapel: 'mp-1' };

      const { search } = useTableUrlState(rppConfig);

      expect(search.value).toBe('rpp baru');

      search.value = '';
      await nextTick();
      vi.advanceTimersByTime(300);
      await nextTick();

      expect(mockReplace).toHaveBeenCalled();
      const calledQuery = mockReplace.mock.calls[0][0].query;
      expect(calledQuery.search).toBeUndefined();
      expect(calledQuery.mapel).toBe('mp-1');
    });
  });
});
