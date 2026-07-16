import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ref, nextTick, reactive } from 'vue';

// Mock vue-router
const mockRoute = reactive({ query: {} as Record<string, string | string[] | undefined> });
const mockReplace = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ replace: mockReplace }),
}));

import { useTableUrlState } from '../useTableUrlState';
import type { TableUrlStateConfig } from '../useTableUrlState';

describe('useTableUrlState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockRoute.query = {};
    mockReplace.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultConfig: TableUrlStateConfig = {
    searchKey: 'search',
    defaultPageSize: 15,
    filters: [
      { key: 'kelas_id', type: 'string' },
      { key: 'status', type: 'enum', enumValues: ['aktif', 'pindah_sekolah', 'keluar', 'alumni'] },
    ],
  };

  describe('initialization', () => {
    it('initializes with correct defaults when no query params', () => {
      const { page, pageSize, search, filters } = useTableUrlState(defaultConfig);

      expect(page.value).toBe(1);
      expect(pageSize.value).toBe(15);
      expect(search.value).toBe('');
      expect(filters['kelas_id'].value).toBeUndefined();
      expect(filters['status'].value).toBeUndefined();
    });

    it('parses initial state from route.query on mount', () => {
      mockRoute.query = {
        page: '3',
        page_size: '25',
        search: 'john',
        kelas_id: 'cls-1',
        status: 'aktif',
      };

      const { page, pageSize, search, filters } = useTableUrlState(defaultConfig);

      expect(page.value).toBe(3);
      expect(pageSize.value).toBe(25);
      expect(search.value).toBe('john');
      expect(filters['kelas_id'].value).toBe('cls-1');
      expect(filters['status'].value).toBe('aktif');
    });
  });

  describe('URL sync behavior', () => {
    it('calls router.replace() (not push()) on state change', async () => {
      const { page } = useTableUrlState(defaultConfig);

      page.value = 5;
      // First nextTick triggers the watcher, second nextTick triggers the scheduleFlush
      await nextTick();
      await nextTick();

      expect(mockReplace).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Object) }),
      );
    });

    it('non-search changes flush immediately via nextTick', async () => {
      const { filters } = useTableUrlState(defaultConfig);

      filters['kelas_id'].value = 'cls-2';
      // Before nextTick, replace should not have been called yet
      expect(mockReplace).not.toHaveBeenCalled();

      await nextTick();
      // After one nextTick, the batched flush should fire
      // Need to wait for the internal nextTick of the watcher + the scheduleFlush nextTick
      await nextTick();

      expect(mockReplace).toHaveBeenCalled();
    });

    it('search debounce fires after 300ms', async () => {
      const { search } = useTableUrlState(defaultConfig);

      search.value = 'test';
      await nextTick(); // trigger the watcher

      // Before debounce elapses, replace should not have been called for search
      expect(mockReplace).not.toHaveBeenCalled();

      // Advance timers by 300ms (the debounce period)
      vi.advanceTimersByTime(300);
      await nextTick(); // let the scheduleFlush's nextTick resolve

      expect(mockReplace).toHaveBeenCalled();
    });
  });

  describe('page reset behavior', () => {
    it('page resets to 1 on filter change', async () => {
      mockRoute.query = { page: '5' };
      const { page, filters } = useTableUrlState(defaultConfig);

      expect(page.value).toBe(5);

      filters['kelas_id'].value = 'cls-3';
      await nextTick();
      await nextTick();

      expect(page.value).toBe(1);
    });

    it('page resets to 1 on search change', async () => {
      mockRoute.query = { page: '3' };
      const { page, search } = useTableUrlState(defaultConfig);

      expect(page.value).toBe(3);

      search.value = 'hello';
      await nextTick(); // trigger search watcher
      vi.advanceTimersByTime(300); // wait for debounce
      await nextTick();

      expect(page.value).toBe(1);
    });
  });

  describe('reset methods', () => {
    it('resetFilters() clears all filters but keeps page/pageSize', async () => {
      mockRoute.query = {
        page: '2',
        page_size: '25',
        search: 'hello',
        kelas_id: 'cls-1',
        status: 'aktif',
      };

      const { page, pageSize, search, filters, resetFilters } = useTableUrlState(defaultConfig);

      expect(search.value).toBe('hello');
      expect(filters['kelas_id'].value).toBe('cls-1');
      expect(filters['status'].value).toBe('aktif');

      resetFilters();

      expect(search.value).toBe('');
      expect(filters['kelas_id'].value).toBeUndefined();
      expect(filters['status'].value).toBeUndefined();
      expect(page.value).toBe(1);
      // pageSize should remain unchanged
      expect(pageSize.value).toBe(25);
    });

    it('resetAll() resets everything to defaults', async () => {
      mockRoute.query = {
        page: '4',
        page_size: '50',
        search: 'world',
        kelas_id: 'cls-2',
        status: 'alumni',
      };

      const { page, pageSize, search, filters, resetAll } = useTableUrlState(defaultConfig);

      expect(pageSize.value).toBe(50);
      expect(search.value).toBe('world');

      resetAll();

      expect(page.value).toBe(1);
      expect(pageSize.value).toBe(15);
      expect(search.value).toBe('');
      expect(filters['kelas_id'].value).toBeUndefined();
      expect(filters['status'].value).toBeUndefined();
    });
  });
});
