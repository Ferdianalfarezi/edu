import { Test, TestingModule } from '@nestjs/testing';
import { RaporController } from './rapor.controller';
import { RaporNilaiService } from './rapor-nilai.service';
import { RaporOverviewService } from './rapor-overview.service';
import { RaporFinalizationService } from './rapor-finalization.service';
import { RaporExportService } from './rapor-export.service';
import { RaporWaliService } from './rapor-wali.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';

/**
 * RaporController Unit Tests
 * Verifies correct delegation to the service layer.
 *
 * Requirements: 37.1–37.10, 38.11, 38.12
 */
describe('RaporController', () => {
  let controller: RaporController;
  let mockService: Record<string, jest.Mock>;
  let mockOverviewService: Record<string, jest.Mock>;
  let mockFinalizationService: Record<string, jest.Mock>;
  let mockExportService: Record<string, jest.Mock>;
  let mockWaliService: Record<string, jest.Mock>;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const guruId = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    mockService = {
      getGuruMapel: jest.fn(),
      getKelasGrades: jest.fn(),
      saveNilai: jest.fn(),
    };

    mockOverviewService = {
      getOverview: jest.fn(),
    };

    mockFinalizationService = {
      finalizeRapor: jest.fn(),
      revertRapor: jest.fn(),
    };

    mockExportService = {
      exportRapor: jest.fn(),
    };

    mockWaliService = {
      getKelasWali: jest.fn(),
      saveCatatan: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RaporController],
      providers: [
        { provide: RaporNilaiService, useValue: mockService },
        { provide: RaporOverviewService, useValue: mockOverviewService },
        { provide: RaporFinalizationService, useValue: mockFinalizationService },
        { provide: RaporExportService, useValue: mockExportService },
        { provide: RaporWaliService, useValue: mockWaliService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RaporController>(RaporController);
  });

  describe('GET /rapor/mata-pelajaran', () => {
    it('should return guru assigned subjects', async () => {
      const mockData = [
        {
          mapel_id: 'mapel-1',
          mapel_nama: 'Matematika',
          kelas: [{ kelas_id: 'kelas-1', kelas_nama: '1A' }],
        },
      ];
      mockService.getGuruMapel.mockResolvedValue(mockData);

      const result = await controller.getGuruMapel(tenantId, guruId);

      expect(result.data).toEqual(mockData);
      expect(mockService.getGuruMapel).toHaveBeenCalledWith(tenantId, guruId);
    });
  });

  describe('GET /rapor/kelas/:kelasId/mapel/:mapelId/periode/:periodeId', () => {
    it('should return student grade data for the class', async () => {
      const mockData = {
        kelas_id: 'kelas-1',
        kelas_nama: '1A',
        mapel_id: 'mapel-1',
        mapel_nama: 'Matematika',
        periode: 'uts_semester_1',
        komponen_penilaian: [],
        students: [],
      };
      mockService.getKelasGrades.mockResolvedValue(mockData);

      const result = await controller.getKelasGrades(
        tenantId,
        guruId,
        'kelas-1',
        'mapel-1',
        'uts_semester_1',
      );

      expect(result.data).toEqual(mockData);
      expect(mockService.getKelasGrades).toHaveBeenCalledWith(
        tenantId,
        guruId,
        'kelas-1',
        'mapel-1',
        'uts_semester_1',
      );
    });
  });

  describe('POST /rapor/nilai', () => {
    it('should return success message for draft save', async () => {
      mockService.saveNilai.mockResolvedValue({ saved: 5, rapor_id: 'rapor-1' });

      const dto = {
        kelas_id: 'kelas-1',
        mata_pelajaran_id: 'mapel-1',
        periode_rapor_id: 'uts_semester_1',
        nilai: [],
        status: 'draft' as const,
      };

      const result = await controller.saveNilai(tenantId, guruId, dto);

      expect(result.message).toBe('Nilai berhasil disimpan sebagai draft');
      expect(result.data.saved).toBe(5);
      expect(mockService.saveNilai).toHaveBeenCalledWith(tenantId, guruId, dto);
    });

    it('should return success message for submitted save', async () => {
      mockService.saveNilai.mockResolvedValue({ saved: 30, rapor_id: 'rapor-1' });

      const dto = {
        kelas_id: 'kelas-1',
        mata_pelajaran_id: 'mapel-1',
        periode_rapor_id: 'semester_1',
        nilai: [],
        status: 'submitted' as const,
      };

      const result = await controller.saveNilai(tenantId, guruId, dto);

      expect(result.message).toBe('Nilai berhasil dikirim');
      expect(result.data.saved).toBe(30);
    });
  });

  describe('GET /rapor/overview', () => {
    it('should return rapor overview data for kepala_sekolah', async () => {
      const mockData = [
        {
          rapor_id: 'rapor-1',
          kelas_id: 'kelas-1',
          kelas_nama: '1A',
          periode: 'uts_semester_1',
          tahun_ajaran_id: 'ta-1',
          tahun_ajaran_nama: '2024/2025',
          status: 'draft',
          finalized_by: null,
          finalized_at: null,
          total_students: 30,
          submitted_count: 10,
        },
      ];
      mockOverviewService.getOverview.mockResolvedValue(mockData);

      const query = { kelas_id: 'kelas-1' };
      const result = await controller.getOverview(tenantId, query);

      expect(result.data).toEqual(mockData);
      expect(mockOverviewService.getOverview).toHaveBeenCalledWith(tenantId, query);
    });

    it('should pass all filter parameters to the service', async () => {
      mockOverviewService.getOverview.mockResolvedValue([]);

      const query = {
        kelas_id: 'kelas-2',
        periode: 'semester_1',
        tahun_ajaran_id: 'ta-2',
      };
      const result = await controller.getOverview(tenantId, query);

      expect(result.data).toEqual([]);
      expect(mockOverviewService.getOverview).toHaveBeenCalledWith(tenantId, query);
    });

    it('should return empty data when no filters match', async () => {
      mockOverviewService.getOverview.mockResolvedValue([]);

      const result = await controller.getOverview(tenantId, {});

      expect(result.data).toEqual([]);
      expect(mockOverviewService.getOverview).toHaveBeenCalledWith(tenantId, {});
    });
  });
});
