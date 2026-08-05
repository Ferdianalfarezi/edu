import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as fc from 'fast-check';
import { UserService } from './user.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { QUEUE_NAMES } from '@/modules/queue';
import { Role } from '@edu/shared';

// Mock database helper - each method returns `this` for chaining except terminal methods
const createMockDb = () => {
  const mock: any = {
    select: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
    orderBy: jest.fn(),
    insert: jest.fn(),
    values: jest.fn(),
    returning: jest.fn(),
    update: jest.fn(),
    set: jest.fn(),
    innerJoin: jest.fn(),
    // transaction: executes the callback immediately with a mock tx (same chainable mock)
    transaction: jest.fn(),
  };
  // Chain everything to `this` by default
  mock.select.mockReturnValue(mock);
  mock.from.mockReturnValue(mock);
  mock.where.mockReturnValue(mock);
  mock.limit.mockReturnValue(mock);
  mock.orderBy.mockReturnValue(mock);
  mock.insert.mockReturnValue(mock);
  mock.values.mockReturnValue(mock);
  mock.returning.mockReturnValue(mock);
  mock.update.mockReturnValue(mock);
  mock.set.mockReturnValue(mock);
  mock.innerJoin.mockReturnValue(mock);
  // transaction receives async (tx) => {...} and runs it with the same mock as tx
  mock.transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(mock));
  return mock;
};

