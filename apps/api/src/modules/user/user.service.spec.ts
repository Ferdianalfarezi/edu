import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
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

  describe('bulkImportGuru', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';

    it('should create guru users from valid CSV and return result', async () => {
      const csv = 'nama,email\nBudi,budi@school.id\nAndi,andi@school.id';

      // For each row: uniqueness check → no conflict
      mockDb.limit.mockResolvedValueOnce([]); // budi@school.id - no conflict
      mockDb.limit.mockResolvedValueOnce([]); // andi@school.id - no conflict

      // insert().values() returns a chainable, returning() is called inside
      mockDb.returning.mockResolvedValue([{ id: 'new-id' }]);

      const result = await service.bulkImportGuru(tenantId, csv);

      expect(result.created).toBe(2);
      expect(result.skipped).toHaveLength(0);
      expect(result.total).toBe(2);
      expect(mockEmailQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should skip rows with duplicate emails', async () => {
      const csv = 'nama,email\nBudi,budi@school.id';

      // Email already exists
      mockDb.limit.mockResolvedValueOnce([{ id: 'existing-id' }]);

      const result = await service.bulkImportGuru(tenantId, csv);

      expect(result.created).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('Email sudah terdaftar');
    });

    it('should skip rows with invalid email format', async () => {
      const csv = 'nama,email\nBudi,not-an-email';

      const result = await service.bulkImportGuru(tenantId, csv);

      expect(result.created).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('Format email tidak valid');
    });

    it('should skip rows with empty nama', async () => {
      const csv = 'nama,email\n,valid@school.id';

      const result = await service.bulkImportGuru(tenantId, csv);

      expect(result.created).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('Nama tidak boleh kosong');
    });

    it('should throw if CSV is empty', async () => {
      await expect(service.bulkImportGuru(tenantId, '')).rejects.toThrow(BadRequestException);
    });

    it('should throw if CSV has no required columns', async () => {
      const csv = 'kolom1,kolom2\ndata1,data2';

      await expect(service.bulkImportGuru(tenantId, csv)).rejects.toThrow(BadRequestException);
    });
  });

  describe('parseCsv', () => {
    it('should parse a valid CSV with nama and email columns', () => {
      const csv = 'nama,email\nBudi Santoso,budi@school.id\nAndi,andi@school.id';
      const rows = service.parseCsv(csv);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ nama: 'Budi Santoso', email: 'budi@school.id' });
      expect(rows[1]).toEqual({ nama: 'Andi', email: 'andi@school.id' });
    });

    it('should handle different column order', () => {
      const csv = 'email,nama\nbudi@school.id,Budi';
      const rows = service.parseCsv(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ nama: 'Budi', email: 'budi@school.id' });
    });

    it('should handle extra columns gracefully', () => {
      const csv = 'nama,email,mata_pelajaran\nBudi,budi@school.id,Matematika';
      const rows = service.parseCsv(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ nama: 'Budi', email: 'budi@school.id' });
    });

    it('should return empty array for header-only CSV', () => {
      const csv = 'nama,email';
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
      expect(result.nextCursor).toBe('user-19');
    });

    it('should return null nextCursor when no more data', async () => {
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
      expect(result.nextCursor).toBeNull();
    });
  });

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
          jamMulai: '08:00',
          jamSelesai: '09:00',
          semester: 1,
          tahunAjaranId: 'ta-1',
        },
        {
          id: 'jadwal-2',
          kelasId: 'kelas-2',
          mataPelajaranId: 'mapel-2',
          hari: 'selasa',
          jamMulai: '10:00',
          jamSelesai: '11:00',
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
          jamMulai: '07:30',
          jamSelesai: '08:30',
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
});
