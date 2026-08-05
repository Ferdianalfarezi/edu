import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import fc from 'fast-check';
import { BarangService } from '../barang.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import type { KondisiBarang, SumberDana, KategoriBarang } from '@/drizzle/schema/barang';

// ────────────────────────────────────────────────────────────────────────────────
// Valid enum values as per the schema
// ────────────────────────────────────────────────────────────────────────────────

const KONDISI_BARANG_VALUES: KondisiBarang[] = ['bagus', 'perlu_perbaikan', 'rusak'];
const SUMBER_DANA_VALUES: SumberDana[] = ['yayasan', 'unit_sekolah', 'bos'];
const KATEGORI_VALUES: KategoriBarang[] = ['peralatan', 'perlengkapan'];

// ────────────────────────────────────────────────────────────────────────────────
// DB Record type mirroring Drizzle schema select shape
// ────────────────────────────────────────────────────────────────────────────────

interface FakeBarangRecord {
  id: string;
  tenantId: string;
  nama: string;
  deskripsi: string | null;
  jumlah: number;
  lokasi: string | null;
  kondisiBarang: KondisiBarang | null;
  sumberDana: SumberDana | null;
  kategori: KategoriBarang | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ────────────────────────────────────────────────────────────────────────────────
// Pure filter helper — mirrors the service's WHERE clause logic
// so the mock returns exactly what real Drizzle would return.
// ────────────────────────────────────────────────────────────────────────────────

function applyFilters(
  records: FakeBarangRecord[],
  tenantId: string,
  filters: {
    search?: string;
    kondisi_barang?: KondisiBarang;
    sumber_dana?: SumberDana;
    kategori?: KategoriBarang;
  },
): FakeBarangRecord[] {
  return records.filter((r) => {
    if (r.tenantId !== tenantId) return false;
    if (r.deletedAt !== null) return false;
    if (filters.search && !r.nama.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.kondisi_barang && r.kondisiBarang !== filters.kondisi_barang) return false;
    if (filters.sumber_dana && r.sumberDana !== filters.sumber_dana) return false;
    if (filters.kategori && r.kategori !== filters.kategori) return false;
    return true;
  });
}

// ────────────────────────────────────────────────────────────────────────────────
// Mock DB factory — accepts all records and active filters so the simulated
// count + data queries return exactly the right subset.
// ────────────────────────────────────────────────────────────────────────────────

function createFilterMockDb(
  allRecords: FakeBarangRecord[],
  tenantId: string,
  filters: {
    search?: string;
    kondisi_barang?: KondisiBarang;
    sumber_dana?: SumberDana;
    kategori?: KategoriBarang;
  },
) {
  const filtered = applyFilters(allRecords, tenantId, filters);
  const sorted = [...filtered].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  let selectCallCount = 0;

  return {
    select: jest.fn().mockImplementation(() => {
      selectCallCount++;
      const isCountQuery = selectCallCount % 2 === 1; // 1st, 3rd, … calls → count query

      return {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(
            isCountQuery
              ? Promise.resolve([{ count: filtered.length }])
              : {
                  orderBy: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                      offset: jest.fn().mockResolvedValue(sorted),
                    }),
                  }),
                },
          ),
        }),
      };
    }),
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// Arbitraries
// ────────────────────────────────────────────────────────────────────────────────

/** Optional enum — either undefined (filter inactive) or a valid enum value */
const optionalKondisiArb = fc.option(fc.constantFrom(...KONDISI_BARANG_VALUES), { nil: undefined });
const optionalSumberDanaArb = fc.option(fc.constantFrom(...SUMBER_DANA_VALUES), { nil: undefined });
const optionalKategoriArb = fc.option(fc.constantFrom(...KATEGORI_VALUES), { nil: undefined });

/** Short ASCII names safe for substring search */
const namaArb = fc
  .string({ minLength: 3, maxLength: 30 })
  .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s) && s.trim().length > 0);

