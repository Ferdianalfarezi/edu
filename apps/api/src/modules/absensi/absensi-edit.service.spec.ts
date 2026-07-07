import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { Role } from '@edu/shared';
import { AbsensiService } from './absensi.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { JadwalService } from '@/modules/jadwal/jadwal.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';

/**
 * AbsensiService Unit Tests — Edit Attendance (PATCH /absensi/:absensiId)
 *
 * Tests authorization logic and audit log creation for attendance edits.
 *
 * Requirements: 2.1–2.6
 */
describe('AbsensiService - updateAbsensi (Task 8.5)', () => {
  let service: AbsensiService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const guruId = '22222222-2222-2222-2222-222222222222';
  const kepalaSekolahId = '33333333-3333-3333-3333-333333333333';
  const adminId = '44444444-4444-4444-4444-444444444444';
  const absensiId = '55555555-5555-5555-5555-555555555555';
  const kelasId = '66666666-6666-6666-6666-666666666666';

  const mockAbsensiRecord = {
    id: absensiId,
    tenantId,
    siswaId: '77777777-7777-7777-7777-777777777777',
    kelasId,
    tanggal: '2024-10-15',
    status: 'hadir' as const,
    guruId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Track audit log inserts
  let insertedAuditValues: any = null;
  let selectCallIndex: number;

  /**
   * Creates a mock DB that tracks calls and returns different results
   * for each sequential select().from().where() call chain.
   */
  const createMockDb = (opts: {
    absensiRecord?: typeof mockAbsensiRecord | null;
    jadwalExists?: boolean;
    updatedRecord?: any;
  }) => {
    const { absensiRecord = mockAbsensiRecord, jadwalExists = false, updatedRecord } = opts;

    selectCallIndex = 0;
    insertedAuditValues = null;

    const db: any = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation(() => ({
          where: jest.fn().mockImplementation(() => {
            selectCallIndex++;
            if (selectCallIndex === 1) {
              // First select: get absensi record
              return Promise.resolve(absensiRecord ? [absensiRecord] : []);
            }
            // Second select: guru jadwal authorization check (has .limit)
            return {
              limit: jest.fn().mockResolvedValue(jadwalExists ? [{ id: 'jadwal-id' }] : []),
            };
          }),
        })),
      })),
      update: jest.fn().mockImplementation(() => ({
        set: jest.fn().mockImplementation(() => ({
          where: jest.fn().mockImplementation(() => ({
            returning: jest
              .fn()
              .mockResolvedValue(
                updatedRecord
                  ? [updatedRecord]
                  : [{ ...absensiRecord, status: 'changed', updatedAt: new Date() }],
              ),
          })),
        })),
      })),
      insert: jest.fn().mockImplementation(() => ({
        values: jest.fn().mockImplementation((vals: any) => {
          insertedAuditValues = vals;
          return Promise.resolve();
        }),
      })),
    };
    return db;
  };

  const mockKonfigurasiService = {
    getConfigByKey: jest.fn().mockResolvedValue({ value: 10 }),
  };

  const mockJadwalService = {
    isGuruPenggantiForClassOnDate: jest.fn().mockResolvedValue(false),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue(undefined),
  };

  let mockDrizzleService: { db: any };

  beforeEach(async () => {
    mockDrizzleService = { db: createMockDb({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AbsensiService,
        { provide: DrizzleService, useValue: mockDrizzleService },
        { provide: KonfigurasiService, useValue: mockKonfigurasiService },
        { provide: JadwalService, useValue: mockJadwalService },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION), useValue: mockQueue },
        { provide: getQueueToken(QUEUE_NAMES.EXPORT), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<AbsensiService>(AbsensiService);
    jest.clearAllMocks();
  });

  /**
   * Requirement 2.2: Admin CANNOT edit attendance data.
   */
  it('should throw ForbiddenException when admin tries to edit attendance', async () => {
    mockDrizzleService.db = createMockDb({ absensiRecord: mockAbsensiRecord });

    await expect(
      service.updateAbsensi(tenantId, adminId, Role.ADMIN, absensiId, { status: 'izin' }),
    ).rejects.toThrow(ForbiddenException);
  });

  /**
   * Requirement 2.2: The error message should communicate admin restriction.
   */
  it('should have appropriate error message for admin block', async () => {
    mockDrizzleService.db = createMockDb({ absensiRecord: mockAbsensiRecord });

    await expect(
      service.updateAbsensi(tenantId, adminId, Role.ADMIN, absensiId, { status: 'izin' }),
    ).rejects.toThrow('Admin tidak diizinkan mengedit data absensi');
  });

  /**
   * Requirement 2.4: Kepala_sekolah can edit ANY class's attendance (override power).
   * No jadwal check needed for kepala_sekolah.
   */
  it('should allow kepala_sekolah to edit attendance for any class', async () => {
    const updatedRecord = { ...mockAbsensiRecord, status: 'izin', updatedAt: new Date() };
    mockDrizzleService.db = createMockDb({
      absensiRecord: mockAbsensiRecord,
      updatedRecord,
    });

    const result = await service.updateAbsensi(
      tenantId,
      kepalaSekolahId,
      Role.KEPALA_SEKOLAH,
      absensiId,
      { status: 'izin' },
    );

    expect(result.status).toBe('izin');
  });

  /**
   * Requirement 2.1, 2.3: Guru can edit IF they have jadwal (current or past) for the class.
   */
  it('should allow guru with jadwal (current or past) to edit attendance', async () => {
    const updatedRecord = { ...mockAbsensiRecord, status: 'sakit', updatedAt: new Date() };
    mockDrizzleService.db = createMockDb({
      absensiRecord: mockAbsensiRecord,
      jadwalExists: true,
      updatedRecord,
    });

    const result = await service.updateAbsensi(tenantId, guruId, Role.GURU, absensiId, {
      status: 'sakit',
    });

    expect(result.status).toBe('sakit');
  });

  /**
   * Requirement 2.1, 2.3: Guru WITHOUT jadwal for this class is rejected.
   */
  it('should throw ForbiddenException when guru has no jadwal for the class', async () => {
    mockDrizzleService.db = createMockDb({
      absensiRecord: mockAbsensiRecord,
      jadwalExists: false,
    });

    await expect(
      service.updateAbsensi(tenantId, guruId, Role.GURU, absensiId, { status: 'alpa' }),
    ).rejects.toThrow(ForbiddenException);
  });

  /**
   * Test: NotFoundException when absensi record doesn't exist.
   */
  it('should throw NotFoundException when absensi record does not exist', async () => {
    mockDrizzleService.db = createMockDb({ absensiRecord: null });

    await expect(
      service.updateAbsensi(tenantId, kepalaSekolahId, Role.KEPALA_SEKOLAH, absensiId, {
        status: 'alpa',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  /**
   * Requirement 2.5, 2.6: Audit log is written on every edit.
   * Validates: user_id, role, status_sebelum, status_sesudah are recorded.
   */
  it('should write an audit log entry when attendance is edited', async () => {
    const updatedRecord = { ...mockAbsensiRecord, status: 'alpa', updatedAt: new Date() };
    mockDrizzleService.db = createMockDb({
      absensiRecord: mockAbsensiRecord,
      updatedRecord,
    });

    await service.updateAbsensi(tenantId, kepalaSekolahId, Role.KEPALA_SEKOLAH, absensiId, {
      status: 'alpa',
    });

    expect(insertedAuditValues).not.toBeNull();
    expect(insertedAuditValues).toEqual(
      expect.objectContaining({
        absensiId: absensiId,
        userId: kepalaSekolahId,
        role: Role.KEPALA_SEKOLAH,
        statusSebelum: 'hadir',
        statusSesudah: 'alpa',
      }),
    );
  });

  /**
   * No-op: if status is unchanged, return existing record without audit log.
   */
  it('should return existing record without audit log when status is unchanged', async () => {
    mockDrizzleService.db = createMockDb({ absensiRecord: mockAbsensiRecord });

    const result = await service.updateAbsensi(
      tenantId,
      kepalaSekolahId,
      Role.KEPALA_SEKOLAH,
      absensiId,
      { status: 'hadir' }, // Same as current status
    );

    expect(result).toEqual(mockAbsensiRecord);
    expect(insertedAuditValues).toBeNull(); // No audit log written
  });

  /**
   * Requirement 2.2 extension: Bendahara cannot edit attendance.
   */
  it('should throw ForbiddenException for bendahara role', async () => {
    mockDrizzleService.db = createMockDb({ absensiRecord: mockAbsensiRecord });

    await expect(
      service.updateAbsensi(tenantId, 'some-id', Role.BENDAHARA, absensiId, { status: 'izin' }),
    ).rejects.toThrow(ForbiddenException);
  });

  /**
   * Requirement 2.2 extension: Orang_tua cannot edit attendance.
   */
  it('should throw ForbiddenException for orang_tua role', async () => {
    mockDrizzleService.db = createMockDb({ absensiRecord: mockAbsensiRecord });

    await expect(
      service.updateAbsensi(tenantId, 'some-id', Role.ORANG_TUA, absensiId, { status: 'izin' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
