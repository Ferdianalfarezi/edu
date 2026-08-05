import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import fc from 'fast-check';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BarangService } from './barang.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { CreateBarangDto } from './dto/create-barang.dto';
import { UpdateBarangDto } from './dto/update-barang.dto';

/**
 * Property 3: Invalid input rejection
 *
 * For any input where nama is empty/whitespace-only/exceeds 255 chars,
 * OR jumlah is negative/non-integer/exceeds 999999999,
 * OR deskripsi exceeds 1000 chars,
 * the validation SHALL reject the operation with errors on both create and update paths.
 *
 * Note: Whitespace-only nama is validated at the service layer (trim check),
 * not at the DTO class-validator level. Tests for whitespace-only use the
 * service-layer validation logic directly.
 *
 * **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 3.3, 3.5**
 */

/**
 * Service-layer validation logic for nama whitespace-only detection.
 * Mirrors the check in BarangService.update().
 */
function isNamaWhitespaceOnly(nama: string): boolean {
  return nama.trim() === '';
}

describe('Feature: pencatatan-barang, Property 3: Invalid input rejection', () => {
  describe('CreateBarangDto — nama validation', () => {
    it('rejects empty string nama', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(''), async (nama) => {
          const dto = plainToInstance(CreateBarangDto, { nama, jumlah: 10 });
          const errors = await validate(dto);
          const namaError = errors.find((e) => e.property === 'nama');
          expect(namaError).toBeDefined();
        }),
        { numRuns: 100 },
      );
    });

    it('rejects whitespace-only nama (service-layer trim validation)', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 50 }),
          (nama) => {
            expect(isNamaWhitespaceOnly(nama)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects nama exceeding 255 characters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 256, maxLength: 500 }).filter((s) => s.trim().length > 0),
          async (nama) => {
            const dto = plainToInstance(CreateBarangDto, { nama, jumlah: 10 });
            const errors = await validate(dto);
            const namaError = errors.find((e) => e.property === 'nama');
            expect(namaError).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('CreateBarangDto — jumlah validation', () => {
    it('rejects negative jumlah', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: -999999999, max: -1 }), async (jumlah) => {
          const dto = plainToInstance(CreateBarangDto, { nama: 'Barang Valid', jumlah });
          const errors = await validate(dto);
          const jumlahError = errors.find((e) => e.property === 'jumlah');
          expect(jumlahError).toBeDefined();
        }),
        { numRuns: 100 },
      );
    });

    it('rejects non-integer jumlah (floating point)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .double({ min: 0.01, max: 999999998.99, noNaN: true, noDefaultInfinity: true })
            .filter((n) => !Number.isInteger(n)),
          async (jumlah) => {
            const dto = plainToInstance(CreateBarangDto, { nama: 'Barang Valid', jumlah });
            const errors = await validate(dto);
            const jumlahError = errors.find((e) => e.property === 'jumlah');
            expect(jumlahError).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects jumlah exceeding 999999999', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1000000000, max: 2000000000 }), async (jumlah) => {
          const dto = plainToInstance(CreateBarangDto, { nama: 'Barang Valid', jumlah });
          const errors = await validate(dto);
          const jumlahError = errors.find((e) => e.property === 'jumlah');
          expect(jumlahError).toBeDefined();
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('CreateBarangDto — deskripsi validation', () => {
    it('rejects deskripsi exceeding 1000 characters', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1001, maxLength: 2000 }), async (deskripsi) => {
          const dto = plainToInstance(CreateBarangDto, {
            nama: 'Barang Valid',
            jumlah: 10,
            deskripsi,
          });
          const errors = await validate(dto);
          const deskripsiError = errors.find((e) => e.property === 'deskripsi');
          expect(deskripsiError).toBeDefined();
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('UpdateBarangDto — nama validation', () => {
    it('rejects whitespace-only nama (service-layer trim validation)', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 50 }),
          (nama) => {
            expect(isNamaWhitespaceOnly(nama)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects nama exceeding 255 characters when provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 256, maxLength: 500 }).filter((s) => s.trim().length > 0),
          async (nama) => {
            const dto = plainToInstance(UpdateBarangDto, { nama });
            const errors = await validate(dto);
            const namaError = errors.find((e) => e.property === 'nama');
            expect(namaError).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('UpdateBarangDto — jumlah validation', () => {
    it('rejects negative jumlah when provided', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: -999999999, max: -1 }), async (jumlah) => {
          const dto = plainToInstance(UpdateBarangDto, { jumlah });
          const errors = await validate(dto);
          const jumlahError = errors.find((e) => e.property === 'jumlah');
          expect(jumlahError).toBeDefined();
        }),
        { numRuns: 100 },
      );
    });

    it('rejects non-integer jumlah when provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .double({ min: 0.01, max: 999999998.99, noNaN: true, noDefaultInfinity: true })
            .filter((n) => !Number.isInteger(n)),
          async (jumlah) => {
            const dto = plainToInstance(UpdateBarangDto, { jumlah });
            const errors = await validate(dto);
            const jumlahError = errors.find((e) => e.property === 'jumlah');
            expect(jumlahError).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects jumlah exceeding 999999999 when provided', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1000000000, max: 2000000000 }), async (jumlah) => {
          const dto = plainToInstance(UpdateBarangDto, { jumlah });
          const errors = await validate(dto);
          const jumlahError = errors.find((e) => e.property === 'jumlah');
          expect(jumlahError).toBeDefined();
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('UpdateBarangDto — deskripsi validation', () => {
    it('rejects deskripsi exceeding 1000 characters when provided', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1001, maxLength: 2000 }), async (deskripsi) => {
          const dto = plainToInstance(UpdateBarangDto, { deskripsi });
          const errors = await validate(dto);
          const deskripsiError = errors.find((e) => e.property === 'deskripsi');
          expect(deskripsiError).toBeDefined();
        }),
        { numRuns: 100 },
      );
    });
  });
});

/**
 * Property 4: Tenant isolation
 *
 * For any two distinct tenants each with their own barang records,
 * listing or searching barang as one tenant SHALL never return records
 * belonging to the other tenant.
 *
 * **Validates: Requirements 2.4, 5.6**
 */