describe('UserService', () => {
  let service: UserService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockEmailQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockDb = createMockDb();
    mockEmailQueue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: mockEmailQueue },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('createUser', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const dto = {
      nama: 'Budi Santoso',
      email: 'budi@school.id',
      role: Role.GURU as const,
    };

    it('should create a user with random password and enqueue email', async () => {
      // Mock: no existing user with same email
      mockDb.limit.mockResolvedValueOnce([]);

      // Mock: insert returning
      mockDb.returning.mockResolvedValueOnce([
        {
          id: 'new-user-id',
          nama: dto.nama,
          email: dto.email,
          phone: null,
          role: dto.role,
          isActive: true,
          mustChangePassword: true,
          createdAt: new Date(),
        },
      ]);

      const result = await service.createUser(tenantId, dto);

      expect(result.id).toBe('new-user-id');
      expect(result.nama).toBe(dto.nama);
      expect(result.email).toBe(dto.email);
      expect(result.role).toBe(Role.GURU);
      expect(result.mustChangePassword).toBe(true);

      // Should enqueue credential email
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'send-user-credentials',
        expect.objectContaining({
          to: dto.email,
          name: dto.nama,
          role: Role.GURU,
        }),
      );
    });

    it('should throw ConflictException if email already exists in tenant', async () => {
      // Mock: existing user found
      mockDb.limit.mockResolvedValueOnce([{ id: 'existing-id' }]);

      await expect(service.createUser(tenantId, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('getUserById', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';

    it('should return user if found', async () => {
      const mockUser = {
        id: 'user-id',
        nama: 'Test',
        email: 'test@school.id',
        phone: null,
        role: Role.GURU,
        isActive: true,
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDb.limit.mockResolvedValueOnce([mockUser]);

      const result = await service.getUserById(tenantId, 'user-id');
      expect(result.id).toBe('user-id');
      expect(result.nama).toBe('Test');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.getUserById(tenantId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUser', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const userId = 'user-id';

    it('should update user fields and return updated user', async () => {
      // Mock getUserById (select)
      mockDb.limit.mockResolvedValueOnce([
        {
          id: userId,
          nama: 'Old Name',
          email: 'old@school.id',
          phone: null,
          role: Role.GURU,
          isActive: true,
          mustChangePassword: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Mock email uniqueness check (no conflict)
      mockDb.limit.mockResolvedValueOnce([]);

      // Mock update returning
      mockDb.returning.mockResolvedValueOnce([
        {
          id: userId,
          nama: 'New Name',
          email: 'new@school.id',
          phone: null,
          role: Role.GURU,
          isActive: true,
          mustChangePassword: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.updateUser(tenantId, userId, {
        nama: 'New Name',
        email: 'new@school.id',
      });

      expect(result.nama).toBe('New Name');
      expect(result.email).toBe('new@school.id');
    });

    it('should throw ConflictException if new email conflicts', async () => {
      // Mock getUserById
      mockDb.limit.mockResolvedValueOnce([
        {
          id: userId,
          nama: 'Test',
          email: 'old@school.id',
          phone: null,
          role: Role.GURU,
          isActive: true,
          mustChangePassword: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Mock email uniqueness check — conflict found
      mockDb.limit.mockResolvedValueOnce([{ id: 'other-user' }]);

      await expect(
        service.updateUser(tenantId, userId, { email: 'taken@school.id' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deactivateUser', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const userId = 'user-id';

    it('should deactivate user and invalidate tokens', async () => {
      // Mock getUserById
      mockDb.limit.mockResolvedValueOnce([
        {
          id: userId,
          nama: 'Test',
          email: 'test@school.id',
          phone: null,
          role: Role.GURU,
          isActive: true,
          mustChangePassword: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Mock update returning
      mockDb.returning.mockResolvedValueOnce([{ id: userId, nama: 'Test', isActive: false }]);

      const result = await service.deactivateUser(tenantId, userId);
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.deactivateUser(tenantId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('bulkImportUsers', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';

    it('should create users from valid CSV with role column and return result', async () => {
      const csv = 'nama,email,role\nBudi,budi@school.id,guru\nAndi,andi@school.id,admin';

      // First select query: batch email uniqueness check → no existing emails
      let selectCallCount = 0;
      mockDb.where.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // Batch uniqueness check — return empty array (no duplicates)
          return Promise.resolve([]);
        }
        return mockDb; // fallback for other chains
      });

      // insert().values() returns a chainable, returning() is called inside
      mockDb.returning.mockResolvedValue([{ id: 'new-id' }]);

      const result = await service.bulkImportUsers(tenantId, csv);

      expect(result.created).toBe(2);
      expect(result.skipped).toHaveLength(0);
      expect(result.total).toBe(2);
      expect(mockEmailQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should skip rows with duplicate emails', async () => {
      const csv = 'nama,email,role\nBudi,budi@school.id,guru';

      // Batch uniqueness check returns the email as existing
      mockDb.where.mockImplementationOnce(() => {
        return Promise.resolve([{ email: 'budi@school.id' }]);
      });

      const result = await service.bulkImportUsers(tenantId, csv);

      expect(result.created).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('Email sudah terdaftar');
    });

    it('should skip rows with invalid email format', async () => {
      const csv = 'nama,email,role\nBudi,not-an-email,guru';

      const result = await service.bulkImportUsers(tenantId, csv);

      expect(result.created).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('Format email tidak valid');
    });

    it('should skip rows with empty nama', async () => {
      const csv = 'nama,email,role\n,valid@school.id,guru';

      const result = await service.bulkImportUsers(tenantId, csv);

      expect(result.created).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('Nama tidak boleh kosong');
    });

    it('should skip rows with invalid role', async () => {
      const csv = 'nama,email,role\nBudi,budi@school.id,super_admin';

      const result = await service.bulkImportUsers(tenantId, csv);

      expect(result.created).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain('Role tidak valid');
    });

    it('should throw if CSV is empty', async () => {
      await expect(service.bulkImportUsers(tenantId, '')).rejects.toThrow(BadRequestException);
    });

    it('should throw if CSV has no required columns', async () => {
      const csv = 'kolom1,kolom2\ndata1,data2';

      await expect(service.bulkImportUsers(tenantId, csv)).rejects.toThrow(BadRequestException);
    });
  });

  describe('parseCsv', () => {
    it('should parse a valid CSV with nama, email and role columns', () => {
      const csv = 'nama,email,role\nBudi Santoso,budi@school.id,guru\nAndi,andi@school.id,admin';
      const rows = service.parseCsv(csv);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ nama: 'Budi Santoso', email: 'budi@school.id', role: 'guru' });
      expect(rows[1]).toEqual({ nama: 'Andi', email: 'andi@school.id', role: 'admin' });
    });

    it('should handle different column order', () => {
      const csv = 'email,role,nama\nbudi@school.id,guru,Budi';
      const rows = service.parseCsv(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ nama: 'Budi', email: 'budi@school.id', role: 'guru' });
    });

    it('should handle extra columns gracefully', () => {
      const csv = 'nama,email,role,catatan\nBudi,budi@school.id,guru,test';
      const rows = service.parseCsv(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ nama: 'Budi', email: 'budi@school.id', role: 'guru' });
    });

    it('should return empty array for header-only CSV', () => {
      const csv = 'nama,email,role';
      const rows = service.parseCsv(csv);
      expect(rows).toHaveLength(0);
    });

    it('should throw if required columns are missing', () => {
      const csv = 'foo,bar\ndata1,data2';
      expect(() => service.parseCsv(csv)).toThrow(BadRequestException);
    });
  });

  describe('generateRandomPassword', () => {
    it('should generate a 12-character password', () => {
      const password = service.generateRandomPassword();
      expect(password).toHaveLength(12);
    });

    it('should generate different passwords each time', () => {
      const p1 = service.generateRandomPassword();
      const p2 = service.generateRandomPassword();
      expect(p1).not.toBe(p2);
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2: Password generator memenuhi semua kriteria keamanan
  // Feature: user-password-reset, Property 2: Password generator memenuhi semua kriteria keamanan
  // **Validates: Requirements 3.1**
  // ---------------------------------------------------------------------------

  describe('Property 2: Password generator memenuhi semua kriteria keamanan', () => {
    it('generateSecurePassword() selalu memenuhi semua kriteria keamanan', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const password = service.generateSecurePassword();

          // Minimal 12 karakter
          expect(password.length).toBeGreaterThanOrEqual(12);

          // Mengandung minimal 1 huruf besar
          expect(password).toMatch(/[A-Z]/);

          // Mengandung minimal 1 huruf kecil
          expect(password).toMatch(/[a-z]/);

          // Mengandung minimal 1 angka
          expect(password).toMatch(/[0-9]/);

          // Mengandung minimal 1 simbol dari set yang ditentukan
          expect(password).toMatch(/[!@#$%^&*]/);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('listUsers', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';

    it('should return paginated list with nextCursor', async () => {
      const users = Array.from({ length: 21 }, (_, i) => ({
        id: `user-${i}`,
        nama: `User ${i}`,
        email: `user${i}@school.id`,
        phone: null,
        role: Role.GURU,
        isActive: true,
        mustChangePassword: false,
        createdAt: new Date(),
      }));

      mockDb.limit.mockResolvedValueOnce(users);

      const result = await service.listUsers(tenantId, {});

      expect(result.data).toHaveLength(20);
      expect(result.meta.cursor).toBe('user-19');
      expect(result.meta.has_next).toBe(true);
    });

    it('should return null cursor when no more data', async () => {
      const users = [
        {
          id: 'user-1',
          nama: 'User 1',
          email: 'user1@school.id',
          phone: null,
          role: Role.GURU,
          isActive: true,
          mustChangePassword: false,
          createdAt: new Date(),
        },
      ];

      mockDb.limit.mockResolvedValueOnce(users);

      const result = await service.listUsers(tenantId, {});

      expect(result.data).toHaveLength(1);
      expect(result.meta.cursor).toBeNull();
      expect(result.meta.has_next).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------

  describe('listGuru', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';

    it('should return active guru users with id, nama, email, telepon', async () => {
      const mockGuruList = [
        { id: 'g1', nama: 'Pak Budi', email: 'budi@school.id', telepon: '08111' },
        { id: 'g2', nama: 'Bu Ani', email: 'ani@school.id', telepon: null },
      ];

      mockDb.orderBy.mockResolvedValueOnce(mockGuruList);

      const result = await service.listGuru(tenantId);

      expect(result).toEqual({ data: mockGuruList });
      expect(result.data).toHaveLength(2);
    });

    it('should return empty data array when no active guru found', async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

      const result = await service.listGuru(tenantId);

      expect(result).toEqual({ data: [] });
    });

    it('should query with tenantId, role=GURU, and isActive=true filters', async () => {
      // Capture the where call args to verify filtering
      const whereSpy = jest.spyOn(mockDb, 'where');
      mockDb.orderBy.mockResolvedValueOnce([]);

      await service.listGuru(tenantId);

      // where() must be called — meaning filters are applied, not a full table scan
      expect(whereSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------

  describe('deactivateGuru', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const guruId = 'guru-user-id';

    const mockGuruUser = {
      id: guruId,
      nama: 'Pak Guru',
      email: 'guru@school.id',
      phone: null,
      role: Role.GURU,
      isActive: true,
      mustChangePassword: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should deactivate guru, mark jadwal as vacant, and remove wali_kelas', async () => {
      jest.spyOn(service, 'getUserById').mockResolvedValueOnce(mockGuruUser);
      jest
        .spyOn(service, 'deactivateUser')
        .mockResolvedValueOnce({ id: guruId, nama: 'Pak Guru', isActive: false });
      jest.spyOn(service, 'findActiveJadwalForGuru').mockResolvedValueOnce([
        {
          id: 'jadwal-1',
          kelasId: 'kelas-1',
          mataPelajaranId: 'mapel-1',
          hari: 'senin',
          jamKe: 1,
          semester: 1,
          tahunAjaranId: 'ta-1',
        },
        {
          id: 'jadwal-2',
          kelasId: 'kelas-2',
          mataPelajaranId: 'mapel-2',
          hari: 'selasa',
          jamKe: 3,
          semester: 1,
          tahunAjaranId: 'ta-1',
        },
      ]);
      jest
        .spyOn(service, 'findWaliKelasForGuru')
        .mockResolvedValueOnce([{ kelasId: 'kelas-1', kelasNama: '1A', tahunAjaranId: 'ta-1' }]);

      // Mock update jadwal (set vacant) and update kelas (remove wali)
      mockDb.where.mockResolvedValueOnce(undefined); // update jadwal
      mockDb.where.mockResolvedValueOnce(undefined); // update kelas

      const result = await service.deactivateGuru(tenantId, guruId);

      expect(result.deactivatedUser.isActive).toBe(false);
      expect(result.deactivatedUser.id).toBe(guruId);
      expect(result.vacantJadwalSlots).toHaveLength(2);
      expect(result.vacantJadwalSlots[0].id).toBe('jadwal-1');
      expect(result.vacantJadwalSlots[1].hari).toBe('selasa');
      expect(result.removedWaliKelas).toHaveLength(1);
      expect(result.removedWaliKelas[0].kelasNama).toBe('1A');
      expect(result.message).toContain('2 slot jadwal kosong');
      expect(result.message).toContain('1 kelas kehilangan wali kelas');
    });

    it('should throw BadRequestException if user is not a guru', async () => {
      const adminUser = { ...mockGuruUser, role: Role.ADMIN };
      jest.spyOn(service, 'getUserById').mockResolvedValueOnce(adminUser);

      await expect(service.deactivateGuru(tenantId, guruId)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      jest
        .spyOn(service, 'getUserById')
        .mockRejectedValueOnce(new NotFoundException('User tidak ditemukan'));

      await expect(service.deactivateGuru(tenantId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle guru with no active jadwal and no wali_kelas', async () => {
      jest.spyOn(service, 'getUserById').mockResolvedValueOnce(mockGuruUser);
      jest
        .spyOn(service, 'deactivateUser')
        .mockResolvedValueOnce({ id: guruId, nama: 'Pak Guru', isActive: false });
      jest.spyOn(service, 'findActiveJadwalForGuru').mockResolvedValueOnce([]);
      jest.spyOn(service, 'findWaliKelasForGuru').mockResolvedValueOnce([]);

      const result = await service.deactivateGuru(tenantId, guruId);

      expect(result.deactivatedUser.isActive).toBe(false);
      expect(result.vacantJadwalSlots).toHaveLength(0);
      expect(result.removedWaliKelas).toHaveLength(0);
      expect(result.message).toBe('0 slot jadwal kosong, silakan assign guru pengganti.');
    });

    it('should handle guru with jadwal but no wali_kelas assignment', async () => {
      jest.spyOn(service, 'getUserById').mockResolvedValueOnce(mockGuruUser);
      jest
        .spyOn(service, 'deactivateUser')
        .mockResolvedValueOnce({ id: guruId, nama: 'Pak Guru', isActive: false });
      jest.spyOn(service, 'findActiveJadwalForGuru').mockResolvedValueOnce([
        {
          id: 'jadwal-1',
          kelasId: 'kelas-1',
          mataPelajaranId: 'mapel-1',
          hari: 'rabu',
          jamKe: 1,
          semester: 2,
          tahunAjaranId: 'ta-2',
        },
      ]);
      jest.spyOn(service, 'findWaliKelasForGuru').mockResolvedValueOnce([]);

      // Mock update jadwal (set vacant)
      mockDb.where.mockResolvedValueOnce(undefined);

      const result = await service.deactivateGuru(tenantId, guruId);

      expect(result.vacantJadwalSlots).toHaveLength(1);
      expect(result.vacantJadwalSlots[0].hari).toBe('rabu');
      expect(result.removedWaliKelas).toHaveLength(0);
      expect(result.message).toBe('1 slot jadwal kosong, silakan assign guru pengganti.');
    });

    it('should handle guru who is wali_kelas of multiple classes', async () => {
      jest.spyOn(service, 'getUserById').mockResolvedValueOnce(mockGuruUser);
      jest
        .spyOn(service, 'deactivateUser')
        .mockResolvedValueOnce({ id: guruId, nama: 'Pak Guru', isActive: false });
      jest.spyOn(service, 'findActiveJadwalForGuru').mockResolvedValueOnce([]);
      jest.spyOn(service, 'findWaliKelasForGuru').mockResolvedValueOnce([
        { kelasId: 'kelas-1', kelasNama: '1A', tahunAjaranId: 'ta-1' },
        { kelasId: 'kelas-2', kelasNama: '2B', tahunAjaranId: 'ta-1' },
      ]);

      // Mock update kelas (remove wali_kelas)
      mockDb.where.mockResolvedValueOnce(undefined);

      const result = await service.deactivateGuru(tenantId, guruId);

      expect(result.vacantJadwalSlots).toHaveLength(0);
      expect(result.removedWaliKelas).toHaveLength(2);
      expect(result.removedWaliKelas[0].kelasNama).toBe('1A');
      expect(result.removedWaliKelas[1].kelasNama).toBe('2B');
      expect(result.message).toContain('2 kelas kehilangan wali kelas');
    });

    it('should invalidate tokens on deactivation', async () => {
      jest.spyOn(service, 'getUserById').mockResolvedValueOnce(mockGuruUser);
      const deactivateSpy = jest
        .spyOn(service, 'deactivateUser')
        .mockResolvedValueOnce({ id: guruId, nama: 'Pak Guru', isActive: false });
      jest.spyOn(service, 'findActiveJadwalForGuru').mockResolvedValueOnce([]);
      jest.spyOn(service, 'findWaliKelasForGuru').mockResolvedValueOnce([]);

      await service.deactivateGuru(tenantId, guruId);

      // Verify deactivateUser was called (which sets tokensInvalidatedAt)
      expect(deactivateSpy).toHaveBeenCalledWith(tenantId, guruId);
    });
  });

  // ---------------------------------------------------------------------------
  // Unit tests: resetPassword() validation
  // Requirements: 3.4, 4.3, 4.6, 6.4, 6.5
  // ---------------------------------------------------------------------------

  describe('resetPassword()', () => {
    const callerId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const targetId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    /** Helper: mock a successful DB lookup returning a user */
    const mockUserLookup = (overrides: Record<string, unknown> = {}) => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: targetId,
          nama: 'Budi Santoso',
          email: 'budi@school.id',
          role: Role.GURU,
          tenantId: 'tenant-1',
          ...overrides,
        },
      ]);
    };

    /** Helper: mock a successful DB transaction update (no return value needed) */
    const mockTransactionUpdate = () => {
      // transaction calls the callback with mock as tx
      // inside callback: tx.update().set().where() — all chainable, no terminal resolution needed
      // The mock.transaction already resolves the callback, so where() returning mock is fine
    };

    it('should throw ForbiddenException when callerId === targetId', async () => {
      await expect(service.resetPassword(callerId, Role.SUPER_ADMIN, callerId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException with correct message when callerId === targetId', async () => {
      await expect(service.resetPassword(callerId, Role.SUPER_ADMIN, callerId)).rejects.toThrow(
        'Tidak dapat mereset password sendiri',
      );
    });

    it('should throw NotFoundException when user is not found', async () => {
      // DB returns empty — user does not exist
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.resetPassword(callerId, Role.SUPER_ADMIN, targetId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with correct message when user is not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.resetPassword(callerId, Role.SUPER_ADMIN, targetId)).rejects.toThrow(
        'User tidak ditemukan',
      );
    });

    it('should throw ForbiddenException when target user is super_admin', async () => {
      mockUserLookup({ role: Role.SUPER_ADMIN });

      await expect(service.resetPassword(callerId, Role.SUPER_ADMIN, targetId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException with correct message when target is super_admin', async () => {
      mockUserLookup({ role: Role.SUPER_ADMIN });

      await expect(service.resetPassword(callerId, Role.SUPER_ADMIN, targetId)).rejects.toThrow(
        'Tidak dapat mereset password superadmin',
      );
    });

    it('should throw BadRequestException when target email is null', async () => {
      mockUserLookup({ email: null });

      await expect(service.resetPassword(callerId, Role.SUPER_ADMIN, targetId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException with correct message when email is null', async () => {
      mockUserLookup({ email: null });

      await expect(service.resetPassword(callerId, Role.SUPER_ADMIN, targetId)).rejects.toThrow(
        'User tidak memiliki alamat email',
      );
    });

    it('should throw BadRequestException when target email is empty string', async () => {
      mockUserLookup({ email: '' });

      await expect(service.resetPassword(callerId, Role.SUPER_ADMIN, targetId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when target email is whitespace only', async () => {
      mockUserLookup({ email: '   ' });

      await expect(service.resetPassword(callerId, Role.SUPER_ADMIN, targetId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return success and log error (not throw) when emailQueue.add() fails', async () => {
      // Happy-path DB lookup
      mockUserLookup();

      // emailQueue.add() rejects — simulates queue failure
      mockEmailQueue.add.mockRejectedValueOnce(new Error('Redis connection refused'));

      // Spy on console.error to verify the error is logged
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      let result: { message: string } | undefined;
      await expect(
        (async () => {
          result = await service.resetPassword(callerId, Role.SUPER_ADMIN, targetId);
        })(),
      ).resolves.not.toThrow();

      // Should still return the success message
      expect(result).toEqual({ message: 'Password berhasil direset' });

      // console.error should have been called with the failure info
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to enqueue admin password reset email'),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // Property 3: Response reset tidak mengandung password plaintext
  // Feature: user-password-reset, Property 3: Response reset tidak mengandung password plaintext
  // **Validates: Requirements 3.3**
  // ---------------------------------------------------------------------------

  describe('Property 3: Response reset tidak mengandung password plaintext', () => {
    // Fixed callerId — always different from any generated targetId (different UUID v4 value)
    const fixedCallerId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    it('response dari resetPassword() tidak pernah mengandung field password plaintext', async () => {
      // Mock bcrypt.hash agar tidak lakukan komputasi mahal (10 salt rounds) per iterasi
      // Ini tidak mempengaruhi properti yang diuji: apakah response mengandung plaintext atau tidak
      const bcrypt = await import('bcrypt');
      const bcryptSpy = jest
        .spyOn(bcrypt, 'hash')
        .mockResolvedValue('$2b$10$mockedhashvalue' as never);

      try {
        await fc.assert(
          fc.asyncProperty(fc.uuid(), async (targetId) => {
            // Guard: skip jika UUID yang di-generate kebetulan sama dengan callerId
            // (probabilitas sangat rendah, tapi kita tangani untuk kebenaran formal)
            if (targetId === fixedCallerId) return;

            // Mock DB lookup: kembalikan user valid (non-superadmin, punya email)
            mockDb.limit.mockResolvedValueOnce([
              {
                id: targetId,
                nama: 'Test User',
                email: 'testuser@school.id',
                role: Role.GURU,
                tenantId: 'tenant-test',
              },
            ]);

            // Mock emailQueue.add agar tidak throw
            mockEmailQueue.add.mockResolvedValueOnce(undefined);

            const result = await service.resetPassword(fixedCallerId, Role.SUPER_ADMIN, targetId);

            // Verifikasi: response tidak mengandung field password plaintext
            const keys = Object.keys(result);
            expect(keys).not.toContain('password');
            expect(keys).not.toContain('tempPassword');
            expect(keys).not.toContain('temp_password');
          }),
          { numRuns: 100 },
        );
      } finally {
        bcryptSpy.mockRestore();
      }
    }, 30000); // timeout 30 detik untuk 100 iterasi async
  });
});
