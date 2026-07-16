import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { nextTick, reactive } from 'vue';

// Mock vue-router with a reactive query object
const mockRoute = reactive({ query: {} as Record<string, string | string[] | undefined> });
const mockReplace = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ replace: mockReplace }),
}));

import { useTableUrlState } from '@/composables/useTableUrlState';
import type { TableUrlStateConfig } from '@/composables/useTableUrlState';

/**
 * Integration-like tests for SiswaManagementView's URL state behavior.
 * Tests the composable configured exactly as SiswaManagementView uses it.
 *
 * Validates: Requirements 3.2, 3.3, 3.5
 */
describe('SiswaManagementView URL state integration', () => {
  // Exact config used by SiswaManagementView
  const siswaConfig: TableUrlStateConfig = {
    searchKey: 'search',
    defaultPageSize: 15,
    filters: [
      { key: 'kelas_id', type: 'string' },
      { key: 'status', type: 'enum', enumValues: ['aktif', 'pindah_sekolah', 'keluar', 'alumni'] },
      { key: 'tahun_ajaran_id', type: 'string' },
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

  describe('mounts with query params → populates filters and fetches data (Req 3.2)', () => {
    it('populates page, kelas_id, and status from URL query params', () => {
      mockRoute.query = { page: '3', kelas_id: 'cls-1', status: 'aktif' };

      const { page, pageSize, search, filters, queryParams } = useTableUrlState(siswaConfig);

      expect(page.value).toBe(3);
      expect(pageSize.value).toBe(15); // default since not in URL
      expect(search.value).toBe('');
      expect(filters['kelas_id'].value).toBe('cls-1');
      expect(filters['status'].value).toBe('aktif');
      expect(filters['tahun_ajaran_id'].value).toBeUndefined();

      // queryParams computed should contain all active values for API fetch
      expect(queryParams.value).toEqual({
        page: 3,
        page_size: 15,
        kelas_id: 'cls-1',
        status: 'aktif',
      });
    });

    it('populates all filters including search and tahun_ajaran_id', () => {
      mockRoute.query = {
        page: '2',
        page_size: '25',
        search: 'Ahmad',
        kelas_id: 'cls-5',
        status: 'alumni',
        tahun_ajaran_id: 'ta-2024',
      };

      const { page, pageSize, search, filters, queryParams } = useTableUrlState(siswaConfig);

      expect(page.value).toBe(2);
      expect(pageSize.value).toBe(25);
      expect(search.value).toBe('Ahmad');
      expect(filters['kelas_id'].value).toBe('cls-5');
      expect(filters['status'].value).toBe('alumni');
      expect(filters['tahun_ajaran_id'].value).toBe('ta-2024');

      expect(queryParams.value).toEqual({
        page: 2,
        page_size: 25,
        search: 'Ahmad',
        kelas_id: 'cls-5',
        status: 'alumni',
        tahun_ajaran_id: 'ta-2024',
      });
    });
  });

  describe('clearing a filter removes its query param from URL (Req 3.3)', () => {
    it('removes kelas_id from URL when filter is cleared', async () => {
      mockRoute.query = { kelas_id: 'cls-1', status: 'aktif' };

      const { filters } = useTableUrlState(siswaConfig);
      expect(filters['kelas_id'].value).toBe('cls-1');

      // Clear the filter
      filters['kelas_id'].value = undefined;
      await nextTick();
      await nextTick();

      expect(mockReplace).toHaveBeenCalled();
      const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1][0];
      // kelas_id should NOT be present in the query
      expect(lastCall.query).not.toHaveProperty('kelas_id');
      // status should still be present
      expect(lastCall.query).toHaveProperty('status', 'aktif');
    });

    it('removes status from URL when filter is cleared', async () => {
      mockRoute.query = { kelas_id: 'cls-2', status: 'keluar', page: '2' };

      const { filters } = useTableUrlState(siswaConfig);
      expect(filters['status'].value).toBe('keluar');

      // Clear the status filter
      filters['status'].value = undefined;
      await nextTick();
      await nextTick();

      expect(mockReplace).toHaveBeenCalled();
      const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1][0];
      // status should NOT be in the query
      expect(lastCall.query).not.toHaveProperty('status');
      // kelas_id should still be present
      expect(lastCall.query).toHaveProperty('kelas_id', 'cls-2');
      // page should reset to 1 (omitted from URL since 1 is default)
      expect(lastCall.query).not.toHaveProperty('page');
    });

    it('removes tahun_ajaran_id from URL when filter is cleared', async () => {
      mockRoute.query = { tahun_ajaran_id: 'ta-2023' };

      const { filters } = useTableUrlState(siswaConfig);
      expect(filters['tahun_ajaran_id'].value).toBe('ta-2023');

      filters['tahun_ajaran_id'].value = undefined;
      await nextTick();
      await nextTick();

      expect(mockReplace).toHaveBeenCalled();
      const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1][0];
      expect(lastCall.query).not.toHaveProperty('tahun_ajaran_id');
    });
  });

  describe('invalid enum value in URL is ignored (Req 3.5)', () => {
    it('ignores invalid status value and returns undefined', () => {
      mockRoute.query = { status: 'invalid_status' };

      const { filters } = useTableUrlState(siswaConfig);

      expect(filters['status'].value).toBeUndefined();
    });

    it('ignores status value with wrong casing', () => {
      mockRoute.query = { status: 'AKTIF' };

      const { filters } = useTableUrlState(siswaConfig);

      expect(filters['status'].value).toBeUndefined();
    });

    it('accepts valid status values while ignoring invalid ones in same URL', () => {
      mockRoute.query = {
        status: 'nonexistent',
        kelas_id: 'cls-valid',
        page: '2',
      };

      const { page, filters } = useTableUrlState(siswaConfig);

      // Invalid enum is ignored
      expect(filters['status'].value).toBeUndefined();
      // Valid string filter is preserved
      expect(filters['kelas_id'].value).toBe('cls-valid');
      // Valid page is preserved
      expect(page.value).toBe(2);
    });

    it('queryParams excludes invalid enum filter from API params', () => {
      mockRoute.query = { status: 'bogus_value', kelas_id: 'cls-1' };

      const { queryParams } = useTableUrlState(siswaConfig);

      // Invalid enum should not appear in queryParams
      expect(queryParams.value).not.toHaveProperty('status');
      // Valid filter should still be present
      expect(queryParams.value).toHaveProperty('kelas_id', 'cls-1');
    });
  });
});