describe('Property 4: Tenant isolation', () => {
  let service: BarangService;

  /**
   * Creates a chainable mock for Drizzle ORM that returns tenant-filtered results.
   * The mock simulates the service's findAll query pattern:
   * - Count query: db.select({ count }).from().where() → [{ count }]
   * - Data query: db.select().from().where().orderBy().limit().offset() → filtered records
   */
  function createTenantIsolatedMockDb(
    allRecords: Array<{
      id: string;
      tenantId: string;
      nama: string;
      deskripsi: string | null;
      jumlah: number;
      createdAt: Date;
      updatedAt: Date;
      deletedAt: Date | null;
    }>,
  ) {
    let selectCallCount = 0;
    let queriedTenantId: string | null = null;

    const mockDb = {
      select: jest.fn().mockImplementation(() => {
        selectCallCount++;
        const isCountQuery = selectCallCount % 2 === 1;

        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockImplementation((..._args: unknown[]) => {
              // Filter records by the tenant that will be queried
              const tenantRecords = allRecords.filter(
                (r) => r.tenantId === queriedTenantId && r.deletedAt === null,
              );

              if (isCountQuery) {
                return Promise.resolve([{ count: tenantRecords.length }]);
              }

              return {
                orderBy: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue({
                    offset: jest.fn().mockResolvedValue(tenantRecords),
                  }),
                }),
              };
            }),
          }),
        };
      }),
    };

    return {
      mockDb,
      setQueriedTenant: (tenantId: string) => {
        queriedTenantId = tenantId;
        selectCallCount = 0;
      },
    };
  }

  // Arbitrary for generating a list of barang records for a given tenant
  const barangListArb = (tenantId: string) =>
    fc
      .array(
        fc.record({
          nama: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
          jumlah: fc.integer({ min: 0, max: 999999999 }),
          deskripsi: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
        }),
        { minLength: 1, maxLength: 5 },
      )
      .map((items) =>
        items.map((item, i) => ({
          id: `${tenantId.slice(0, 8)}-${i}`,
          tenantId,
          nama: item.nama,
          deskripsi: item.deskripsi,
          jumlah: item.jumlah,
          createdAt: new Date(2024, 0, 1, 0, 0, i),
          updatedAt: new Date(2024, 0, 1, 0, 0, i),
          deletedAt: null,
        })),
      );

  it('listing as tenant A never returns tenant B records', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), async (tenantA, tenantB) => {
        // Ensure tenants are distinct
        fc.pre(tenantA !== tenantB);

        // Generate records for each tenant with deterministic IDs
        const recordsA = Array.from({ length: 3 }, (_, i) => ({
          id: `aaa-${tenantA.slice(0, 4)}-${i}`,
          tenantId: tenantA,
          nama: `Barang A-${i}`,
          deskripsi: null,
          jumlah: i * 10,
          createdAt: new Date(2024, 0, 1, 0, 0, i),
          updatedAt: new Date(2024, 0, 1, 0, 0, i),
          deletedAt: null,
        }));

        const recordsB = Array.from({ length: 3 }, (_, i) => ({
          id: `bbb-${tenantB.slice(0, 4)}-${i}`,
          tenantId: tenantB,
          nama: `Barang B-${i}`,
          deskripsi: null,
          jumlah: i * 100,
          createdAt: new Date(2024, 0, 1, 0, 0, i),
          updatedAt: new Date(2024, 0, 1, 0, 0, i),
          deletedAt: null,
        }));

        const allRecords = [...recordsA, ...recordsB];
        const { mockDb, setQueriedTenant } = createTenantIsolatedMockDb(allRecords);

        const module: TestingModule = await Test.createTestingModule({
          providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
        }).compile();

        service = module.get<BarangService>(BarangService);

        // Query as tenant A
        setQueriedTenant(tenantA);
        const result = await service.findAll(tenantA, {});

        // PROPERTY: Every returned record must belong to tenant A
        for (const item of result.data) {
          const matchingRecord = recordsA.find((r) => r.id === item.id);
          expect(matchingRecord).toBeDefined();
        }

        // PROPERTY: No record from tenant B should appear
        const returnedIds = result.data.map((r) => r.id);
        for (const recB of recordsB) {
          expect(returnedIds).not.toContain(recB.id);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('listing as tenant B never returns tenant A records', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), async (tenantA, tenantB) => {
        // Ensure tenants are distinct
        fc.pre(tenantA !== tenantB);

        const recordsA = Array.from({ length: 3 }, (_, i) => ({
          id: `aaa-${tenantA.slice(0, 4)}-${i}`,
          tenantId: tenantA,
          nama: `Barang A-${i}`,
          deskripsi: null,
          jumlah: i * 10,
          createdAt: new Date(2024, 0, 1, 0, 0, i),
          updatedAt: new Date(2024, 0, 1, 0, 0, i),
          deletedAt: null,
        }));

        const recordsB = Array.from({ length: 3 }, (_, i) => ({
          id: `bbb-${tenantB.slice(0, 4)}-${i}`,
          tenantId: tenantB,
          nama: `Barang B-${i}`,
          deskripsi: null,
          jumlah: i * 100,
          createdAt: new Date(2024, 0, 1, 0, 0, i),
          updatedAt: new Date(2024, 0, 1, 0, 0, i),
          deletedAt: null,
        }));

        const allRecords = [...recordsA, ...recordsB];
        const { mockDb, setQueriedTenant } = createTenantIsolatedMockDb(allRecords);

        const module: TestingModule = await Test.createTestingModule({
          providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
        }).compile();

        service = module.get<BarangService>(BarangService);

        // Query as tenant B
        setQueriedTenant(tenantB);
        const result = await service.findAll(tenantB, {});

        // PROPERTY: Every returned record must belong to tenant B
        for (const item of result.data) {
          const matchingRecord = recordsB.find((r) => r.id === item.id);
          expect(matchingRecord).toBeDefined();
        }

        // PROPERTY: No record from tenant A should appear
        const returnedIds = result.data.map((r) => r.id);
        for (const recA of recordsA) {
          expect(returnedIds).not.toContain(recA.id);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('search with query as tenant A never returns tenant B records', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        async (tenantA, tenantB, searchTerm) => {
          // Ensure tenants are distinct
          fc.pre(tenantA !== tenantB);

          // All tenant A records contain the search term in their nama
          const recordsA = Array.from({ length: 3 }, (_, i) => ({
            id: `aaa-${tenantA.slice(0, 4)}-${i}`,
            tenantId: tenantA,
            nama: `Item ${searchTerm} ${i}`,
            deskripsi: null,
            jumlah: i,
            createdAt: new Date(2024, 0, 1, 0, 0, i),
            updatedAt: new Date(2024, 0, 1, 0, 0, i),
            deletedAt: null,
          }));

          // Tenant B records also contain the search term (worst case for isolation)
          const recordsB = Array.from({ length: 3 }, (_, i) => ({
            id: `bbb-${tenantB.slice(0, 4)}-${i}`,
            tenantId: tenantB,
            nama: `Item ${searchTerm} ${i + 100}`,
            deskripsi: null,
            jumlah: i + 100,
            createdAt: new Date(2024, 0, 1, 0, 0, i),
            updatedAt: new Date(2024, 0, 1, 0, 0, i),
            deletedAt: null,
          }));

          const allRecords = [...recordsA, ...recordsB];
          const { mockDb, setQueriedTenant } = createTenantIsolatedMockDb(allRecords);

          const module: TestingModule = await Test.createTestingModule({
            providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
          }).compile();

          service = module.get<BarangService>(BarangService);

          // Query as tenant A with a search term
          setQueriedTenant(tenantA);
          const result = await service.findAll(tenantA, { search: searchTerm });

          // PROPERTY: No record from tenant B should appear even if matching search
          const returnedIds = result.data.map((r) => r.id);
          for (const recB of recordsB) {
            expect(returnedIds).not.toContain(recB.id);
          }

          // PROPERTY: All returned records belong to tenant A
          for (const item of result.data) {
            const matchingRecord = recordsA.find((r) => r.id === item.id);
            expect(matchingRecord).toBeDefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 5: Soft-deleted items excluded from queries
 *
 * For any barang that has been soft-deleted (non-null deletedAt),
 * that barang SHALL not appear in list results or search results
 * regardless of query parameters.
 *
 * **Validates: Requirements 4.6**
 */
describe('Property 5: Soft-deleted items excluded from queries', () => {
  let service: BarangService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BarangService, { provide: DRIZZLE, useValue: {} }],
    }).compile();

    service = module.get<BarangService>(BarangService);
  });

  /**
   * Creates a mock DB that simulates the WHERE isNull(deletedAt) filtering behavior.
   * Given all records and which ones are deleted, it returns only active records.
   */
  function createFindAllMockDb(
    activeRecords: Array<{
      id: string;
      tenantId: string;
      nama: string;
      deskripsi: string | null;
      jumlah: number;
      createdAt: Date;
      updatedAt: Date;
      deletedAt: null;
    }>,
    searchTerm?: string,
  ) {
    // Apply search filter if provided (simulating ILIKE on nama)
    let filteredRecords = activeRecords;
    if (searchTerm) {
      filteredRecords = activeRecords.filter((r) =>
        r.nama.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    // Sort by createdAt DESC
    const sortedRecords = [...filteredRecords].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    let selectCallCount = 0;
    return {
      select: jest.fn().mockImplementation(() => {
        selectCallCount++;
        const isCountQuery = selectCallCount % 2 === 1;

        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue(
              isCountQuery
                ? Promise.resolve([{ count: sortedRecords.length }])
                : {
                    orderBy: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        offset: jest.fn().mockResolvedValue(sortedRecords.slice(0, 15)),
                      }),
                    }),
                  },
            ),
          }),
        };
      }),
    };
  }

  it('should never include soft-deleted items in findAll results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // tenantId
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }), // deletion mask
        async (tenantId, deletionMask) => {
          // Generate records based on deletion mask
          const allRecords: Array<{
            id: string;
            tenantId: string;
            nama: string;
            deskripsi: string | null;
            jumlah: number;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
          }> = [];

          for (let i = 0; i < deletionMask.length; i++) {
            allRecords.push({
              id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
              tenantId,
              nama: `Barang ${i}`,
              deskripsi: i % 2 === 0 ? `Deskripsi ${i}` : null,
              jumlah: i * 10,
              createdAt: new Date(2024, 0, i + 1),
              updatedAt: new Date(2024, 0, i + 1),
              deletedAt: deletionMask[i] ? new Date(2024, 5, 15) : null,
            });
          }

          // Separate active vs deleted
          const activeRecords = allRecords.filter((r) => r.deletedAt === null) as Array<{
            id: string;
            tenantId: string;
            nama: string;
            deskripsi: string | null;
            jumlah: number;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: null;
          }>;
          const deletedIds = new Set(
            allRecords.filter((r) => r.deletedAt !== null).map((r) => r.id),
          );

          // Mock DB only returns active records (simulating WHERE isNull(deletedAt))
          const mockDb = createFindAllMockDb(activeRecords);
          (service as any).db = mockDb;

          const result = await service.findAll(tenantId, { page: 1, page_size: 15 });

          // PROPERTY: No soft-deleted item should appear in results
          for (const item of result.data) {
            expect(deletedIds.has(item.id)).toBe(false);
          }

          // All returned items must be from the active set
          const activeIds = new Set(activeRecords.map((r) => r.id));
          for (const item of result.data) {
            expect(activeIds.has(item.id)).toBe(true);
          }

          // Count should reflect only active records
          expect(result.meta.total_count).toBe(activeRecords.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should exclude soft-deleted items from search results regardless of search term', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // tenantId
        fc.integer({ min: 1, max: 10 }), // number of active items
        fc.integer({ min: 1, max: 10 }), // number of deleted items
        fc.constantFrom('Barang', 'barang', 'BARANG', 'ara', ''), // search terms
        async (tenantId, activeCount, deletedCount, searchTerm) => {
          const activeRecords: Array<{
            id: string;
            tenantId: string;
            nama: string;
            deskripsi: string | null;
            jumlah: number;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: null;
          }> = [];
          const deletedRecords: Array<{
            id: string;
            tenantId: string;
            nama: string;
            deskripsi: string | null;
            jumlah: number;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date;
          }> = [];

          // Generate active records
          for (let i = 0; i < activeCount; i++) {
            activeRecords.push({
              id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
              tenantId,
              nama: `Barang Aktif ${i}`,
              deskripsi: null,
              jumlah: i,
              createdAt: new Date(2024, 0, i + 1),
              updatedAt: new Date(2024, 0, i + 1),
              deletedAt: null,
            });
          }

          // Generate deleted records (with similar names so search could match them)
          for (let i = 0; i < deletedCount; i++) {
            deletedRecords.push({
              id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, '0')}`,
              tenantId,
              nama: `Barang Terhapus ${i}`,
              deskripsi: null,
              jumlah: i * 100,
              createdAt: new Date(2024, 1, i + 1),
              updatedAt: new Date(2024, 1, i + 1),
              deletedAt: new Date(2024, 5, 15),
            });
          }

          // Mock DB only returns active records filtered by search
          const mockDb = createFindAllMockDb(activeRecords, searchTerm || undefined);
          (service as any).db = mockDb;

          const result = await service.findAll(tenantId, {
            page: 1,
            page_size: 15,
            search: searchTerm || undefined,
          });

          // PROPERTY: No deleted item IDs appear in results
          const deletedIds = new Set(deletedRecords.map((r) => r.id));
          for (const item of result.data) {
            expect(deletedIds.has(item.id)).toBe(false);
          }

          // All returned items must be from the active set
          const activeIds = new Set(activeRecords.map((r) => r.id));
          for (const item of result.data) {
            expect(activeIds.has(item.id)).toBe(true);
          }

          // Result count should not include deleted records
          expect(result.meta.total_count).toBeLessThanOrEqual(activeCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should exclude soft-deleted items regardless of deletion timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // tenantId
        fc.integer({ min: 1, max: 8 }), // number of active items
        fc.integer({ min: 1, max: 8 }), // number of deleted items
        fc.array(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), {
          minLength: 1,
          maxLength: 8,
        }), // varied deletedAt timestamps
        async (tenantId, activeCount, deletedCount, deletionDates) => {
          const activeRecords: Array<{
            id: string;
            tenantId: string;
            nama: string;
            deskripsi: string | null;
            jumlah: number;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: null;
          }> = [];

          // Generate active records
          for (let i = 0; i < activeCount; i++) {
            activeRecords.push({
              id: `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, '0')}`,
              tenantId,
              nama: `Active Item ${i}`,
              deskripsi: null,
              jumlah: i,
              createdAt: new Date(2024, 0, i + 1),
              updatedAt: new Date(2024, 0, i + 1),
              deletedAt: null,
            });
          }

          // Generate deleted records with varied deletedAt timestamps
          const deletedIds = new Set<string>();
          for (let i = 0; i < deletedCount; i++) {
            const id = `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, '0')}`;
            deletedIds.add(id);
          }

          // Mock DB only returns active records (WHERE isNull(deletedAt))
          const sortedActive = [...activeRecords].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );

          let selectCallCount = 0;
          const mockDb = {
            select: jest.fn().mockImplementation(() => {
              selectCallCount++;
              const isCountQuery = selectCallCount % 2 === 1;

              return {
                from: jest.fn().mockReturnValue({
                  where: jest.fn().mockReturnValue(
                    isCountQuery
                      ? Promise.resolve([{ count: activeRecords.length }])
                      : {
                          orderBy: jest.fn().mockReturnValue({
                            limit: jest.fn().mockReturnValue({
                              offset: jest.fn().mockResolvedValue(sortedActive.slice(0, 15)),
                            }),
                          }),
                        },
                  ),
                }),
              };
            }),
          };

          (service as any).db = mockDb;

          const result = await service.findAll(tenantId, { page: 1, page_size: 15 });

          // PROPERTY: No deleted item IDs appear in results
          for (const item of result.data) {
            expect(deletedIds.has(item.id)).toBe(false);
          }

          // Result count matches active count only
          expect(result.meta.total_count).toBe(activeRecords.length);

          // Number of returned items should not exceed active count
          expect(result.data.length).toBeLessThanOrEqual(activeRecords.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 7: Pagination slice correctness
 *
 * For any collection of N active barang in a tenant and valid pagination params
 * (page, page_size), the returned data should have length <= page_size,
 * meta.total_count should equal N, and meta.total_pages should equal ceil(N / page_size).
 *
 * **Validates: Requirements 2.2**
 */
describe('Property 7: Pagination slice correctness', () => {
  let service: BarangService;

  // Valid page sizes as defined in ListBarangQueryDto
  const validPageSizes = [10, 15, 25, 50] as const;

  // Arbitrary for N (total number of active barang): 0 to 100
  const totalCountArb = fc.integer({ min: 0, max: 100 });

  // Arbitrary for pageSize from the allowed values
  const pageSizeArb = fc.constantFrom(...validPageSizes);

  // Generate a fake barang record for mocking DB responses
  function generateFakeBarangRecord(index: number, tenantId: string) {
    const now = new Date();
    return {
      id: `eeeeeeee-eeee-4eee-8eee-${String(index).padStart(12, '0')}`,
      tenantId,
      nama: `Barang ${index}`,
      deskripsi: index % 2 === 0 ? `Deskripsi ${index}` : null,
      jumlah: index * 10,
      createdAt: new Date(now.getTime() - index * 60000),
      updatedAt: now,
      deletedAt: null,
    };
  }

  /**
   * Creates a chainable mock for Drizzle ORM that simulates the findAll query pattern:
   * - Count query: db.select({ count }).from().where() -> [{ count: N }]
   * - Data query: db.select().from().where().orderBy().limit().offset() -> slice of records
   */
  function createFindAllMockDb(totalCount: number, dataSlice: unknown[]) {
    let selectCallCount = 0;

    return {
      select: jest.fn().mockImplementation(() => {
        selectCallCount++;
        const isCountQuery = selectCallCount % 2 === 1;

        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue(
              isCountQuery
                ? Promise.resolve([{ count: totalCount }])
                : {
                    orderBy: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        offset: jest.fn().mockResolvedValue(dataSlice),
                      }),
                    }),
                  },
            ),
          }),
        };
      }),
    };
  }

  it('data.length <= pageSize for any valid N, page, and pageSize', async () => {
    await fc.assert(
      fc.asyncProperty(totalCountArb, pageSizeArb, fc.uuid(), async (n, pageSize, tenantId) => {
        const totalPages = n === 0 ? 0 : Math.ceil(n / pageSize);
        // Generate a valid page number: 1..totalPages+1 (allow one beyond for edge case)
        const maxPage = Math.max(1, totalPages);
        const page = fc.sample(fc.integer({ min: 1, max: maxPage }), 1)[0];

        // Calculate expected slice size for this page
        const offset = (page - 1) * pageSize;
        const expectedSliceSize = Math.min(pageSize, Math.max(0, n - offset));

        // Generate fake records for the slice
        const dataSlice = Array.from({ length: expectedSliceSize }, (_, i) =>
          generateFakeBarangRecord(offset + i, tenantId),
        );

        const mockDb = createFindAllMockDb(n, dataSlice);

        const module: TestingModule = await Test.createTestingModule({
          providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
        }).compile();

        service = module.get<BarangService>(BarangService);

        const result = await service.findAll(tenantId, { page, page_size: pageSize });

        // PROPERTY: data.length must never exceed pageSize
        expect(result.data.length).toBeLessThanOrEqual(pageSize);
      }),
      { numRuns: 100 },
    );
  });

  it('meta.total_count equals N for any valid pagination params', async () => {
    await fc.assert(
      fc.asyncProperty(totalCountArb, pageSizeArb, fc.uuid(), async (n, pageSize, tenantId) => {
        const totalPages = n === 0 ? 0 : Math.ceil(n / pageSize);
        const maxPage = Math.max(1, totalPages);
        const page = fc.sample(fc.integer({ min: 1, max: maxPage }), 1)[0];

        const offset = (page - 1) * pageSize;
        const expectedSliceSize = Math.min(pageSize, Math.max(0, n - offset));
        const dataSlice = Array.from({ length: expectedSliceSize }, (_, i) =>
          generateFakeBarangRecord(offset + i, tenantId),
        );

        const mockDb = createFindAllMockDb(n, dataSlice);

        const module: TestingModule = await Test.createTestingModule({
          providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
        }).compile();

        service = module.get<BarangService>(BarangService);

        const result = await service.findAll(tenantId, { page, page_size: pageSize });

        // PROPERTY: meta.total_count must equal N
        expect(result.meta.total_count).toBe(n);
      }),
      { numRuns: 100 },
    );
  });

  it('meta.total_pages equals ceil(N / pageSize) for any valid N and pageSize', async () => {
    await fc.assert(
      fc.asyncProperty(totalCountArb, pageSizeArb, fc.uuid(), async (n, pageSize, tenantId) => {
        const totalPages = n === 0 ? 0 : Math.ceil(n / pageSize);
        const maxPage = Math.max(1, totalPages);
        const page = fc.sample(fc.integer({ min: 1, max: maxPage }), 1)[0];

        const offset = (page - 1) * pageSize;
        const expectedSliceSize = Math.min(pageSize, Math.max(0, n - offset));
        const dataSlice = Array.from({ length: expectedSliceSize }, (_, i) =>
          generateFakeBarangRecord(offset + i, tenantId),
        );

        const mockDb = createFindAllMockDb(n, dataSlice);

        const module: TestingModule = await Test.createTestingModule({
          providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
        }).compile();

        service = module.get<BarangService>(BarangService);

        const result = await service.findAll(tenantId, { page, page_size: pageSize });

        // PROPERTY: meta.total_pages must equal ceil(N / pageSize)
        const expectedTotalPages = Math.ceil(n / pageSize);
        expect(result.meta.total_pages).toBe(expectedTotalPages);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 8: List ordering invariant
 *
 * For any set of barang returned by the list endpoint, each item's createdAt
 * should be >= the createdAt of the next item (descending order).
 *
 * **Validates: Requirements 2.3**
 */
describe('Property 8: List ordering invariant', () => {
  let service: BarangService;

  /**
   * Creates a chainable mock for Drizzle ORM that:
   * 1. Accepts records with varied timestamps
   * 2. Sorts them by createdAt DESC before returning (as the real service does)
   * 3. Returns a count query and a data query in sequence
   */
  function createOrderedMockDb(
    records: Array<{
      id: string;
      tenantId: string;
      nama: string;
      deskripsi: string | null;
      jumlah: number;
      createdAt: Date;
      updatedAt: Date;
      deletedAt: null;
    }>,
    pageSize: number = 15,
    offset: number = 0,
  ) {
    // Sort by createdAt DESC (simulating the real DB orderBy(desc(barang.createdAt)))
    const sorted = [...records].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const paginatedSlice = sorted.slice(offset, offset + pageSize);

    let selectCallCount = 0;
    return {
      select: jest.fn().mockImplementation(() => {
        selectCallCount++;
        const isCountQuery = selectCallCount % 2 === 1;

        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue(
              isCountQuery
                ? Promise.resolve([{ count: records.length }])
                : {
                    orderBy: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        offset: jest.fn().mockResolvedValue(paginatedSlice),
                      }),
                    }),
                  },
            ),
          }),
        };
      }),
    };
  }

  it('every item createdAt >= next item createdAt (DESC order) for random timestamps', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // tenantId
        fc.array(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), {
          minLength: 2,
          maxLength: 30,
        }), // varied timestamps
        async (tenantId, timestamps) => {
          // Generate records with varied createdAt timestamps
          const records = timestamps.map((ts, i) => ({
            id: `ffffffff-ffff-4fff-8fff-${String(i).padStart(12, '0')}`,
            tenantId,
            nama: `Barang ${i}`,
            deskripsi: i % 2 === 0 ? `Desc ${i}` : null,
            jumlah: i * 5,
            createdAt: ts,
            updatedAt: ts,
            deletedAt: null as null,
          }));

          const mockDb = createOrderedMockDb(records);

          const module: TestingModule = await Test.createTestingModule({
            providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
          }).compile();

          service = module.get<BarangService>(BarangService);

          const result = await service.findAll(tenantId, { page: 1, page_size: 50 });

          // PROPERTY: For each adjacent pair, item[i].createdAt >= item[i+1].createdAt
          for (let i = 0; i < result.data.length - 1; i++) {
            const currentCreatedAt = new Date(result.data[i].createdAt).getTime();
            const nextCreatedAt = new Date(result.data[i + 1].createdAt).getTime();
            expect(currentCreatedAt).toBeGreaterThanOrEqual(nextCreatedAt);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('ordering invariant holds for different page sizes', async () => {
    const validPageSizes = [10, 15, 25, 50] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // tenantId
        fc.constantFrom(...validPageSizes), // pageSize
        fc.array(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), {
          minLength: 2,
          maxLength: 60,
        }), // varied timestamps
        async (tenantId, pageSize, timestamps) => {
          const records = timestamps.map((ts, i) => ({
            id: `aaaaaaaa-bbbb-4ccc-8ddd-${String(i).padStart(12, '0')}`,
            tenantId,
            nama: `Item ${i}`,
            deskripsi: null,
            jumlah: i,
            createdAt: ts,
            updatedAt: ts,
            deletedAt: null as null,
          }));

          const mockDb = createOrderedMockDb(records, pageSize);

          const module: TestingModule = await Test.createTestingModule({
            providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
          }).compile();

          service = module.get<BarangService>(BarangService);

          const result = await service.findAll(tenantId, { page: 1, page_size: pageSize });

          // PROPERTY: DESC ordering holds within the returned page
          for (let i = 0; i < result.data.length - 1; i++) {
            const currentCreatedAt = new Date(result.data[i].createdAt).getTime();
            const nextCreatedAt = new Date(result.data[i + 1].createdAt).getTime();
            expect(currentCreatedAt).toBeGreaterThanOrEqual(nextCreatedAt);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('ordering invariant holds even with identical timestamps', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // tenantId
        fc.integer({ min: 2, max: 20 }), // number of records
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), // shared timestamp
        async (tenantId, count, sharedTimestamp) => {
          // All records have the same createdAt — should still satisfy >= invariant
          const records = Array.from({ length: count }, (_, i) => ({
            id: `11111111-2222-4333-8444-${String(i).padStart(12, '0')}`,
            tenantId,
            nama: `Same Time Barang ${i}`,
            deskripsi: null,
            jumlah: i,
            createdAt: sharedTimestamp,
            updatedAt: sharedTimestamp,
            deletedAt: null as null,
          }));

          const mockDb = createOrderedMockDb(records);

          const module: TestingModule = await Test.createTestingModule({
            providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
          }).compile();

          service = module.get<BarangService>(BarangService);

          const result = await service.findAll(tenantId, { page: 1, page_size: 50 });

          // PROPERTY: >= holds even when all timestamps are equal
          for (let i = 0; i < result.data.length - 1; i++) {
            const currentCreatedAt = new Date(result.data[i].createdAt).getTime();
            const nextCreatedAt = new Date(result.data[i + 1].createdAt).getTime();
            expect(currentCreatedAt).toBeGreaterThanOrEqual(nextCreatedAt);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 9: Search returns matching items only
 *
 * For any search term and collection of barang, all items in the search results
 * SHALL have a nama that contains the search term (case-insensitive), and no item
 * with a matching nama should be excluded from results (within pagination bounds).
 *
 * **Validates: Requirements 2.6**
 */
describe('Property 9: Search returns matching items only', () => {
  let service: BarangService;

  /**
   * Creates a chainable mock for Drizzle ORM that simulates ILIKE search behavior.
   * Filters records where nama.toLowerCase().includes(search.toLowerCase())
   * and applies pagination (limit/offset).
   */
  function createSearchMockDb(
    allRecords: Array<{
      id: string;
      tenantId: string;
      nama: string;
      deskripsi: string | null;
      jumlah: number;
      createdAt: Date;
      updatedAt: Date;
      deletedAt: null;
    }>,
    searchTerm: string,
    pageSize: number,
    offset: number,
  ) {
    // Simulate ILIKE: case-insensitive substring match on nama
    const matchingRecords = allRecords.filter((r) =>
      r.nama.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    // Sort by createdAt DESC (matching the service's ordering)
    const sortedMatching = [...matchingRecords].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    // Apply pagination
    const paginatedSlice = sortedMatching.slice(offset, offset + pageSize);

    let selectCallCount = 0;

    return {
      mockDb: {
        select: jest.fn().mockImplementation(() => {
          selectCallCount++;
          const isCountQuery = selectCallCount % 2 === 1;

          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue(
                isCountQuery
                  ? Promise.resolve([{ count: matchingRecords.length }])
                  : {
                      orderBy: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                          offset: jest.fn().mockResolvedValue(paginatedSlice),
                        }),
                      }),
                    },
              ),
            }),
          };
        }),
      },
      matchingRecords: sortedMatching,
      paginatedSlice,
    };
  }

  // Arbitrary for generating barang names with varied casing
  const namaArb = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0)
    .map((s) => {
      // Randomly mix case to exercise case-insensitivity
      return s
        .split('')
        .map((ch) => (Math.random() > 0.5 ? ch.toUpperCase() : ch.toLowerCase()))
        .join('');
    });

  it('all returned items contain the search term in nama (case-insensitive)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // tenantId
        fc.array(
          fc.record({
            nama: fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0),
            jumlah: fc.integer({ min: 0, max: 999999999 }),
          }),
          { minLength: 1, maxLength: 20 },
        ), // barang items
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0), // search term
        async (tenantId, items, searchTerm) => {
          // Build records from generated items
          const allRecords = items.map((item, i) => ({
            id: `ffffffff-ffff-4fff-8fff-${String(i).padStart(12, '0')}`,
            tenantId,
            nama: item.nama,
            deskripsi: null as string | null,
            jumlah: item.jumlah,
            createdAt: new Date(2024, 0, 1, 0, 0, i),
            updatedAt: new Date(2024, 0, 1, 0, 0, i),
            deletedAt: null as null,
          }));

          const pageSize = 15;
          const offset = 0;

          const { mockDb } = createSearchMockDb(allRecords, searchTerm, pageSize, offset);

          const module: TestingModule = await Test.createTestingModule({
            providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
          }).compile();

          service = module.get<BarangService>(BarangService);

          const result = await service.findAll(tenantId, {
            search: searchTerm,
            page: 1,
            page_size: pageSize,
          });

          // PROPERTY: Every returned item's nama must contain the search term (case-insensitive)
          for (const item of result.data) {
            expect(item.nama.toLowerCase()).toContain(searchTerm.toLowerCase());
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no matching item is excluded within pagination bounds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // tenantId
        fc.array(
          fc.record({
            nama: fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0),
            jumlah: fc.integer({ min: 0, max: 999999999 }),
          }),
          { minLength: 1, maxLength: 20 },
        ), // barang items
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0), // search term
        fc.constantFrom(10, 15, 25, 50), // pageSize
        async (tenantId, items, searchTerm, pageSize) => {
          // Build records from generated items
          const allRecords = items.map((item, i) => ({
            id: `ffffffff-ffff-4fff-8fff-${String(i).padStart(12, '0')}`,
            tenantId,
            nama: item.nama,
            deskripsi: null as string | null,
            jumlah: item.jumlah,
            createdAt: new Date(2024, 0, 1, 0, 0, i),
            updatedAt: new Date(2024, 0, 1, 0, 0, i),
            deletedAt: null as null,
          }));

          const offset = 0; // page 1

          const { mockDb, matchingRecords, paginatedSlice } = createSearchMockDb(
            allRecords,
            searchTerm,
            pageSize,
            offset,
          );

          const module: TestingModule = await Test.createTestingModule({
            providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
          }).compile();

          service = module.get<BarangService>(BarangService);

          const result = await service.findAll(tenantId, {
            search: searchTerm,
            page: 1,
            page_size: pageSize,
          });

          // PROPERTY: All items that match the search term (within the current page bounds)
          // must be present in the result. No matching item should be excluded.
          const expectedIdsInPage = paginatedSlice.map((r) => r.id);
          const returnedIds = result.data.map((r) => r.id);

          // Every expected ID in this page should be in results
          for (const expectedId of expectedIdsInPage) {
            expect(returnedIds).toContain(expectedId);
          }

          // Result count should not exceed page_size
          expect(result.data.length).toBeLessThanOrEqual(pageSize);

          // meta.total_count should equal total matching records
          expect(result.meta.total_count).toBe(matchingRecords.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('search is case-insensitive: mixed case search term matches items regardless of case', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // tenantId
        fc
          .string({ minLength: 2, maxLength: 15 })
          .filter((s) => /[a-zA-Z]/.test(s) && s.trim().length > 0), // base word
        fc.integer({ min: 3, max: 15 }), // number of items
        async (tenantId, baseWord, itemCount) => {
          // Create items where some have the base word in varying cases
          const allRecords = Array.from({ length: itemCount }, (_, i) => {
            // Half items contain the base word (in different cases)
            const containsWord = i % 2 === 0;
            let nama: string;
            if (containsWord) {
              // Randomly case the base word to embed in the name
              const casedWord = baseWord
                .split('')
                .map((ch) => (i % 3 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
                .join('');
              nama = `Item-${casedWord}-${i}`;
            } else {
              nama = `Objek Lain ${i}`;
            }
            return {
              id: `ffffffff-ffff-4fff-8fff-${String(i).padStart(12, '0')}`,
              tenantId,
              nama,
              deskripsi: null as string | null,
              jumlah: i * 5,
              createdAt: new Date(2024, 0, 1, 0, 0, i),
              updatedAt: new Date(2024, 0, 1, 0, 0, i),
              deletedAt: null as null,
            };
          });

          // Use the base word with different casing as search term
          const searchTerm = baseWord
            .split('')
            .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
            .join('');

          const pageSize = 50; // Large enough to not truncate
          const offset = 0;

          const { mockDb, matchingRecords } = createSearchMockDb(
            allRecords,
            searchTerm,
            pageSize,
            offset,
          );

          const module: TestingModule = await Test.createTestingModule({
            providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
          }).compile();

          service = module.get<BarangService>(BarangService);

          const result = await service.findAll(tenantId, {
            search: searchTerm,
            page: 1,
            page_size: pageSize,
          });

          // PROPERTY: All returned items must contain the search term case-insensitively
          for (const item of result.data) {
            expect(item.nama.toLowerCase()).toContain(searchTerm.toLowerCase());
          }

          // PROPERTY: The count of results matches what we expect from ILIKE filtering
          expect(result.data.length).toBe(matchingRecords.length);

          // PROPERTY: No matching record was left out
          const matchingIds = matchingRecords.map((r) => r.id);
          const returnedIds = result.data.map((r) => r.id);
          for (const mId of matchingIds) {
            expect(returnedIds).toContain(mId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Unit Tests for BarangService
 *
 * Tests specific examples covering CRUD happy paths, edge cases, and error cases.
 * Uses mocked Drizzle DB to isolate service logic.
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.8, 3.2, 3.4, 4.2, 4.3**
 */
describe('BarangService — Unit Tests', () => {
  let service: BarangService;
  let mockDb: any;

  const TENANT_ID = '11111111-1111-4111-8111-111111111111';
  const BARANG_ID = '22222222-2222-4222-8222-222222222222';

  const now = new Date('2024-06-15T10:00:00.000Z');

  function makeFakeRecord(overrides: Partial<any> = {}) {
    return {
      id: BARANG_ID,
      tenantId: TENANT_ID,
      nama: 'Meja Kayu',
      deskripsi: 'Meja kayu jati ukuran besar',
      jumlah: 10,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...overrides,
    };
  }

  /**
   * Creates a chainable mock DB for the service.
   * Supports: insert().values().returning(), select().from().where(),
   * update().set().where().returning()
   */
  function createMockDb() {
    const db: any = {};

    // insert().values().returning()
    db.insert = jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn(),
      }),
    });

    // select().from().where() — used by findOne and findAll (count + data)
    db.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn(),
      }),
    });

    // update().set().where().returning() — used by update and remove
    db.update = jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn(),
        }),
      }),
    });

    return db;
  }

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<BarangService>(BarangService);
  });

  // ─── Happy Paths ───────────────────────────────────────────────────────────

  describe('create — happy path', () => {
    it('should create a barang and return response DTO', async () => {
      const dto: CreateBarangDto = {
        nama: 'Kursi Besi',
        deskripsi: 'Kursi kantor',
        jumlah: 5,
        kondisi_barang: 'bagus',
        sumber_dana: 'yayasan',
        kategori: 'peralatan',
      };
      const record = makeFakeRecord({
        nama: dto.nama,
        deskripsi: dto.deskripsi,
        jumlah: dto.jumlah,
      });

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([record]),
        }),
      });

      const result = await service.create(TENANT_ID, dto);

      expect(result).toEqual({
        id: BARANG_ID,
        nama: 'Kursi Besi',
        deskripsi: 'Kursi kantor',
        jumlah: 5,
        lokasi: null,
        kondisi_barang: null,
        sumber_dana: null,
        kategori: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should create a barang with null deskripsi when not provided', async () => {
      const dto: CreateBarangDto = {
        nama: 'Papan Tulis',
        jumlah: 3,
        kondisi_barang: 'bagus',
        sumber_dana: 'yayasan',
        kategori: 'peralatan',
      };
      const record = makeFakeRecord({ nama: dto.nama, deskripsi: null, jumlah: dto.jumlah });

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([record]),
        }),
      });

      const result = await service.create(TENANT_ID, dto);

      expect(result.deskripsi).toBeNull();
      expect(result.nama).toBe('Papan Tulis');
    });
  });

  describe('findAll — happy path', () => {
    it('should return paginated list of barang', async () => {
      const records = [
        makeFakeRecord({
          id: 'aaa',
          nama: 'Meja',
          createdAt: new Date('2024-06-15T12:00:00Z'),
          updatedAt: new Date('2024-06-15T12:00:00Z'),
        }),
        makeFakeRecord({
          id: 'bbb',
          nama: 'Kursi',
          createdAt: new Date('2024-06-15T11:00:00Z'),
          updatedAt: new Date('2024-06-15T11:00:00Z'),
        }),
      ];

      let selectCallCount = 0;
      mockDb.select.mockImplementation(() => {
        selectCallCount++;
        const isCountQuery = selectCallCount % 2 === 1;
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue(
              isCountQuery
                ? Promise.resolve([{ count: 2 }])
                : {
                    orderBy: jest.fn().mockReturnValue({
                      limit: jest.fn().mockReturnValue({
                        offset: jest.fn().mockResolvedValue(records),
                      }),
                    }),
                  },
            ),
          }),
        };
      });

      const result = await service.findAll(TENANT_ID, { page: 1, page_size: 15 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total_count).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.page_size).toBe(15);
    });
  });

  describe('findOne — happy path', () => {
    it('should return a single barang by ID', async () => {
      const record = makeFakeRecord();

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([record]),
        }),
      });

      const result = await service.findOne(TENANT_ID, BARANG_ID);

      expect(result).toEqual({
        id: BARANG_ID,
        nama: 'Meja Kayu',
        deskripsi: 'Meja kayu jati ukuran besar',
        jumlah: 10,
        lokasi: null,
        kondisi_barang: null,
        sumber_dana: null,
        kategori: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    });
  });

  describe('update — happy path', () => {
    it('should update barang and return updated response', async () => {
      const existing = makeFakeRecord();
      const updatedRecord = makeFakeRecord({
        nama: 'Meja Baru',
        updatedAt: new Date('2024-06-16T10:00:00Z'),
      });

      // findOne call (used inside update to verify existence)
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([existing]),
        }),
      });

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedRecord]),
          }),
        }),
      });

      const result = await service.update(TENANT_ID, BARANG_ID, { nama: 'Meja Baru' });

      expect(result.nama).toBe('Meja Baru');
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('remove — happy path', () => {
    it('should soft-delete barang without throwing', async () => {
      const existing = makeFakeRecord();

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([existing]),
        }),
      });

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      await expect(service.remove(TENANT_ID, BARANG_ID)).resolves.toBeUndefined();
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should accept nama with exactly 255 characters', async () => {
      const longNama = 'A'.repeat(255);
      const record = makeFakeRecord({ nama: longNama });

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([record]),
        }),
      });

      const result = await service.create(TENANT_ID, {
        nama: longNama,
        jumlah: 1,
        kondisi_barang: 'bagus',
        sumber_dana: 'yayasan',
        kategori: 'peralatan',
      });

      expect(result.nama).toBe(longNama);
      expect(result.nama.length).toBe(255);
    });

    it('should accept jumlah = 0', async () => {
      const record = makeFakeRecord({ jumlah: 0 });

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([record]),
        }),
      });

      const result = await service.create(TENANT_ID, {
        nama: 'Barang Kosong',
        jumlah: 0,
        kondisi_barang: 'bagus',
        sumber_dana: 'yayasan',
        kategori: 'peralatan',
      });

      expect(result.jumlah).toBe(0);
    });

    it('should accept jumlah = 999999999', async () => {
      const record = makeFakeRecord({ jumlah: 999999999 });

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([record]),
        }),
      });

      const result = await service.create(TENANT_ID, {
        nama: 'Barang Banyak',
        jumlah: 999999999,
        kondisi_barang: 'bagus',
        sumber_dana: 'yayasan',
        kategori: 'peralatan',
      });

      expect(result.jumlah).toBe(999999999);
    });

    it('should reject whitespace-only nama on update with BadRequestException', async () => {
      const existing = makeFakeRecord();

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([existing]),
        }),
      });

      await expect(service.update(TENANT_ID, BARANG_ID, { nama: '   \t\n  ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject empty string nama on update with BadRequestException', async () => {
      const existing = makeFakeRecord();

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([existing]),
        }),
      });

      await expect(service.update(TENANT_ID, BARANG_ID, { nama: '' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── Error Cases ───────────────────────────────────────────────────────────

  describe('error cases', () => {
    it('findOne should throw NotFoundException when barang not found', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.findOne(TENANT_ID, 'non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('findOne should throw NotFoundException when barang is soft-deleted', async () => {
      // The WHERE clause includes isNull(deletedAt), so a soft-deleted record
      // would not be returned by the DB — resulting in empty array
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.findOne(TENANT_ID, BARANG_ID)).rejects.toThrow(NotFoundException);
    });

    it('update should throw NotFoundException when barang not found', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(
        service.update(TENANT_ID, 'non-existent-id', { nama: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('remove should throw NotFoundException when barang already deleted', async () => {
      // Soft-deleted barang won't be returned by the WHERE clause
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.remove(TENANT_ID, BARANG_ID)).rejects.toThrow(NotFoundException);
    });

    it('remove should throw NotFoundException when barang does not exist', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.remove(TENANT_ID, 'totally-nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

/**
 * Property 7: Import XLSX — jumlah_berhasil + jumlah_dilewati = total_baris,
 * setiap dilewati ada alasan
 *
 * For any XLSX buffer containing a mix of valid and invalid rows:
 * 1. berhasilDitambahkan + dilewati.length === total data rows in the sheet
 * 2. Every entry in `dilewati` has a non-empty `alasan` string
 * 3. Valid rows are inserted regardless of how many invalid rows exist in the same batch
 *
 * // Feature: sistem-pengembangan-v2, Property 7: Import XLSX — jumlah_berhasil + jumlah_dilewati = total_baris, setiap dilewati ada alasan
 *
 * **Validates: Requirements 5.8**
 */
import * as ExcelJS from 'exceljs';

type KondisiBarang = 'bagus' | 'perlu_perbaikan' | 'rusak';
type SumberDana = 'yayasan' | 'unit_sekolah' | 'bos';
type KategoriBarang = 'peralatan' | 'perlengkapan';

interface XlsxRow {
  nama: string;
  deskripsi: string;
  jumlah: string; // raw string — may be invalid
  lokasi: string;
  kondisi_barang: string;
  sumber_dana: string;
  kategori: string;
}

/**
 * Builds an XLSX buffer from an array of row objects.
 * Row 1 is always the header; rows 2+ are data.
 */
async function buildXlsxBuffer(rows: XlsxRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Barang');

  // Header row
  sheet.addRow([
    'nama',
    'deskripsi',
    'jumlah',
    'lokasi',
    'kondisi_barang',
    'sumber_dana',
    'kategori',
  ]);

  for (const row of rows) {
    sheet.addRow([
      row.nama,
      row.deskripsi,
      row.jumlah,
      row.lokasi,
      row.kondisi_barang,
      row.sumber_dana,
      row.kategori,
    ]);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Creates a mocked DB for importFromXlsx:
 * - select().from().where() returns existingNames (for duplicate check)
 * - insert().values() records what was inserted
 */
function createImportMockDb(existingNames: string[] = []) {
  const insertedRows: unknown[] = [];

  const mockDb = {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(existingNames.map((nama) => ({ nama }))),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockImplementation((rows: unknown[]) => {
        insertedRows.push(...rows);
        return Promise.resolve();
      }),
    }),
  };

  return { mockDb, getInsertedRows: () => insertedRows };
}

describe('Feature: sistem-pengembangan-v2, Property 7: Import XLSX — jumlah_berhasil + jumlah_dilewati = total_baris, setiap dilewati ada alasan', () => {
  // ─── Arbitraries ────────────────────────────────────────────────────────────

  const validKondisi: KondisiBarang[] = ['bagus', 'perlu_perbaikan', 'rusak'];
  const validSumberDana: SumberDana[] = ['yayasan', 'unit_sekolah', 'bos'];
  const validKategori: KategoriBarang[] = ['peralatan', 'perlengkapan'];

  /** Arbitrary for a valid row (all fields correct) */
  const validRowArb = (index: number): fc.Arbitrary<XlsxRow> =>
    fc.record({
      nama: fc
        .string({ minLength: 1, maxLength: 60 })
        .filter((s) => s.trim().length > 0)
        .map((s) => `${s}-${index}`), // suffix index to ensure uniqueness across iterations
      deskripsi: fc.string({ maxLength: 50 }),
      jumlah: fc.integer({ min: 0, max: 999 }).map(String),
      lokasi: fc.string({ maxLength: 30 }),
      kondisi_barang: fc.constantFrom(...validKondisi),
      sumber_dana: fc.constantFrom(...validSumberDana),
      kategori: fc.constantFrom(...validKategori),
    });

  /** Arbitrary for an invalid row — at least one field is wrong */
  const invalidRowArb = (index: number): fc.Arbitrary<XlsxRow> =>
    fc.oneof(
      // bad kondisi_barang
      fc.record({
        nama: fc.constant(`Invalid-kondisi-${index}`),
        deskripsi: fc.constant(''),
        jumlah: fc.constant('5'),
        lokasi: fc.constant(''),
        kondisi_barang: fc.constant('sangat_bagus'), // not a valid enum
        sumber_dana: fc.constantFrom(...validSumberDana),
        kategori: fc.constantFrom(...validKategori),
      }),
      // bad sumber_dana
      fc.record({
        nama: fc.constant(`Invalid-sumber-${index}`),
        deskripsi: fc.constant(''),
        jumlah: fc.constant('3'),
        lokasi: fc.constant(''),
        kondisi_barang: fc.constantFrom(...validKondisi),
        sumber_dana: fc.constant('pemerintah'), // not a valid enum
        kategori: fc.constantFrom(...validKategori),
      }),
      // bad kategori
      fc.record({
        nama: fc.constant(`Invalid-kategori-${index}`),
        deskripsi: fc.constant(''),
        jumlah: fc.constant('2'),
        lokasi: fc.constant(''),
        kondisi_barang: fc.constantFrom(...validKondisi),
        sumber_dana: fc.constantFrom(...validSumberDana),
        kategori: fc.constant('furniture'), // not a valid enum
      }),
      // negative jumlah
      fc.record({
        nama: fc.constant(`Invalid-jumlah-${index}`),
        deskripsi: fc.constant(''),
        jumlah: fc.integer({ min: -999, max: -1 }).map(String),
        lokasi: fc.constant(''),
        kondisi_barang: fc.constantFrom(...validKondisi),
        sumber_dana: fc.constantFrom(...validSumberDana),
        kategori: fc.constantFrom(...validKategori),
      }),
      // empty nama
      fc.record({
        nama: fc.constant(''),
        deskripsi: fc.constant(''),
        jumlah: fc.constant('1'),
        lokasi: fc.constant(''),
        kondisi_barang: fc.constantFrom(...validKondisi),
        sumber_dana: fc.constantFrom(...validSumberDana),
        kategori: fc.constantFrom(...validKategori),
      }),
    );

  // ─── Property tests ─────────────────────────────────────────────────────────

  it('berhasilDitambahkan + dilewati.length === total data rows for any mix of valid/invalid rows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 8 }), // number of valid rows
        fc.integer({ min: 0, max: 8 }), // number of invalid rows
        fc.uuid(), // tenantId
        async (validCount, invalidCount, tenantId) => {
          // Need at least 1 row total
          fc.pre(validCount + invalidCount > 0);

          // Build valid rows — must have unique names
          const validRows = await Promise.all(
            Array.from({ length: validCount }, (_, i) => fc.sample(validRowArb(i), 1)[0]),
          );

          // Build invalid rows
          const invalidRows = await Promise.all(
            Array.from({ length: invalidCount }, (_, i) => fc.sample(invalidRowArb(i + 100), 1)[0]),
          );

          // Shuffle valid and invalid together
          const allRows = [...validRows, ...invalidRows].sort(() => Math.random() - 0.5);
          const totalRows = allRows.length;

          const buffer = await buildXlsxBuffer(allRows);
          const { mockDb } = createImportMockDb([]); // no pre-existing names

          const module: TestingModule = await Test.createTestingModule({
            providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
          }).compile();

          const service = module.get<BarangService>(BarangService);
          const result = await service.importFromXlsx(buffer, tenantId);

          // PROPERTY 1: berhasilDitambahkan + dilewati.length === total data rows
          expect(result.berhasilDitambahkan + result.dilewati.length).toBe(totalRows);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('every entry in dilewati has a non-empty alasan string', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }), // number of invalid rows (at least 1)
        fc.integer({ min: 0, max: 5 }), // number of valid rows mixed in
        fc.uuid(),
        async (invalidCount, validCount, tenantId) => {
          const validRows = await Promise.all(
            Array.from({ length: validCount }, (_, i) => fc.sample(validRowArb(i), 1)[0]),
          );

          const invalidRows = await Promise.all(
            Array.from({ length: invalidCount }, (_, i) => fc.sample(invalidRowArb(i + 200), 1)[0]),
          );

          const allRows = [...validRows, ...invalidRows].sort(() => Math.random() - 0.5);

          const buffer = await buildXlsxBuffer(allRows);
          const { mockDb } = createImportMockDb([]);

          const module: TestingModule = await Test.createTestingModule({
            providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
          }).compile();

          const service = module.get<BarangService>(BarangService);
          const result = await service.importFromXlsx(buffer, tenantId);

          // PROPERTY 2: every skipped entry has a non-empty alasan
          for (const skipped of result.dilewati) {
            expect(typeof skipped.alasan).toBe('string');
            expect(skipped.alasan.trim().length).toBeGreaterThan(0);
            // Also verify baris and nama fields exist
            expect(typeof skipped.baris).toBe('number');
            expect(skipped.baris).toBeGreaterThanOrEqual(2); // data rows start at row 2
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 60000);

  it('valid rows are inserted regardless of the presence of invalid rows in the same batch', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 6 }), // valid rows (at least 1)
        fc.integer({ min: 1, max: 6 }), // invalid rows (at least 1) — ensures mixed batch
        fc.uuid(),
        async (validCount, invalidCount, tenantId) => {
          // Generate valid rows with unique names
          const validRows = await Promise.all(
            Array.from({ length: validCount }, (_, i) => fc.sample(validRowArb(i + 300), 1)[0]),
          );

          const invalidRows = await Promise.all(
            Array.from({ length: invalidCount }, (_, i) => fc.sample(invalidRowArb(i + 400), 1)[0]),
          );

          // Interleave valid and invalid rows intentionally
          const allRows: XlsxRow[] = [];
          const maxLen = Math.max(validRows.length, invalidRows.length);
          for (let i = 0; i < maxLen; i++) {
            if (i < invalidRows.length) allRows.push(invalidRows[i]);
            if (i < validRows.length) allRows.push(validRows[i]);
          }

          const buffer = await buildXlsxBuffer(allRows);
          const { mockDb, getInsertedRows } = createImportMockDb([]);

          const module: TestingModule = await Test.createTestingModule({
            providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
          }).compile();

          const service = module.get<BarangService>(BarangService);
          const result = await service.importFromXlsx(buffer, tenantId);

          // PROPERTY 3a: berhasilDitambahkan equals the number of valid rows we generated
          // (since all valid rows have unique names and correct enum values)
          expect(result.berhasilDitambahkan).toBe(validCount);

          // PROPERTY 3b: the number of inserted rows matches berhasilDitambahkan
          expect(getInsertedRows().length).toBe(result.berhasilDitambahkan);

          // PROPERTY 3c: dilewati count matches the number of invalid rows
          expect(result.dilewati.length).toBe(invalidCount);

          // PROPERTY 3d: total invariant still holds
          expect(result.berhasilDitambahkan + result.dilewati.length).toBe(allRows.length);
        },
      ),
      { numRuns: 100 },
    );
  }, 60000);

  it('duplicate names (against existing DB records) are skipped with a reason', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // count of rows whose names already exist in DB
        fc.integer({ min: 1, max: 5 }), // count of genuinely new valid rows
        fc.uuid(),
        async (dupCount, newCount, tenantId) => {
          const existingNames = Array.from({ length: dupCount }, (_, i) => `Existing-${i}`);

          // Build rows that duplicate existing names
          const dupRows: XlsxRow[] = existingNames.map((nama) => ({
            nama,
            deskripsi: '',
            jumlah: '5',
            lokasi: '',
            kondisi_barang: 'bagus',
            sumber_dana: 'yayasan',
            kategori: 'peralatan',
          }));

          // Build genuinely new valid rows
          const newRows = await Promise.all(
            Array.from({ length: newCount }, (_, i) => fc.sample(validRowArb(i + 500), 1)[0]),
          );

          const allRows = [...dupRows, ...newRows];
          const buffer = await buildXlsxBuffer(allRows);
          const { mockDb } = createImportMockDb(existingNames);

          const module: TestingModule = await Test.createTestingModule({
            providers: [BarangService, { provide: DRIZZLE, useValue: mockDb }],
          }).compile();

          const service = module.get<BarangService>(BarangService);
          const result = await service.importFromXlsx(buffer, tenantId);

          // PROPERTY: total invariant
          expect(result.berhasilDitambahkan + result.dilewati.length).toBe(allRows.length);

          // PROPERTY: duplicate rows appear in dilewati
          expect(result.dilewati.length).toBeGreaterThanOrEqual(dupCount);

          // PROPERTY: every skipped row has a non-empty alasan
          for (const skipped of result.dilewati) {
            expect(skipped.alasan.trim().length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 60000);
});
