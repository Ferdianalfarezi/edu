import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as fc from 'fast-check';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { RaporNilaiService } from '../rapor-nilai.service';
import { RaporFinalizationService } from '../rapor-finalization.service';
import { RaporWaliService } from '../rapor-wali.service';
import { InputNilaiDto } from '../dto/input-nilai.dto';
import { SaveCatatanDto } from '../dto/save-catatan.dto';

/**
 * Bug Condition Exploration Tests
 *
 * These tests encode the EXPECTED (correct) behavior for the 14 documented bugs.
 * They MUST FAIL on the current unfixed code — failure confirms the bugs exist.
 *
 * DO NOT fix the code or these tests when they fail.
 * The failures are the proof that the bugs are real.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14
 */
describe('Bug Condition Exploration Tests', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const guruId = '22222222-2222-2222-2222-222222222222';
  const kelasId = '33333333-3333-3333-3333-333333333333';
  const mapelId = '44444444-4444-4444-4444-444444444444';
  const tahunAjaranId = '99999999-9999-9999-9999-999999999999';
  const raporId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  const generateSiswaId = (i: number) =>
    `${String(i).padStart(8, '5')}5-5555-5555-5555-555555555555`;

  const komponenAngkaId = '66666666-6666-6666-6666-666666666666';
  const komponenHurufId = '77777777-7777-7777-7777-777777777777';

  // ═══════════════════════════════════════════════════════════════════
  // Property 1a: DTO should accept valid periode enum strings
  // Bug 1.1 — @IsUUID('4') on periode_rapor_id rejects valid enum strings
  // ═══════════════════════════════════════════════════════════════════

  describe('Property 1a: DTO accepts valid periode_rapor_id enum strings', () => {
    /**
     * **Validates: Requirements 1.1**
     *
     * The InputNilaiDto should accept valid periode enum values like "uts_semester_1".
     * Currently fails because @IsUUID('4') rejects non-UUID strings.
     */
    it('should accept all valid periode_rapor_id enum values without validation errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'),
          async (periodeValue) => {
            const dto = plainToInstance(InputNilaiDto, {
              kelas_id: kelasId,
              mata_pelajaran_id: mapelId,
              periode_rapor_id: periodeValue,
              nilai: [],
              status: 'draft',
            });

            const errors = await validate(dto);
            // Filter errors to only those on periode_rapor_id
            const periodeErrors = errors.filter((e) => e.property === 'periode_rapor_id');

            // Expected: no validation errors on periode_rapor_id
            // Bug: @IsUUID('4') causes validation error for enum strings
            expect(periodeErrors).toHaveLength(0);
          },
        ),
        { numRuns: 4 }, // exactly 4 enum values to test
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Property 1b: Transaction atomicity — partial failure = 0 persisted
  // Bug 1.2 — Missing transaction causes partial saves
  // ═══════════════════════════════════════════════════════════════════

  describe('Property 1b: saveNilai atomicity on mid-loop failure', () => {
    /**
     * **Validates: Requirements 1.2**
     *
     * saveNilai should wrap all DB operations in a transaction so that if any
     * student's insert/update fails, ALL changes are rolled back (0 records persisted).
     * Currently, saveNilai has a for-loop with individual INSERT/UPDATE per student
     * without any transaction wrapper, so first K-1 students are persisted before
     * the error at student K.
     *
     * We verify this by inspecting the source code for transaction usage.
     */
    it('should use a database transaction for atomic multi-student saves', () => {
      const sourceCode = RaporNilaiService.prototype.saveNilai.toString();

      // Expected: the saveNilai method should use db.transaction() wrapper
      // Bug: no transaction exists — it's a plain for-loop with individual queries
      const usesTransaction =
        sourceCode.includes('.transaction(') || sourceCode.includes('transaction(async');

      expect(usesTransaction).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Property 1c: Query param alignment — controller reads periode_id
  // Bug 1.3 — Controller reads @Query('periode_rapor_id') but frontend sends periode_id
  // ═══════════════════════════════════════════════════════════════════

  describe('Property 1c: GET /rapor/nilai reads periode_id query param', () => {
    /**
     * **Validates: Requirements 1.3**
     *
     * The controller's getNilai method should read 'periode_id' from query params
     * (matching what the frontend sends). Currently reads 'periode_rapor_id' causing
     * the periodeId variable to be undefined when frontend sends 'periode_id'.
     *
     * We verify the fix by inspecting the controller source for the correct query param name.
     */
    it('should read periode_id param correctly (not periode_rapor_id)', () => {
      // We need to import the controller to read its source code
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { RaporController } = require('../rapor.controller');

      // Examine the getNilai method source for the query parameter it reads
      const sourceCode = RaporController.prototype.getNilai.toString();

      // The frontend sends ?periode_id=uts_semester_1
      // Expected: controller should use @Query('periode_id')
      // Bug: controller uses @Query('periode_rapor_id') which doesn't match frontend

      // Check that the parameter metadata references 'periode_id', not 'periode_rapor_id'
      // Since decorators are compiled away, we verify via Reflect metadata
      const paramMetadata = Reflect.getMetadata('__routeArguments__', RaporController, 'getNilai');

      // paramMetadata is an object where keys are param indices and values contain
      // { index, data, pipes } — 'data' is the query param name
      const queryParams = Object.values(paramMetadata || {}) as any[];
      const periodeParam = queryParams.find(
        (p: any) => p.data === 'periode_id' || p.data === 'periode_rapor_id',
      );

      // Expected: the param should be 'periode_id' (matching frontend)
      // Bug: it would be 'periode_rapor_id' (mismatched)
      expect(periodeParam).toBeDefined();
      expect(periodeParam.data).toBe('periode_id');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Property 1d: saveCatatan should actually persist data to DB
  // Bug 1.11 — saveCatatan returns success without writing to DB
  // ═══════════════════════════════════════════════════════════════════

  describe('Property 1d: saveCatatan persists data to DB', () => {
    let waliService: RaporWaliService;
    let dbUpdateCalls: any[];

    beforeEach(async () => {
      dbUpdateCalls = [];

      const mockFinalizationService = {
        validateWaliKelas: jest.fn().mockResolvedValue(undefined),
      };

      let selectCallCount = 0;
      const mockDb = {
        select: jest.fn().mockImplementation(() => {
          selectCallCount++;
          const currentCall = selectCallCount;
          return {
            from: jest.fn().mockImplementation(() => {
              return {
                where: jest.fn().mockImplementation(() => {
                  // Odd calls: tahunAjaran query (needs .limit)
                  if (currentCall % 2 === 1) {
                    return {
                      limit: jest.fn().mockResolvedValue([{ id: tahunAjaranId }]),
                    };
                  }
                  // Even calls: rapor records (returns array directly)
                  return Promise.resolve([{ id: raporId, status: 'draft' }]);
                }),
              };
            }),
          };
        }),
        update: jest.fn().mockImplementation(() => {
          const call = { table: null, data: null, condition: null };
          dbUpdateCalls.push(call);
          return {
            set: jest.fn().mockImplementation((data: any) => {
              call.data = data;
              return {
                where: jest.fn().mockImplementation((cond: any) => {
                  call.condition = cond;
                  return Promise.resolve();
                }),
              };
            }),
          };
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RaporWaliService,
          { provide: DRIZZLE, useValue: mockDb },
          { provide: RaporFinalizationService, useValue: mockFinalizationService },
        ],
      }).compile();

      waliService = module.get<RaporWaliService>(RaporWaliService);
    });

    /**
     * **Validates: Requirements 1.11**
     *
     * saveCatatan should write catatan data to the database. Currently it only
     * returns { saved: N } without performing any DB writes.
     */
    it('should perform DB update calls when saving catatan', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (numStudents) => {
          dbUpdateCalls = [];

          const catatan = Array.from({ length: numStudents }, (_, i) => ({
            siswa_id: generateSiswaId(i),
            catatan: `Catatan untuk siswa ${i}`,
          }));

          const dto = {
            kelas_id: kelasId,
            periode_rapor_id: 'uts_semester_1',
            catatan,
          } as SaveCatatanDto;

          await waliService.saveCatatan(tenantId, guruId, dto);

          // Expected: at least one DB update call per student's catatan
          // Bug: saveCatatan returns { saved: N } without any DB writes
          expect(dbUpdateCalls.length).toBeGreaterThan(0);
        }),
        { numRuns: 5 },
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Property 1e: calculateRankings includes huruf komponen in rata-rata
  // Bug 1.12 — Only angka komponen counted, huruf skipped
  // ═══════════════════════════════════════════════════════════════════

  describe('Property 1e: calculateRankings includes huruf grades', () => {
    let finalizationService: RaporFinalizationService;

    beforeEach(async () => {
      const siswaId1 = generateSiswaId(0);

      // Mock DB that returns students with huruf grades
      const mockDb = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockImplementation(() => {
          return Promise.resolve([]);
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      // Configure select responses based on table
      let selectCallCount = 0;
      mockDb.select.mockImplementation(() => {
        selectCallCount++;
        return {
          from: jest.fn().mockImplementation(() => {
            return {
              where: jest.fn().mockImplementation(() => {
                // Call 1: rapor_nilai rows
                if (selectCallCount === 1) {
                  return Promise.resolve([
                    {
                      siswaId: siswaId1,
                      komponenNilai: [
                        { komponen_id: komponenAngkaId, nilai: 80 },
                        { komponen_id: komponenHurufId, nilai: 'A' }, // Huruf should count as 4
                      ],
                    },
                  ]);
                }
                // Call 2: komponen_penilaian definitions
                if (selectCallCount === 2) {
                  return Promise.resolve([
                    { id: komponenAngkaId, tipe: 'angka' },
                    { id: komponenHurufId, tipe: 'huruf' },
                  ]);
                }
                // Call 3: active students
                return Promise.resolve([{ id: siswaId1, nama: 'Student 1' }]);
              }),
            };
          }),
        };
      });

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
     * **Validates: Requirements 1.12**
     *
     * calculateRankings should convert huruf grades (A=4, B=3, C=2, D=1, E=0) to
     * numeric values and include them in the rata-rata calculation.
     * Currently, only komponen with tipe === 'angka' are counted; huruf is ignored.
     *
     * For a student with angka=80 and huruf=A(4), expected rata-rata = (80+4)/2 = 42.
     * Bug: rata-rata = 80/1 = 80 (huruf is skipped entirely).
     */
    it('should include huruf komponen (A=4) in rata-rata calculation', async () => {
      const rankings = await finalizationService.calculateRankings(tenantId, raporId, kelasId);

      // If huruf is included: (80 + 4) / 2 = 42
      // If huruf is excluded (bug): 80 / 1 = 80
      expect(rankings.length).toBeGreaterThan(0);

      const studentRanking = rankings[0];
      // rata-rata should NOT be 80 (which means huruf was excluded)
      // It should be 42 (both angka and huruf counted)
      expect(studentRanking.rata_rata).not.toBe(80);
      expect(studentRanking.rata_rata).toBe(42);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Property 1f: Concurrent finalize — exactly one success
  // Bug 1.6 — No locking, both concurrent requests succeed
  // ═══════════════════════════════════════════════════════════════════

  describe('Property 1f: Concurrent finalize requests — exactly one succeeds', () => {
    /**
     * **Validates: Requirements 1.6**
     *
     * Two concurrent finalize requests on the same rapor should result in exactly
     * one success and one error. Currently both succeed because there's no
     * transaction/locking (SELECT FOR UPDATE).
     *
     * We test this by examining the code: finalizeRapor does NOT use db.transaction()
     * or SELECT ... FOR UPDATE, so concurrent requests both read status='draft' and
     * both proceed to finalize.
     */
    it('should use transaction with locking to prevent concurrent finalization', () => {
      // Read the source code of finalizeRapor to check for transaction usage
      const sourceCode = RaporFinalizationService.prototype.finalizeRapor.toString();

      // Expected: the method should use transaction/locking
      // Bug: no transaction or FOR UPDATE lock exists
      const usesTransaction =
        sourceCode.includes('transaction') || sourceCode.includes('FOR UPDATE');

      expect(usesTransaction).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Property 1g: saveNilai rejects requests after deadline
  // Bug 1.13 — No deadline check exists
  // ═══════════════════════════════════════════════════════════════════

  describe('Property 1g: saveNilai rejects after deadline', () => {
    /**
     * **Validates: Requirements 1.13**
     *
     * saveNilai should check if a deadline exists on the rapor record and reject
     * requests after the deadline has passed. Currently no deadline check exists
     * anywhere in the code.
     */
    it('should check deadline in saveNilai logic', () => {
      // Examine the saveNilai source to verify deadline checking
      const sourceCode = RaporNilaiService.prototype.saveNilai.toString();

      // Expected: saveNilai should reference 'deadline' somewhere
      // Bug: no deadline check exists in the code
      const checksDeadline = sourceCode.includes('deadline') || sourceCode.includes('batas waktu');

      expect(checksDeadline).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Property 1h: Submit rejects incomplete student data
  // Bug 1.9 — Only validates format, not completeness
  // ═══════════════════════════════════════════════════════════════════

  describe('Property 1h: Submit with incomplete student data rejected', () => {
    let service: RaporNilaiService;

    beforeEach(async () => {
      // Mock DB with 5 active students but only 3 provided in the save request
      const activeStudents = Array.from({ length: 5 }, (_, i) => ({
        id: generateSiswaId(i),
        nama: `Student ${i}`,
      }));

      const mockDb = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
        innerJoin: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: raporId }]),
          }),
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      // Track different select calls
      let selectCall = 0;
      mockDb.select.mockImplementation(() => {
        selectCall++;
        return {
          from: jest.fn().mockImplementation(() => {
            return {
              where: jest.fn().mockImplementation(() => {
                // Different responses based on what's being queried
                if (selectCall <= 2) {
                  // validateGuruAssignment + getActiveTahunAjaran
                  return { limit: jest.fn().mockResolvedValue([{ id: tahunAjaranId }]) };
                }
                // Active students query
                return { orderBy: jest.fn().mockResolvedValue(activeStudents) };
              }),
              innerJoin: jest.fn().mockReturnThis(),
              limit: jest.fn().mockResolvedValue([{ id: tahunAjaranId }]),
              orderBy: jest.fn().mockResolvedValue(activeStudents),
            };
          }),
        };
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [RaporNilaiService, { provide: DRIZZLE, useValue: mockDb }],
      }).compile();

      service = module.get<RaporNilaiService>(RaporNilaiService);
    });

    /**
     * **Validates: Requirements 1.9**
     *
     * When status='submitted', saveNilai should verify ALL active students have
     * grade entries with all wajib komponen filled. Currently it only validates
     * the format of provided entries, not completeness.
     */
    it('should reject submit when not all active students have data', () => {
      // Check if saveNilai source code includes any completeness validation
      const sourceCode = RaporNilaiService.prototype.saveNilai.toString();

      // Expected: saveNilai should check that all active students are in dto.nilai
      // when status === 'submitted'
      const checksCompleteness =
        sourceCode.includes('activeStudent') ||
        sourceCode.includes('allStudents') ||
        sourceCode.includes('completeness') ||
        sourceCode.includes('missing');

      // Bug: no completeness check exists
      expect(checksCompleteness).toBe(true);
    });
  });
});
