import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { RaporOrangTuaController } from './rapor-orangtua.controller';
import { RaporOrangTuaService } from './rapor-orangtua.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';

/**
 * RaporOrangTuaController Unit Tests
 * Verifies GET /rapor/siswa/:siswaId behaves correctly for orang_tua.
 *
 * Requirements: 39.1–39.5
 */
describe('RaporOrangTuaController', () => {
  let controller: RaporOrangTuaController;
  let mockService: { getRaporSiswa: jest.Mock };

  const parentUserId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const siswaId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  beforeEach(async () => {
    mockService = {
      getRaporSiswa: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RaporOrangTuaController],
      providers: [{ provide: RaporOrangTuaService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RaporOrangTuaController>(RaporOrangTuaController);
  });

  describe('GET /rapor/siswa/:siswaId', () => {
    it('should return finalized rapor periods for the child', async () => {
      const mockData = [
        {
          rapor_id: 'rapor-1',
          periode: 'semester_1',
          tahun_ajaran: '2024/2025',
          nilai: [
            {
              mapel: 'Matematika',
              komponen_nilai: [{ komponen_id: 'k1', nilai: 85 }],
              capaian_pembelajaran: 'Baik dalam konsep bilangan',
            },
          ],
          peringkat: 3,
          rata_rata: '82.50',
          catatan_wali_kelas: 'Siswa rajin dan tekun',
          p5_deskripsi: [{ dimensi: 'Gotong Royong', deskripsi: 'Aktif berkolaborasi' }],
        },
      ];
      mockService.getRaporSiswa.mockResolvedValue(mockData);

      const result = await controller.getRaporSiswa(parentUserId, siswaId);

      expect(result.data).toEqual(mockData);
      expect(mockService.getRaporSiswa).toHaveBeenCalledWith(parentUserId, siswaId);
    });

    it('should return empty array when no finalized rapor exists', async () => {
      mockService.getRaporSiswa.mockResolvedValue([]);

      const result = await controller.getRaporSiswa(parentUserId, siswaId);

      expect(result.data).toEqual([]);
      expect(mockService.getRaporSiswa).toHaveBeenCalledWith(parentUserId, siswaId);
    });

    it('should propagate NotFoundException when siswa not found', async () => {
      mockService.getRaporSiswa.mockRejectedValue(new NotFoundException('Siswa tidak ditemukan'));

      await expect(controller.getRaporSiswa(parentUserId, siswaId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should propagate ForbiddenException when parent does not own child', async () => {
      mockService.getRaporSiswa.mockRejectedValue(
        new ForbiddenException('Anda tidak memiliki akses ke data rapor siswa ini'),
      );

      await expect(controller.getRaporSiswa(parentUserId, siswaId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