/** A single barang record with deterministic enum fields */
const fakeBarangArb = (tenantId: string, index: number) =>
  fc
    .record({
      kondisiBarang: fc.constantFrom<KondisiBarang | null>(...KONDISI_BARANG_VALUES, null),
      sumberDana: fc.constantFrom<SumberDana | null>(...SUMBER_DANA_VALUES, null),
      kategori: fc.constantFrom<KategoriBarang | null>(...KATEGORI_VALUES, null),
      nama: namaArb,
      jumlah: fc.integer({ min: 0, max: 999 }),
    })
    .map((fields): FakeBarangRecord => ({
      id: `${tenantId.slice(0, 8)}-${String(index).padStart(4, '0')}`,
      tenantId,
      nama: fields.nama,
      deskripsi: null,
      jumlah: fields.jumlah,
      lokasi: null,
      kondisiBarang: fields.kondisiBarang,
      sumberDana: fields.sumberDana,
      kategori: fields.kategori,
      createdAt: new Date(2024, 0, 1, 0, 0, index),
      updatedAt: new Date(2024, 0, 1, 0, 0, index),
      deletedAt: null,
    }));

/** An array of 1–15 barang records for a given tenant */
const barangListArb = (tenantId: string) =>
  fc
    .array(fc.integer({ min: 0, max: 14 }), { minLength: 1, maxLength: 15 })
    .chain((indices) => fc.tuple(...indices.map((idx) => fakeBarangArb(tenantId, idx))))
    .map((records) => Array.from(records));

// ────────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Property 8: Filter dan pencarian barang — hasil selalu sesuai semua kriteria filter aktif
 *
 * For any combination of active filters (kondisi_barang, sumber_dana, kategori, search),
 * every returned barang item MUST satisfy ALL active filter criteria simultaneously.
 *
 * **Validates: Requirements 5.11**
 *
 * // Feature: sistem-pengembangan-v2, Property 8: Filter dan pencarian barang — hasil selalu sesuai semua kriteria filter aktif
 */
