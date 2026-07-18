import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { reactive, nextTick } from 'vue';
import fc from 'fast-check';

const mockQuery = reactive<Record<string, string | undefined>>({});
const mockReplace = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace: mockReplace }),
}));

import { useTableUrlState, type TableUrlStateConfig } from '../useTableUrlState';

/**
 * Property 7: Batching — Multiple Changes Produce Single URL Update
 *
 * For any number N ≥ 2 of synchronous state changes within the same event loop tick,
 * exactly one router.replace() call should be made (after the nextTick flush).
 *
 * **Validates: Requirements 7.3**
 */
describe('Property 7: Batching — Multiple Changes Produce Single URL Update', () => {
  const config: TableUrlStateConfig = {
    searchKey: 'search',
    defaultPageSize: 15,
    filters: [
      { key: 'kelas_id', type: 'string' },
      { key: 'status', type: 'enum', enumValues: ['aktif', 'pindah_sekolah', 'keluar', 'lulus'] },
      { key: 'tahun_ajaran_id', type: 'string' },
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockReplace.mockReset();
    // Clear all reactive query properties
    Object.keys(mockQuery).forEach((key) => delete mockQuery[key]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Arbitrary for the type of state change (excluding search since it's debounced)
  type StateChangeType = 'page' | 'pageSize' | 'filter_kelas' | 'filter_status' | 'filter_tahun';

  const stateChangeTypeArb: fc.Arbitrary<StateChangeType> = fc.constantFrom(
    'page' as StateChangeType,
    'pageSize' as StateChangeType,
    'filter_kelas' as StateChangeType,
    'filter_status' as StateChangeType,
    'filter_tahun' as StateChangeType,
  );

  // Arbitrary for a sequence of state changes
  const stateChangesArb = fc
    .integer({ min: 2, max: 10 })
    .chain((n) => fc.array(stateChangeTypeArb, { minLength: n, maxLength: n }));

  it('N synchronous non-search state changes produce at most 1 router.replace() call', async () => {
    await fc.assert(
      fc.asyncProperty(stateChangesArb, async (changeTypes) => {
        // Reset state for each property run
        mockReplace.mockReset();
        Object.keys(mockQuery).forEach((key) => delete mockQuery[key]);

        const { page, pageSize, filters } = useTableUrlState(config);

        // Wait for any initialization effects to settle
        await nextTick();
        await nextTick();
        mockReplace.mockReset();

        // Apply N synchronous state changes within the same tick
        for (const changeType of changeTypes) {
          switch (changeType) {
            case 'page':
              page.value = Math.floor(Math.random() * 100) + 2;
              break;
            case 'pageSize':
              pageSize.value = [10, 25, 50][Math.floor(Math.random() * 3)];
              break;
            case 'filter_kelas':
              filters['kelas_id'].value = `kelas-${Math.random().toString(36).slice(2, 8)}`;
              break;
            case 'filter_status':
              filters['status'].value = ['aktif', 'pindah_sekolah', 'keluar', 'lulus'][
                Math.floor(Math.random() * 4)
              ];
              break;
            case 'filter_tahun':
              filters['tahun_ajaran_id'].value = `tahun-${Math.random().toString(36).slice(2, 8)}`;
              break;
          }
        }

        // Let the nextTick flush happen
        await nextTick();
        await nextTick();

        // The key property: NOT called N times — should be exactly 1
        expect(mockReplace.mock.calls.length).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it('single page change produces exactly 1 router.replace() call (baseline)', async () => {
    mockReplace.mockReset();
    Object.keys(mockQuery).forEach((key) => delete mockQuery[key]);

    const { page } = useTableUrlState(config);

    await nextTick();
    await nextTick();
    mockReplace.mockReset();

    page.value = 5;

    await nextTick();
    await nextTick();

    expect(mockReplace.mock.calls.length).toBe(1);
  });

  it('multiple filter changes in one tick produce exactly 1 router.replace() call', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        fc.constantFrom('aktif', 'pindah_sekolah', 'keluar', 'lulus'),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        async (_newPage, newStatus, newKelas, newTahun) => {
          mockReplace.mockReset();
          Object.keys(mockQuery).forEach((key) => delete mockQuery[key]);

          const { filters } = useTableUrlState(config);

          await nextTick();
          await nextTick();
          mockReplace.mockReset();

          // Apply 3 filter changes synchronously in one tick
          filters['kelas_id'].value = newKelas;
          filters['status'].value = newStatus;
          filters['tahun_ajaran_id'].value = newTahun;

          await nextTick();
          await nextTick();

          // Batching should result in exactly 1 call, not 3
          expect(mockReplace.mock.calls.length).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
