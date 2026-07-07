import { Test, TestingModule } from '@nestjs/testing';
import { AbsensiController } from './absensi.controller';
import { AbsensiService } from './absensi.service';
import { RedisService } from '@/modules/redis/redis.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { RequestUser } from '@/modules/auth/interfaces';
import { Role } from '@edu/shared';

describe('AbsensiController — View Endpoints (Task 8.6)', () => {
  let controller: AbsensiController;
  let service: AbsensiService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const kelasId = '22222222-2222-2222-2222-222222222222';
  const guruId = '33333333-3333-3333-3333-333333333333';

  const mockAbsensiService = {
    getAbsensiByKelasAndTanggal: jest.fn(),
    getDashboard: jest.fn(),
    updateAbsensi: jest.fn(),
    getKelasHariIni: jest.fn(),
    createAbsensi: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AbsensiController],
      providers: [
        {
          provide: AbsensiService,
          useValue: mockAbsensiService,
        },
        { provide: RedisService, useValue: {} },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    controller = module.get<AbsensiController>(AbsensiController);
    service = module.get<AbsensiService>(AbsensiService);

    jest.clearAllMocks();
  });

  describe('getAbsensiByKelasAndTanggal', () => {
    const guruUser: RequestUser = {
      id: guruId,
      role: Role.GURU,
      tenant_id: tenantId,
      platform: 'admin_panel',
      jti: 'jti-123',
    };

    const mockResult = {
      kelas_id: kelasId,
      kelas_nama: '6A',
      tanggal: '2024-10-01',
      can_edit: true,
      records: [
        { siswa_id: 'siswa-1', siswa_nama: 'Andi', status: 'hadir' },
        { siswa_id: 'siswa-2', siswa_nama: 'Budi', status: 'alpa' },
      ],
    };

    it('should call service with correct parameters for guru', async () => {
      mockAbsensiService.getAbsensiByKelasAndTanggal.mockResolvedValue(mockResult);

      const result = await controller.getAbsensiByKelasAndTanggal(
        tenantId,
        kelasId,
        '2024-10-01',
        guruUser,
      );

      expect(service.getAbsensiByKelasAndTanggal).toHaveBeenCalledWith(
        tenantId,
        kelasId,
        '2024-10-01',
        guruId,
        Role.GURU,
      );
      expect(result).toEqual(mockResult);
    });

    it('should call service with correct parameters for kepala_sekolah', async () => {
      const kepalaUser: RequestUser = {
        id: 'kepala-id',
        role: Role.KEPALA_SEKOLAH,
        tenant_id: tenantId,
        platform: 'admin_panel',
        jti: 'jti-456',
      };

      const kepalaResult = { ...mockResult, can_edit: true };
      mockAbsensiService.getAbsensiByKelasAndTanggal.mockResolvedValue(kepalaResult);

      const result = await controller.getAbsensiByKelasAndTanggal(
        tenantId,
        kelasId,
        '2024-10-01',
        kepalaUser,
      );

      expect(service.getAbsensiByKelasAndTanggal).toHaveBeenCalledWith(
        tenantId,
        kelasId,
        '2024-10-01',
        'kepala-id',
        Role.KEPALA_SEKOLAH,
      );
      expect(result).toEqual(kepalaResult);
    });
  });

  describe('getDashboard', () => {
    const mockDashboardResult = {
      tanggal: '2024-10-01',
      ringkasan_per_kelas: [
        {
          kelas_id: kelasId,
          kelas_nama: '6A',
          total_siswa: 30,
          hadir: 25,
          izin: 2,
          sakit: 1,
          alpa: 2,
        },
      ],
      perhatian_khusus: [
        {
          siswa_id: 'siswa-x',
          siswa_nama: 'Rudi',
          kelas_nama: '6A',
          total_alpa: 12,
        },
      ],
    };

    it('should call service.getDashboard with tenantId', async () => {
      mockAbsensiService.getDashboard.mockResolvedValue(mockDashboardResult);

      const result = await controller.getDashboard(tenantId);

      expect(service.getDashboard).toHaveBeenCalledWith(tenantId);
      expect(result).toEqual(mockDashboardResult);
    });
  });
});