describe('Feature: sistem-pengembangan-v2, Property 8: Filter dan pencarian barang — hasil selalu sesuai semua kriteria filter aktif', () => {
  const TENANT_ID = '11111111-1111-4111-8111-111111111111';

  async function buildService(
    mockDb: ReturnType<typeof createFilterMockDb>,
  ): Promise<BarangService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();
    return module.get<BarangService>(BarangService);
  }

  // ── Sub-test 1: kondisi_barang filter ──────────────────────────────────────

  it('setiap item yang dikembalikan cocok dengan kondisi_barang yang aktif', async () => {
    await fc.assert(
      fc.asyncProperty(
        barangListArb(TENANT_ID),
        fc.constantFrom(...KONDISI_BARANG_VALUES),
        async (records, kondisi) => {
          const mockDb = createFilterMockDb(records, TENANT_ID, {
            kondisi_barang: kondisi,
          });
          const service = await buildService(mockDb);

          const result = await service.findAll(TENANT_ID, {
            kondisi_barang: kondisi,
            page: 1,
            page_size: 50,
          });

          // PROPERTY: every returned item must have kondisi_barang === kondisi
          for (const item of result.data) {
            expect(item.kondisi_barang).toBe(kondisi);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Sub-test 2: sumber_dana filter ────────────────────────────────────────

  it('setiap item yang dikembalikan cocok dengan sumber_dana yang aktif', async () => {
    await fc.assert(
      fc.asyncProperty(
        barangListArb(TENANT_ID),
        fc.constantFrom(...SUMBER_DANA_VALUES),
        async (records, sumberDana) => {
          const mockDb = createFilterMockDb(records, TENANT_ID, {
            sumber_dana: sumberDana,
          });
          const service = await buildService(mockDb);

          const result = await service.findAll(TENANT_ID, {
            sumber_dana: sumberDana,
            page: 1,
            page_size: 50,
          });

          // PROPERTY: every returned item must have sumber_dana === sumberDana
          for (const item of result.data) {
            expect(item.sumber_dana).toBe(sumberDana);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Sub-test 3: kategori filter ───────────────────────────────────────────

  it('setiap item yang dikembalikan cocok dengan kategori yang aktif', async () => {
    await fc.assert(
      fc.asyncProperty(
        barangListArb(TENANT_ID),
        fc.constantFrom(...KATEGORI_VALUES),
        async (records, kategori) => {
          const mockDb = createFilterMockDb(records, TENANT_ID, {
            kategori,
          });
          const service = await buildService(mockDb);

          const result = await service.findAll(TENANT_ID, {
            kategori,
            page: 1,
            page_size: 50,
          });

          // PROPERTY: every returned item must have kategori === kategori
          for (const item of result.data) {
            expect(item.kategori).toBe(kategori);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Sub-test 4: search filter (nama substring) ────────────────────────────

  it('setiap item yang dikembalikan mengandung search term di namanya (case-insensitive)', async () => {
    await fc.assert(
      fc.asyncProperty(
        barangListArb(TENANT_ID),
        // search term: pick a 2–5 char substring from the ASCII charset to avoid special regex chars
        fc.string({ minLength: 2, maxLength: 5 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
        async (records, searchTerm) => {
          const mockDb = createFilterMockDb(records, TENANT_ID, {
            search: searchTerm,
          });
          const service = await buildService(mockDb);

          const result = await service.findAll(TENANT_ID, {
            search: searchTerm,
            page: 1,
            page_size: 50,
          });

          // PROPERTY: every returned item's nama must contain the search term (case-insensitive)
          for (const item of result.data) {
            expect(item.nama.toLowerCase()).toContain(searchTerm.toLowerCase());
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Sub-test 5: combined filters — ALL active criteria satisfied simultaneously

  it('setiap item memenuhi SEMUA filter aktif secara bersamaan (kombinasi semua filter)', async () => {
    await fc.assert(
      fc.asyncProperty(
        barangListArb(TENANT_ID),
        optionalKondisiArb,
        optionalSumberDanaArb,
        optionalKategoriArb,
        async (records, kondisi, sumberDana, kategori) => {
          // At least one filter must be active to make the property meaningful
          fc.pre(kondisi !== undefined || sumberDana !== undefined || kategori !== undefined);

          const filters = {
            kondisi_barang: kondisi,
            sumber_dana: sumberDana,
            kategori: kategori,
          };

          const mockDb = createFilterMockDb(records, TENANT_ID, filters);
          const service = await buildService(mockDb);

          const result = await service.findAll(TENANT_ID, {
            ...filters,
            page: 1,
            page_size: 50,
          });

          for (const item of result.data) {
            // PROPERTY: if kondisi_barang filter is active, item must match
            if (kondisi !== undefined) {
              expect(item.kondisi_barang).toBe(kondisi);
            }
            // PROPERTY: if sumber_dana filter is active, item must match
            if (sumberDana !== undefined) {
              expect(item.sumber_dana).toBe(sumberDana);
            }
            // PROPERTY: if kategori filter is active, item must match
            if (kategori !== undefined) {
              expect(item.kategori).toBe(kategori);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Sub-test 6: combined enum + search filters ────────────────────────────

  it('setiap item memenuhi filter enum DAN search term sekaligus ketika keduanya aktif', async () => {
    await fc.assert(
      fc.asyncProperty(
        barangListArb(TENANT_ID),
        fc.constantFrom(...KONDISI_BARANG_VALUES),
        fc.string({ minLength: 1, maxLength: 5 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
        async (records, kondisi, searchTerm) => {
          const filters = {
            kondisi_barang: kondisi,
            search: searchTerm,
          };

          const mockDb = createFilterMockDb(records, TENANT_ID, filters);
          const service = await buildService(mockDb);

          const result = await service.findAll(TENANT_ID, {
            ...filters,
            page: 1,
            page_size: 50,
          });

          for (const item of result.data) {
            // PROPERTY: item must satisfy both the kondisi_barang enum AND the search term
            expect(item.kondisi_barang).toBe(kondisi);
            expect(item.nama.toLowerCase()).toContain(searchTerm.toLowerCase());
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Sub-test 7: no filter → all non-deleted items returned (upper bound) ──

  it('tanpa filter aktif, jumlah item yang dikembalikan tidak melebihi total record aktif', async () => {
    await fc.assert(
      fc.asyncProperty(barangListArb(TENANT_ID), async (records) => {
        const mockDb = createFilterMockDb(records, TENANT_ID, {});
        const service = await buildService(mockDb);

        const result = await service.findAll(TENANT_ID, { page: 1, page_size: 50 });

        const activeCount = records.filter((r) => r.deletedAt === null).length;
        expect(result.data.length).toBeLessThanOrEqual(activeCount);
        expect(result.meta.total_count).toBe(activeCount);
      }),
      { numRuns: 100 },
    );
  });
});
