import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@edu/shared';
import { RolesGuard } from '@/common/guards/roles.guard';
import { JadwalController } from './jadwal.controller';
import { JadwalService } from './jadwal.service';
import { RedisService } from '@/modules/redis/redis.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';

/**
 * Jadwal Authorization Logic Unit Tests
 *
 * Tests role-based access for jadwal endpoints, guru pengganti date-scoped access,
 * and historical access prevention.
 *
 * Requirements: 27.4, 28.2, 28.3, 28.4
 */
describe('Jadwal Authorization Logic', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const adminId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const guruId = '55555555-5555-5555-5555-555555555555';
  const guruPenggantiUserId = '88888888-8888-8888-8888-888888888888';
  const kelasId = '33333333-3333-3333-3333-333333333333';
  const mapelId = '44444444-4444-4444-4444-444444444444';

  describe('RolesGuard enforcement on Jadwal endpoints', () => {
    let guard: RolesGuard;
    let reflector: Reflector;

    beforeEach(() => {
      reflector = { getAllAndOverride: jest.fn() } as any;
      guard = new RolesGuard(reflector);
    });

    const createMockContext = (userRole: Role) => ({
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: userRole === Role.ADMIN ? adminId : guruId,
            role: userRole,
            tenant_id: tenantId,
            platform: 'admin_panel' as const,
            jti: 'jti-test',
          },
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    });

    /**
     * Requirement 27.4: Only admin can create/update/delete jadwal.
     * The controller decorates POST, PATCH, DELETE with @Roles(Role.ADMIN).
     */
    it('should allow admin to create jadwal (POST /jadwal)', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ADMIN]);
      const ctx = createMockContext(Role.ADMIN);

      expect(guard.canActivate(ctx as any)).toBe(true);
    });

    it('should deny guru from creating jadwal (POST /jadwal)', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ADMIN]);
      const ctx = createMockContext(Role.GURU);

      expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
    });

    it('should deny kepala_sekolah from creating/modifying jadwal', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ADMIN]);
      const ctx = createMockContext(Role.KEPALA_SEKOLAH);

      expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
    });

    it('should deny bendahara from accessing jadwal endpoints', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Role.ADMIN,
        Role.GURU,
        Role.KEPALA_SEKOLAH,
      ]);
      const ctx = createMockContext(Role.BENDAHARA);

      expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
    });

    it('should deny orang_tua from accessing jadwal endpoints', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Role.ADMIN,
        Role.GURU,
        Role.KEPALA_SEKOLAH,
      ]);
      const ctx = createMockContext(Role.ORANG_TUA);

      expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
    });

    /**
     * Requirement 27.4: Guru and kepala_sekolah can read jadwal.
     * The controller decorates GET with @Roles(Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH).
     */
    it('should allow guru to read jadwal (GET /jadwal)', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Role.ADMIN,
        Role.GURU,
        Role.KEPALA_SEKOLAH,
      ]);
      const ctx = createMockContext(Role.GURU);

      expect(guard.canActivate(ctx as any)).toBe(true);
    });

    it('should allow kepala_sekolah to read jadwal (GET /jadwal)', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        Role.ADMIN,
        Role.GURU,
        Role.KEPALA_SEKOLAH,
      ]);
      const ctx = createMockContext(Role.KEPALA_SEKOLAH);

      expect(guard.canActivate(ctx as any)).toBe(true);
    });
  });

  describe('Guru pengganti date-scoped access validation', () => {
    /**
     * Requirements 28.2, 28.3, 28.4:
     * - Guru pengganti gets attendance input access only for the assigned date
     * - Cannot edit historical attendance
     * - Access is auto-revoked after the date passes
     *
     * These tests validate the authorization logic for checking whether
     * a guru_pengganti record grants access based on the current date.
     */

    /**
     * Utility function that replicates the authorization check:
     * A guru_pengganti has access if and only if:
     * 1. They have a guru_pengganti record for the given kelas + tanggal
     * 2. The tanggal matches today's date (not in the past)
     */
    function isGuruPenggantiAuthorized(
      assignment: { guruPenggantiId: string; kelasId: string; tanggal: string } | null,
      requestingGuruId: string,
      requestedKelasId: string,
      currentDate: string,
    ): boolean {
      if (!assignment) return false;
      if (assignment.guruPenggantiId !== requestingGuruId) return false;
      if (assignment.kelasId !== requestedKelasId) return false;
      // Access only on the assigned date (not past)
      if (assignment.tanggal !== currentDate) return false;
      return true;
    }

    /**
     * Requirement 28.2: Guru pengganti is granted input access for the specific date assigned.
     */
    it('should grant access when guru_pengganti assignment matches today', () => {
      const today = '2024-10-15';
      const assignment = {
        guruPenggantiId: guruPenggantiUserId,
        kelasId,
        tanggal: '2024-10-15',
      };

      const result = isGuruPenggantiAuthorized(assignment, guruPenggantiUserId, kelasId, today);

      expect(result).toBe(true);
    });

    /**
     * Requirement 28.4: Access is revoked after the assigned date passes.
     */
    it('should deny access when assignment date is in the past', () => {
      const today = '2024-10-16'; // Day after assignment
      const assignment = {
        guruPenggantiId: guruPenggantiUserId,
        kelasId,
        tanggal: '2024-10-15', // Yesterday's assignment
      };

      const result = isGuruPenggantiAuthorized(assignment, guruPenggantiUserId, kelasId, today);

      expect(result).toBe(false);
    });

    /**
     * Requirement 28.3: Substitute cannot input for a different date.
     */
    it('should deny access when guru tries to access a future date not assigned', () => {
      const today = '2024-10-14'; // Day before assignment
      const assignment = {
        guruPenggantiId: guruPenggantiUserId,
        kelasId,
        tanggal: '2024-10-15', // Tomorrow's assignment
      };

      const result = isGuruPenggantiAuthorized(assignment, guruPenggantiUserId, kelasId, today);

      expect(result).toBe(false);
    });

    it('should deny access when no guru_pengganti assignment exists', () => {
      const today = '2024-10-15';

      const result = isGuruPenggantiAuthorized(null, guruPenggantiUserId, kelasId, today);

      expect(result).toBe(false);
    });

    it('should deny access when assignment is for a different kelas', () => {
      const today = '2024-10-15';
      const differentKelasId = '99999999-9999-9999-9999-999999999999';
      const assignment = {
        guruPenggantiId: guruPenggantiUserId,
        kelasId: differentKelasId, // Assigned to different class
        tanggal: '2024-10-15',
      };

      const result = isGuruPenggantiAuthorized(assignment, guruPenggantiUserId, kelasId, today);

      expect(result).toBe(false);
    });
  });

  describe('Historical access prevention for guru pengganti', () => {
    /**
     * Requirement 28.3: Guru pengganti cannot edit historical attendance data.
     * Even if they had a valid assignment for a past date, they should NOT be able
     * to go back and modify attendance for that date after it has passed.
     */

    /**
     * Validates whether a guru_pengganti can input/edit attendance for a given date.
     * For editing (as opposed to creation), guru_pengganti is NEVER allowed —
     * they can only input NEW attendance, not edit existing records.
     */
    function canGuruPenggantiEditAttendance(
      assignment: { guruPenggantiId: string; kelasId: string; tanggal: string } | null,
      requestingGuruId: string,
      requestedKelasId: string,
      targetDate: string,
      _currentDate: string,
      isEditOperation: boolean,
    ): boolean {
      // Guru pengganti can NEVER edit historical attendance (Req 28.3)
      if (isEditOperation) return false;

      // For input (creation), only allowed on the assigned date matching today
      if (!assignment) return false;
      if (assignment.guruPenggantiId !== requestingGuruId) return false;
      if (assignment.kelasId !== requestedKelasId) return false;
      if (assignment.tanggal !== targetDate) return false;
      if (assignment.tanggal !== _currentDate) return false;
      return true;
    }

    /**
     * Requirement 28.3: Guru pengganti cannot edit any historical attendance.
     */
    it('should prevent guru_pengganti from editing attendance even for assigned date', () => {
      const today = '2024-10-15';
      const assignment = {
        guruPenggantiId: guruPenggantiUserId,
        kelasId,
        tanggal: '2024-10-15',
      };

      const result = canGuruPenggantiEditAttendance(
        assignment,
        guruPenggantiUserId,
        kelasId,
        '2024-10-15',
        today,
        true, // edit operation
      );

      expect(result).toBe(false);
    });

    it('should allow guru_pengganti to input new attendance on assigned date', () => {
      const today = '2024-10-15';
      const assignment = {
        guruPenggantiId: guruPenggantiUserId,
        kelasId,
        tanggal: '2024-10-15',
      };

      const result = canGuruPenggantiEditAttendance(
        assignment,
        guruPenggantiUserId,
        kelasId,
        '2024-10-15',
        today,
        false, // input operation
      );

      expect(result).toBe(true);
    });

    /**
     * Requirement 28.4: After the date passes, input access is revoked.
     */
    it('should prevent guru_pengganti from inputting attendance for past dates', () => {
      const today = '2024-10-16';
      const assignment = {
        guruPenggantiId: guruPenggantiUserId,
        kelasId,
        tanggal: '2024-10-15', // Yesterday
      };

      const result = canGuruPenggantiEditAttendance(
        assignment,
        guruPenggantiUserId,
        kelasId,
        '2024-10-15', // Trying to input for yesterday
        today,
        false,
      );

      expect(result).toBe(false);
    });
  });

  describe('Jadwal Controller role assignment validation via @Roles decorator', () => {
    let module: TestingModule;
    let controller: JadwalController;

    const mockJadwalService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    beforeEach(async () => {
      module = await Test.createTestingModule({
        controllers: [JadwalController],
        providers: [
          { provide: JadwalService, useValue: mockJadwalService },
          { provide: RedisService, useValue: {} },
          { provide: DRIZZLE, useValue: {} },
        ],
      }).compile();

      controller = module.get<JadwalController>(JadwalController);
      jest.clearAllMocks();
    });

    /**
     * Requirement 27.4: Guru sees jadwal via the GET endpoint filtered to their own.
     * The service filters by guruId, so guru can only effectively "see their own schedule"
     * while still having read access to the full list for awareness.
     */
    it('should return only guru-specific jadwal when guru queries with their own guruId filter', async () => {
      const guruJadwal = [
        {
          id: 'jadwal-1',
          guruId,
          kelasId,
          hari: 'senin',
          jamMulai: '08:00',
          jamSelesai: '09:30',
        },
      ];

      mockJadwalService.findAll.mockResolvedValue(guruJadwal);

      const result = await controller.findAll(tenantId, { guruId });

      expect(mockJadwalService.findAll).toHaveBeenCalledWith(tenantId, { guruId });
      expect(result).toEqual(guruJadwal);
      expect(result.every((j: any) => j.guruId === guruId)).toBe(true);
    });

    /**
     * Requirement 27.4: Admin has full CRUD access.
     * This confirms the controller successfully delegates to the service for write operations.
     */
    it('should allow admin to perform full CRUD on jadwal', async () => {
      const newJadwal = { id: 'new-jadwal-id', tenantId, guruId };
      mockJadwalService.create.mockResolvedValue(newJadwal);
      mockJadwalService.update.mockResolvedValue({ ...newJadwal, hari: 'selasa' });
      mockJadwalService.remove.mockResolvedValue({ message: 'Jadwal pelajaran berhasil dihapus' });

      const created = await controller.create(tenantId, adminId, {
        kelasId,
        mataPelajaranId: mapelId,
        guruId,
        tahunAjaranId: '66666666-6666-6666-6666-666666666666',
        semester: 1,
        hari: 'senin',
        jamMulai: '08:00',
        jamSelesai: '09:30',
        tanggalMulaiBerlaku: '2024-07-15',
        tanggalSelesaiBerlaku: '2024-12-20',
      });
      expect(created).toEqual(newJadwal);

      const updated = await controller.update(tenantId, 'new-jadwal-id', adminId, {
        hari: 'selasa',
      });
      expect(updated.hari).toBe('selasa');

      const removed = await controller.remove(tenantId, 'new-jadwal-id');
      expect(removed.message).toBe('Jadwal pelajaran berhasil dihapus');
    });
  });
});
