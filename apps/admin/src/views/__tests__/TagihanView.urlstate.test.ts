import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ref, nextTick, reactive } from 'vue';

// Mock vue-router
const mockRoute = reactive({ query: {} as Record<string, string | string[] | undefined> });
const mockReplace = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ replace: mockReplace }),
}));

import { useTableUrlState } from '@/composables/useTableUrlState';
import type { TableUrlStateConfig } from '@/composables/useTableUrlState';

/**
 * Integration tests for TagihanView URL state persistence.
 *
 * These tests exercise the composable with TagihanView's specific configuration,
 * verifying that the tab enum filter (which drives the active tab in the view)
 * behaves correctly with URL query parameters.
 *
 * Validates: Requirements 4.2, 4.3, 4.5
 */
describe('TagihanView URL State Integration', () => {
  const tagihanConfig: TableUrlStateConfig = {
    searchKey: 'search',
    defaultPageSize: 15,
    filters: [
      {
        key: 'tab',
        type: 'enum',
        enumValues: ['generate', 'list', 'verifikasi', 'tunggakan', 'audit'],
      },
      { key: 'status', type: 'string' },
      { key: 'kelas_id', type: 'string' },
      { key: 'bulan', type: 'string' },
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

  describe('tab restoration from URL (Requirement 4.2)', () => {
    it('mounts with tab query param → restores correct active tab', () => {
      mockRoute.query = { tab: 'verifikasi' };

      const { filters } = useTableUrlState(tagihanConfig);

      // The composable returns filters.tab = 'verifikasi'
      // In the actual view, activeTab is computed as: (filters['tab'].value || 'list') as Tab
      expect(filters['tab'].value).toBe('verifikasi');

      // Verify activeTab computed logic: when tab is set, it should equal the tab value
      const activeTab = filters['tab'].value || 'list';
      expect(activeTab).toBe('verifikasi');
    });

    it('mounts with tab=generate → restores generate tab', () => {
      mockRoute.query = { tab: 'generate' };

      const { filters } = useTableUrlState(tagihanConfig);

      expect(filters['tab'].value).toBe('generate');
    });

    it('mounts with tab=tunggakan and other filters → restores all state', () => {
      mockRoute.query = {
        tab: 'tunggakan',
        status: 'belum_bayar',
        kelas_id: 'cls-123',
        page: '2',
      };

      const { filters, page } = useTableUrlState(tagihanConfig);

      expect(filters['tab'].value).toBe('tunggakan');
      expect(filters['status'].value).toBe('belum_bayar');
      expect(filters['kelas_id'].value).toBe('cls-123');
      expect(page.value).toBe(2);
    });
  });

  describe('tab switching updates URL and resets page (Requirement 4.3)', () => {
    it('switching tabs updates URL and resets page to 1', async () => {
      mockRoute.query = { tab: 'list', page: '3' };

      const { filters, page } = useTableUrlState(tagihanConfig);

      expect(filters['tab'].value).toBe('list');
      expect(page.value).toBe(3);

      // Simulate tab click: change the tab filter from 'list' to 'tunggakan'
      filters['tab'].value = 'tunggakan';

      // Wait for watchers and nextTick batch flush
      await nextTick();
      await nextTick();

      // Page should reset to 1 (composable resets page on filter change)
      expect(page.value).toBe(1);

      // router.replace should have been called with the new tab value
      expect(mockReplace).toHaveBeenCalled();
      const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1][0];
      expect(lastCall.query).toHaveProperty('tab', 'tunggakan');
      // Page should be omitted (it's at default value 1)
      expect(lastCall.query).not.toHaveProperty('page');
    });

    it('switching tabs preserves other active filters in URL', async () => {
      mockRoute.query = { tab: 'list', status: 'lunas', kelas_id: 'cls-5' };

      const { filters } = useTableUrlState(tagihanConfig);

      expect(filters['tab'].value).toBe('list');
      expect(filters['status'].value).toBe('lunas');
      expect(filters['kelas_id'].value).toBe('cls-5');

      // Switch to verifikasi tab
      filters['tab'].value = 'verifikasi';
      await nextTick();
      await nextTick();

      expect(mockReplace).toHaveBeenCalled();
      const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1][0];
      expect(lastCall.query).toHaveProperty('tab', 'verifikasi');
      expect(lastCall.query).toHaveProperty('status', 'lunas');
      expect(lastCall.query).toHaveProperty('kelas_id', 'cls-5');
    });
  });

  describe('invalid tab value fallback (Requirement 4.5)', () => {
    it('invalid tab value falls back to undefined (view defaults to "list")', () => {
      mockRoute.query = { tab: 'invalid_tab' };

      const { filters } = useTableUrlState(tagihanConfig);

      // parseEnumFilter returns undefined for invalid enum values
      expect(filters['tab'].value).toBeUndefined();

      // In the actual view: activeTab = (filters['tab'].value || 'list') → 'list'
      const activeTab = filters['tab'].value || 'list';
      expect(activeTab).toBe('list');
    });

    it('empty tab value falls back to undefined (view defaults to "list")', () => {
      mockRoute.query = { tab: '' };

      const { filters } = useTableUrlState(tagihanConfig);

      expect(filters['tab'].value).toBeUndefined();
      const activeTab = filters['tab'].value || 'list';
      expect(activeTab).toBe('list');
    });

    it('tab with random string falls back to default', () => {
      mockRoute.query = { tab: 'nonexistent_tab_xyz' };

      const { filters } = useTableUrlState(tagihanConfig);

      expect(filters['tab'].value).toBeUndefined();
      const activeTab = filters['tab'].value || 'list';
      expect(activeTab).toBe('list');
    });
  });
});
