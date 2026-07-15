import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as fc from 'fast-check';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { RaporNilaiService } from '../rapor-nilai.service';
import { RaporFinalizationService } from '../rapor-finalization.service';
import { InputNilaiDto } from '../dto/input-nilai.dto';

/**
 * Preservation Property Tests
 *
 * These tests verify existing CORRECT behaviors that MUST remain unchanged
 * after bug fixes are implemented. They test the "non-bug-condition" paths.
 *
 * ALL tests in this file MUST PASS on the current unfixed code.
 * They establish the preservation baseline.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
 */
describe('Preservation Property Tests', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const guruId = '22222222-2222-2222-2222-222222222222';
  const kelasId = '33333333-3333-3333-3333-333333333333';
  const mapelId = '44444444-4444-4444-4444-444444444444';
  const tahunAjaranId = '99999999-9999-9999-9999-999999999999';
  const raporId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const komponenAngkaId = '66666666-6666-6666-6666-666666666666';

  // UUID v4 generator for fast-check
  const uuidV4Arb = fc.uuid().filter((u) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u);
  });

  // ---------------------------------------------------------------------------
  // Property 2a: UUID validation on kelas_id and mata_pelajaran_id
  // Requirement 3.1
  // ---------------------------------------------------------------------------

  describe('Property 2a: Valid UUID fields continue to be accepted', () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * For all valid UUID fields (kelas_id, mata_pelajaran_id),
     * DTO validation continues to accept them without errors.
     */
    it('should accept valid UUIDs for kelas_id and mata_pelajaran_id without validation errors', async () => {
      await fc.assert(
        fc.asyncProperty(uuidV4Arb, uuidV4Arb, async (kelasUuid, mapelUuid) => {
          const dto = plainToInstance(InputNilaiDto, {
            kelas_id: kelasUuid,
            mata_pelajaran_id: mapelUuid,
            // Use a UUID for periode_rapor_id (current DTO has @IsUUID on this field)
            periode_rapor_id: '11111111-1111-4111-8111-111111111111',
            nilai: [],
            status: 'draft',
          });

          const errors = await validate(dto);
          const kelasErrors = errors.filter((e) => e.property === 'kelas_id');
          const mapelErrors = errors.filter((e) => e.property === 'mata_pelajaran_id');

          expect(kelasErrors).toHaveLength(0);
          expect(mapelErrors).toHaveLength(0);
        }),
        { numRuns: 20 },
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * Non-UUID values for kelas_id and mata_pelajaran_id should be rejected.
     */
    it('should reject non-UUID values for kelas_id and mata_pelajaran_id', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter(
              (s) =>
                !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s),
            ),
          async (invalidValue) => {
            const dto = plainToInstance(InputNilaiDto, {
              kelas_id: invalidValue,
              mata_pelajaran_id: invalidValue,
              periode_rapor_id: '11111111-1111-4111-8111-111111111111',
              nilai: [],
              status: 'draft',
            });

            const errors = await validate(dto);
            const kelasErrors = errors.filter((e) => e.property === 'kelas_id');
            const mapelErrors = errors.filter((e) => e.property === 'mata_pelajaran_id');

            expect(kelasErrors.length).toBeGreaterThan(0);
            expect(mapelErrors.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2b: Successful save returns { saved: N, rapor_id: string }
  // Requirement 3.2
  // ---------------------------------------------------------------------------

  describe('Property 2b: Successful save returns correct shape', () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * For all successful saves with valid data, the result shape is
     * { saved: N, rapor_id: string } where N equals the number of nilai entries.
     */
    it('should return { saved: N, rapor_id: string } for successful saves', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (numStudents) => {
          // Create a fresh service with fresh mocks for each iteration
          const module: TestingModule = await Test.createTestingModule({
            providers: [RaporNilaiService, { provide: DRIZZLE, useValue: {} }],
          }).compile();

          const service = module.get<RaporNilaiService>(RaporNilaiService);

          // Mock validateGuruAssignment to pass
          jest.spyOn(service, 'validateGuruAssignment').mockResolvedValue(undefined);
          // Mock getActiveTahunAjaran
          jest
            .spyOn(service as any, 'getActiveTahunAjaran')
            .mockResolvedValue({ id: tahunAjaranId, nama: '2024/2025' });

          let selectCallCount = 0;
          const createMockQueryBuilder = () => ({
            select: jest.fn().mockImplementation(() => {
              selectCallCount++;
              return {
                from: jest.fn().mockImplementation(() => ({
                  where: jest.fn().mockImplementation(() => {
                    if (selectCallCount === 1) {
                      // Check existing rapor → draft (no deadline)
                      return Promise.resolve([{ id: raporId, status: 'draft', deadline: null }]);
                    }
                    if (selectCallCount === 2) {
                      // komponen_penilaian_mapel query → no per-mapel config
                      return Promise.resolve([]);
                    }
                    if (selectCallCount === 3) {
                      // Get komponen_penilaian (global fallback)
                      return Promise.resolve([
                        {
                          id: komponenAngkaId,
                          tipe: 'angka',
                          skalaMin: 0,
                          skalaMax: 100,
                          isWajib: true,
                        },
                      ]);
                    }
                    if (selectCallCount === 4) {
                      // Existing rapor_nilai for audit → none
                      return Promise.resolve([]);
                    }
                    // Any additional selects
                    return Promise.resolve([]);
                  }),
                })),
              };
            }),
            insert: jest.fn().mockImplementation(() => ({
              values: jest.fn().mockImplementation(() => ({
                onConflictDoUpdate: jest.fn().mockImplementation(() => ({
                  returning: jest.fn().mockResolvedValue([{ id: raporId }]),
                })),
                returning: jest.fn().mockResolvedValue([{ id: raporId }]),
              })),
            })),
            update: jest.fn().mockImplementation(() => ({
              set: jest.fn().mockImplementation(() => ({
                where: jest.fn().mockResolvedValue(undefined),
              })),
            })),
          });

          const mockTx = createMockQueryBuilder();
          const mockDb = {
            ...createMockQueryBuilder(),
            transaction: jest.fn().mockImplementation(async (cb) => cb(mockTx)),
          };
          (service as any).db = mockDb;

          const nilai = Array.from({ length: numStudents }, (_, i) => ({
            siswa_id: `${String(i + 1).padStart(8, '0')}-0000-4000-8000-000000000000`,
            komponen: [{ komponen_id: komponenAngkaId, nilai: 80 }],
            capaian_pembelajaran: 'Baik',
          }));

          const result = await service.saveNilai(tenantId, guruId, {
            kelas_id: kelasId,
            mata_pelajaran_id: mapelId,
            periode_rapor_id: 'uts_semester_1',
            nilai,
            status: 'draft',
          });

          expect(result).toHaveProperty('saved');
          expect(result).toHaveProperty('rapor_id');
          expect(typeof result.saved).toBe('number');
          expect(typeof result.rapor_id).toBe('string');
          expect(result.saved).toBe(numStudents);
        }),
        { numRuns: 5 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2c: Finalized rapor blocks guru edits
  // Requirement 3.4
  // ---------------------------------------------------------------------------

  describe('Property 2c: Finalized rapors block guru edits', () => {
    let service: RaporNilaiService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [RaporNilaiService, { provide: DRIZZLE, useValue: {} }],
      }).compile();

      service = module.get<RaporNilaiService>(RaporNilaiService);

      // Mock validateGuruAssignment to pass
      jest.spyOn(service, 'validateGuruAssignment').mockResolvedValue(undefined);
      // Mock getActiveTahunAjaran
      jest
        .spyOn(service as any, 'getActiveTahunAjaran')
        .mockResolvedValue({ id: tahunAjaranId, nama: '2024/2025' });

      // Mock db: rapor exists with status 'final'
      const mockTx = {
        select: jest.fn().mockImplementation(() => ({
          from: jest.fn().mockImplementation(() => ({
            where: jest.fn().mockResolvedValue([{ id: raporId, status: 'final', deadline: null }]),
          })),
        })),
      };
      const mockDb = {
        transaction: jest.fn().mockImplementation(async (cb) => cb(mockTx)),
      };
      (service as any).db = mockDb;
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * For all finalized rapors, guru edit attempts throw ForbiddenException.
     */
    it('should throw ForbiddenException when guru tries to edit finalized rapor', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'),
          async (periode) => {
            await expect(
              service.saveNilai(tenantId, guruId, {
                kelas_id: kelasId,
                mata_pelajaran_id: mapelId,
                periode_rapor_id: periode,
                nilai: [
                  {
                    siswa_id: '55555555-5555-4555-8555-555555555555',
                    komponen: [{ komponen_id: komponenAngkaId, nilai: 85 }],
                  },
                ],
                status: 'draft',
              }),
            ).rejects.toThrow(ForbiddenException);
          },
        ),
        { numRuns: 4 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2d: Unassigned guru gets ForbiddenException
  // Requirement 3.5
  // ---------------------------------------------------------------------------

  describe('Property 2d: Unassigned guru throws ForbiddenException', () => {
    let service: RaporNilaiService;

    beforeEach(async () => {
      const mockDb = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        limit: jest.fn(),
      };

      let limitCallCount = 0;
      mockDb.limit.mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount % 2 === 1) {
          // Odd calls: getActiveTahunAjaran → returns active TA
          return Promise.resolve([{ id: tahunAjaranId, nama: '2024/2025' }]);
        }
        // Even calls: jadwal query → no assignment found
        return Promise.resolve([]);
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [RaporNilaiService, { provide: DRIZZLE, useValue: mockDb }],
      }).compile();

      service = module.get<RaporNilaiService>(RaporNilaiService);
    });

    /**
     * **Validates: Requirements 3.5**
     *
     * For all unassigned guru+mapel+kelas combinations, access throws ForbiddenException.
     */
    it('should throw ForbiddenException for unassigned guru', async () => {
      await fc.assert(
        fc.asyncProperty(uuidV4Arb, uuidV4Arb, async (randomKelasId, randomMapelId) => {
          await expect(
            service.validateGuruAssignment(tenantId, guruId, randomKelasId, randomMapelId),
          ).rejects.toThrow(ForbiddenException);
        }),
        { numRuns: 10 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2e: Angka values outside skala_min-skala_max rejected
  // Requirement 3.7
  // ---------------------------------------------------------------------------

  describe('Property 2e: Out-of-range angka values throw BadRequestException', () => {
    let service: RaporNilaiService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [RaporNilaiService, { provide: DRIZZLE, useValue: {} }],
      }).compile();

      service = module.get<RaporNilaiService>(RaporNilaiService);
    });

    /**
     * **Validates: Requirements 3.7**
     *
     * For all angka values where val > skala_max, throws BadRequestException.
     */
    it('should throw BadRequestException for angka values above skala_max', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 100 }), // skala_max
          fc.integer({ min: 1, max: 500 }), // offset above max
          async (skalaMax, offset) => {
            const value = skalaMax + offset;

            const komponenMap = new Map<string, any>([
              [
                komponenAngkaId,
                { id: komponenAngkaId, tipe: 'angka', skalaMin: 0, skalaMax, isWajib: true },
              ],
            ]);

            const entry = {
              siswa_id: '55555555-5555-4555-8555-555555555555',
              komponen: [{ komponen_id: komponenAngkaId, nilai: value }],
            };

            expect(() =>
              (service as any).validateNilaiEntry(entry, komponenMap, true, 'draft'),
            ).toThrow(BadRequestException);
          },
        ),
        { numRuns: 20 },
      );
    });

    /**
     * **Validates: Requirements 3.7**
     *
     * For all angka values where val < skala_min, throws BadRequestException.
     */
    it('should throw BadRequestException for angka values below skala_min', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }), // skala_min (>= 1 so there's room below)
          async (skalaMin) => {
            const value = skalaMin - 1;

            const komponenMap = new Map<string, any>([
              [
                komponenAngkaId,
                { id: komponenAngkaId, tipe: 'angka', skalaMin, skalaMax: 100, isWajib: true },
              ],
            ]);

            const entry = {
              siswa_id: '55555555-5555-4555-8555-555555555555',
              komponen: [{ komponen_id: komponenAngkaId, nilai: value }],
            };

            expect(() =>
              (service as any).validateNilaiEntry(entry, komponenMap, true, 'draft'),
            ).toThrow(BadRequestException);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2f: Invalid periode strings rejected
  // Requirement 3.8
  // ---------------------------------------------------------------------------

  describe('Property 2f: Invalid periode strings throw BadRequestException', () => {
    let service: RaporNilaiService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [RaporNilaiService, { provide: DRIZZLE, useValue: {} }],
      }).compile();

      service = module.get<RaporNilaiService>(RaporNilaiService);

      // Mock validateGuruAssignment to pass
      jest.spyOn(service, 'validateGuruAssignment').mockResolvedValue(undefined);
      // Mock getActiveTahunAjaran
      jest
        .spyOn(service as any, 'getActiveTahunAjaran')
        .mockResolvedValue({ id: tahunAjaranId, nama: '2024/2025' });
    });

    /**
     * **Validates: Requirements 3.8**
     *
     * For all invalid periode strings (not in enum), throws BadRequestException.
     */
    it('should throw BadRequestException for invalid periode strings', async () => {
      const validPeriods = ['uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'];

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !validPeriods.includes(s)),
          async (invalidPeriode) => {
            await expect(
              service.saveNilai(tenantId, guruId, {
                kelas_id: kelasId,
                mata_pelajaran_id: mapelId,
                periode_rapor_id: invalidPeriode,
                nilai: [],
                status: 'draft',
              }),
            ).rejects.toThrow(BadRequestException);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2g: Non-wali users can't finalize/revert
  // Requirement 3.9
  // ---------------------------------------------------------------------------

  describe('Property 2g: Non-wali users cannot finalize/revert', () => {
    let finalizationService: RaporFinalizationService;
    const actualWaliId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    beforeEach(async () => {
      const mockDb = {
        select: jest.fn().mockImplementation(() => ({
          from: jest.fn().mockImplementation(() => ({
            where: jest.fn().mockResolvedValue([{ id: kelasId, waliKelasId: actualWaliId }]),
          })),
        })),
      };

      const mockNotificationQueue = { add: jest.fn() };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RaporFinalizationService,
          { provide: DRIZZLE, useValue: mockDb },
          { provide: 'BullQueue_notification', useValue: mockNotificationQueue },
        ],
      }).compile();

      finalizationService = module.get<RaporFinalizationService>(RaporFinalizationService);
    });

    /**
     * **Validates: Requirements 3.9**
     *
     * For all non-wali users, finalize/revert throws ForbiddenException.
     */
    it('should throw ForbiddenException when non-wali attempts validateWaliKelas', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidV4Arb.filter((id) => id !== actualWaliId),
          async (nonWaliUserId) => {
            await expect(
              finalizationService.validateWaliKelas(tenantId, nonWaliUserId, kelasId),
            ).rejects.toThrow(ForbiddenException);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2h: Revert on already-draft rapor rejected
  // Requirement 3.10
  // ---------------------------------------------------------------------------

  describe('Property 2h: Revert on already-draft rapor throws BadRequestException', () => {
    const waliKelasId = '22222222-2222-2222-2222-222222222222';

    /**
     * **Validates: Requirements 3.10**
     *
     * For all already-draft rapors, revert throws BadRequestException
     * with message "Rapor sudah dalam status draft".
     */
    it('should throw BadRequestException when reverting an already-draft rapor', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'),
          async (periode) => {
            // Create fresh mocks for each iteration to avoid counter pollution
            let selectCallCount = 0;
            const mockDb = {
              select: jest.fn().mockImplementation(() => {
                selectCallCount++;
                return {
                  from: jest.fn().mockImplementation(() => ({
                    where: jest.fn().mockImplementation(() => {
                      if (selectCallCount === 1) {
                        // validateWaliKelas → kelas query: user IS wali
                        return Promise.resolve([{ id: kelasId, waliKelasId: waliKelasId }]);
                      }
                      if (selectCallCount === 2) {
                        // getActiveTahunAjaran
                        return {
                          limit: jest
                            .fn()
                            .mockResolvedValue([{ id: tahunAjaranId, nama: '2024/2025' }]),
                        };
                      }
                      if (selectCallCount === 3) {
                        // Find rapor → status is 'draft'
                        return Promise.resolve([{ id: raporId, status: 'draft' }]);
                      }
                      return Promise.resolve([]);
                    }),
                  })),
                };
              }),
            };

            const mockNotificationQueue = { add: jest.fn() };

            const module: TestingModule = await Test.createTestingModule({
              providers: [
                RaporFinalizationService,
                { provide: DRIZZLE, useValue: mockDb },
                { provide: 'BullQueue_notification', useValue: mockNotificationQueue },
              ],
            }).compile();

            const finalizationService =
              module.get<RaporFinalizationService>(RaporFinalizationService);

            await expect(
              finalizationService.revertRapor(tenantId, waliKelasId, kelasId, periode),
            ).rejects.toThrow(BadRequestException);
          },
        ),
        { numRuns: 4 },
      );
    });
  });
});
