import { Test, TestingModule } from '@nestjs/testing';
import { JadwalController } from './jadwal.controller';
import { JadwalService } from './jadwal.service';
import { RedisService } from '@/modules/redis/redis.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { CreateJadwalDto, UpdateJadwalDto, FilterJadwalDto } from './dto';

describe('JadwalController', () => {
  let controller: JadwalController;
  let service: JadwalService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const adminId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const jadwalId = '22222222-2222-2222-2222-222222222222';

  const mockJadwal = {
    id: jadwalId,
    tenantId,
    kelasId: '33333333-3333-3333-3333-333333333333',
    mataPelajaranId: '44444444-4444-4444-4444-444444444444',
    guruId: '55555555-5555-5555-5555-555555555555',
    tahunAjaranId: '66666666-6666-6666-6666-666666666666',
    semester: 1,
    hari: 'senin',
    jamMulai: '08:00',
    jamSelesai: '09:30',
    tanggalMulaiBerlaku: '2024-07-15',
    tanggalSelesaiBerlaku: '2024-12-20',
    isVacant: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    kelasNama: '6A',
    mataPelajaranNama: 'Matematika',
    guruNama: 'Pak Budi',
  };

  const mockJadwalService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JadwalController],
      providers: [
        {
          provide: JadwalService,
          useValue: mockJadwalService,
        },
        { provide: RedisService, useValue: {} },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    controller = module.get<JadwalController>(JadwalController);
    service = module.get<JadwalService>(JadwalService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call service.create with tenantId, adminId, and dto', async () => {
      const dto: CreateJadwalDto = {
        kelasId: mockJadwal.kelasId,
        mataPelajaranId: mockJadwal.mataPelajaranId,
        guruId: mockJadwal.guruId,
        tahunAjaranId: mockJadwal.tahunAjaranId,
        semester: 1,
        hari: 'senin',
        jamMulai: '08:00',
        jamSelesai: '09:30',
        tanggalMulaiBerlaku: '2024-07-15',
        tanggalSelesaiBerlaku: '2024-12-20',
      };

      mockJadwalService.create.mockResolvedValue(mockJadwal);

      const result = await controller.create(tenantId, adminId, dto);

      expect(service.create).toHaveBeenCalledWith(tenantId, adminId, dto);
      expect(result).toEqual(mockJadwal);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with tenantId and filters', async () => {
      const filters: FilterJadwalDto = { kelasId: mockJadwal.kelasId, semester: 1 };
      mockJadwalService.findAll.mockResolvedValue([mockJadwal]);

      const result = await controller.findAll(tenantId, filters);

      expect(service.findAll).toHaveBeenCalledWith(tenantId, filters);
      expect(result).toEqual([mockJadwal]);
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with tenantId and id', async () => {
      mockJadwalService.findOne.mockResolvedValue(mockJadwal);

      const result = await controller.findOne(tenantId, jadwalId);

      expect(service.findOne).toHaveBeenCalledWith(tenantId, jadwalId);
      expect(result).toEqual(mockJadwal);
    });
  });

  describe('update', () => {
    it('should call service.update with tenantId, id, adminId, and dto', async () => {
      const dto: UpdateJadwalDto = { guruId: '77777777-7777-7777-7777-777777777777' };
      const updatedJadwal = { ...mockJadwal, guruId: dto.guruId };
      mockJadwalService.update.mockResolvedValue(updatedJadwal);

      const result = await controller.update(tenantId, jadwalId, adminId, dto);

      expect(service.update).toHaveBeenCalledWith(tenantId, jadwalId, adminId, dto);
      expect(result).toEqual(updatedJadwal);
    });
  });

  describe('remove', () => {
    it('should call service.remove with tenantId and id', async () => {
      mockJadwalService.remove.mockResolvedValue({
        message: 'Jadwal pelajaran berhasil dihapus',
      });

      const result = await controller.remove(tenantId, jadwalId);

      expect(service.remove).toHaveBeenCalledWith(tenantId, jadwalId);
      expect(result).toEqual({ message: 'Jadwal pelajaran berhasil dihapus' });
    });
  });
});
