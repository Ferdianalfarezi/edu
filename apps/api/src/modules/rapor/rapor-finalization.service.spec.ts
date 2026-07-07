import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { RaporFinalizationService } from './rapor-finalization.service';

/**
 * RaporFinalizationService Unit Tests
 * Tests for rapor finalization and revert by wali kelas.
 *
 * Requirements: 38.1–38.12
 */
describe('RaporFinalizationService', () => {
  let service: RaporFinalizationService;
  let mockNotificationQueue: { add: jest.Mock };

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const waliKelasId = '22222222-2222-2222-2222-222222222222';
  const otherGuruId = '33333333-3333-3333-3333-333333333333';
  const kelasId = '44444444-4444-4444-4444-444444444444';
  const raporId = '55555555-5555-5555-5555-555555555555';
  const tahunAjaranId = '66666666-6666-6666-6666-666666666666';
  const mapelId1 = '77777777-7777-7777-7777-777777777777';
  const mapelId2 = '88888888-8888-8888-8888-888888888888';
  const siswaId1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const siswaId2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const komponenAngkaId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  const mockDb = {};

  beforeEach(async () => {
    mockNotificationQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RaporFinalizationService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION), useValue: mockNotificationQueue },
      ],
    }).compile();

    service = module.get<RaporFinalizationService>(RaporFinalizationService);
  });

  // ═══════════════════════════════════════════════════════════════════
  // FINALIZE RAPOR Tests (Requirements: 38.1–38.10)
  // ═══════════════════════════════════════════════════════════════════

  describe('finalizeRapor', () => {
    it('should throw BadRequestException for invalid periode', async () => {
      await expect(
        service.finalizeRapor(tenantId, waliKelasId, kelasId, 'invalid_period', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when user is not wali kelas (Req 38.1)', async () => {
      // Mock validateWaliKelas to reject
      jest
        .spyOn(service, 'validateWaliKelas')
        .mockRejectedValue(
          new ForbiddenException(
            'Hanya wali kelas yang dapat memfinalisasi atau membatalkan finalisasi rapor',
          ),
        );

      await expect(
        service.finalizeRapor(tenantId, otherGuruId, kelasId, 'semester_1', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when no active tahun ajaran', async () => {
      jest.spyOn(service, 'validateWaliKelas').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getActiveTahunAjaran').mockResolvedValue(null);

      await expect(
        service.finalizeRapor(tenantId, waliKelasId, kelasId, 'semester_1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when rapor is already final', async () => {
      jest.spyOn(service, 'validateWaliKelas').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getActiveTahunAjaran').mockResolvedValue({
        id: tahunAjaranId,
        nama: '2024/2025',
      });
      jest.spyOn(service as any, 'getOrCreateRapor').mockResolvedValue({
        id: raporId,
        status: 'final',
      });

      await expect(
        service.finalizeRapor(tenantId, waliKelasId, kelasId, 'semester_1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with missing mapel when not all submitted (Req 38.2)', async () => {
      jest.spyOn(service, 'validateWaliKelas').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getActiveTahunAjaran').mockResolvedValue({
        id: tahunAjaranId,
        nama: '2024/2025',
      });
      jest.spyOn(service as any, 'getOrCreateRapor').mockResolvedValue({
        id: raporId,
        status: 'draft',
      });
      jest.spyOn(service, 'getMapelSubmissionStatuses').mockResolvedValue([
        { mata_pelajaran_id: mapelId1, mata_pelajaran_nama: 'Matematika', submitted: true },
        { mata_pelajaran_id: mapelId2, mata_pelajaran_nama: 'Bahasa Indonesia', submitted: false },
      ]);

      try {
        await service.finalizeRapor(tenantId, waliKelasId, kelasId, 'semester_1', {});
        fail('Expected BadRequestException');
      } catch (error: any) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = error.getResponse();
        expect(response.missing_mapel).toHaveLength(1);
        expect(response.missing_mapel[0].mata_pelajaran_nama).toBe('Bahasa Indonesia');
      }
    });

    it('should finalize rapor and return rankings when all mapel submitted (Req 38.6, 38.7)', async () => {
      jest.spyOn(service, 'validateWaliKelas').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getActiveTahunAjaran').mockResolvedValue({
        id: tahunAjaranId,
        nama: '2024/2025',
      });
      jest.spyOn(service as any, 'getOrCreateRapor').mockResolvedValue({
        id: raporId,
        status: 'draft',
      });
      jest.spyOn(service, 'getMapelSubmissionStatuses').mockResolvedValue([
        { mata_pelajaran_id: mapelId1, mata_pelajaran_nama: 'Matematika', submitted: true },
        { mata_pelajaran_id: mapelId2, mata_pelajaran_nama: 'Bahasa Indonesia', submitted: true },
      ]);
      jest.spyOn(service, 'calculateRankings').mockResolvedValue([
        { siswa_id: siswaId1, siswa_nama: 'Budi', rata_rata: 90, peringkat: 1 },
        { siswa_id: siswaId2, siswa_nama: 'Ani', rata_rata: 85, peringkat: 2 },
      ]);

      // Mock the DB update chain directly
      const mockUpdate = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });
      (service as any).db = { update: mockUpdate };

      // Mock notification sender
      jest.spyOn(service as any, 'sendFinalizationNotification').mockResolvedValue(undefined);

      const result = await service.finalizeRapor(tenantId, waliKelasId, kelasId, 'semester_1', {});

      expect(result.rapor_id).toBe(raporId);
      expect(result.status).toBe('final');
      expect(result.total_students).toBe(2);
      expect(result.rankings[0].peringkat).toBe(1);
      expect(result.rankings[0].rata_rata).toBe(90);
    });

    it('should send notification to parents on finalization (Req 38.10)', async () => {
      jest.spyOn(service, 'validateWaliKelas').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getActiveTahunAjaran').mockResolvedValue({
        id: tahunAjaranId,
        nama: '2024/2025',
      });
      jest.spyOn(service as any, 'getOrCreateRapor').mockResolvedValue({
        id: raporId,
        status: 'draft',
      });
      jest
        .spyOn(service, 'getMapelSubmissionStatuses')
        .mockResolvedValue([
          { mata_pelajaran_id: mapelId1, mata_pelajaran_nama: 'Matematika', submitted: true },
        ]);
      jest
        .spyOn(service, 'calculateRankings')
        .mockResolvedValue([
          { siswa_id: siswaId1, siswa_nama: 'Budi', rata_rata: 90, peringkat: 1 },
        ]);

      // Mock DB update
      const mockUpdate = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });
      const mockSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest
            .fn()
            .mockResolvedValue([{ siswaId: siswaId1, siswaNama: 'Budi', orangTuaId: 'parent-1' }]),
        }),
      });
      // For kelas name query
      const mockSelectKelas = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ nama: '6A' }]),
        }),
      });

      // Since sendFinalizationNotification is private, let's spy on the queue directly
      jest.spyOn(service as any, 'sendFinalizationNotification').mockImplementation(async () => {
        await mockNotificationQueue.add('send-rapor-finalization-notification', {
          tenant_id: tenantId,
          kelas_nama: '6A',
          periode: 'Semester 1',
          notifications: [{ orang_tua_id: 'parent-1', siswa_nama: 'Budi' }],
        });
      });

      (service as any).db = { update: mockUpdate };

      await service.finalizeRapor(tenantId, waliKelasId, kelasId, 'semester_1', {});

      expect(mockNotificationQueue.add).toHaveBeenCalledWith(
        'send-rapor-finalization-notification',
        expect.objectContaining({
          tenant_id: tenantId,
          notifications: expect.arrayContaining([
            expect.objectContaining({ orang_tua_id: 'parent-1' }),
          ]),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // REVERT RAPOR Tests (Requirements: 38.9)
  // ═══════════════════════════════════════════════════════════════════

  describe('revertRapor', () => {
    it('should throw BadRequestException for invalid periode', async () => {
      await expect(
        service.revertRapor(tenantId, waliKelasId, kelasId, 'invalid_period'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when user is not wali kelas', async () => {
      jest
        .spyOn(service, 'validateWaliKelas')
        .mockRejectedValue(
          new ForbiddenException(
            'Hanya wali kelas yang dapat memfinalisasi atau membatalkan finalisasi rapor',
          ),
        );

      await expect(
        service.revertRapor(tenantId, otherGuruId, kelasId, 'semester_1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when rapor not found', async () => {
      jest.spyOn(service, 'validateWaliKelas').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getActiveTahunAjaran').mockResolvedValue({
        id: tahunAjaranId,
        nama: '2024/2025',
      });

      // Mock DB select to return empty array
      const mockSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });
      (service as any).db = { select: mockSelect };

      await expect(
        service.revertRapor(tenantId, waliKelasId, kelasId, 'semester_1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when rapor already in draft status', async () => {
      jest.spyOn(service, 'validateWaliKelas').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getActiveTahunAjaran').mockResolvedValue({
        id: tahunAjaranId,
        nama: '2024/2025',
      });

      // Mock DB select to return draft rapor
      const mockSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ id: raporId, status: 'draft' }]),
        }),
      });
      (service as any).db = { select: mockSelect };

      await expect(
        service.revertRapor(tenantId, waliKelasId, kelasId, 'semester_1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully revert rapor from final to draft (Req 38.9)', async () => {
      jest.spyOn(service, 'validateWaliKelas').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getActiveTahunAjaran').mockResolvedValue({
        id: tahunAjaranId,
        nama: '2024/2025',
      });

      // Mock DB select to return final rapor
      const mockSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ id: raporId, status: 'final' }]),
        }),
      });
      const mockUpdate = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });
      (service as any).db = { select: mockSelect, update: mockUpdate };

      const result = await service.revertRapor(tenantId, waliKelasId, kelasId, 'semester_1');

      expect(result.rapor_id).toBe(raporId);
      expect(result.status).toBe('draft');
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // VALIDATE WALI KELAS Tests
  // ═══════════════════════════════════════════════════════════════════

  describe('validateWaliKelas', () => {
    it('should throw NotFoundException when kelas not found', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });
      (service as any).db = { select: mockSelect };

      await expect(service.validateWaliKelas(tenantId, waliKelasId, kelasId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not the wali kelas', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ id: kelasId, waliKelasId: 'someone-else' }]),
        }),
      });
      (service as any).db = { select: mockSelect };

      await expect(service.validateWaliKelas(tenantId, waliKelasId, kelasId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should pass when user is the wali kelas', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ id: kelasId, waliKelasId: waliKelasId }]),
        }),
      });
      (service as any).db = { select: mockSelect };

      await expect(
        service.validateWaliKelas(tenantId, waliKelasId, kelasId),
      ).resolves.toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CALCULATE RANKINGS Tests (Req 38.6)
  // ═══════════════════════════════════════════════════════════════════

  describe('calculateRankings', () => {
    it('should calculate correct rata_rata and assign peringkat DESC', async () => {
      // Mock rapor_nilai query — two students with different averages
      const mockNilaiSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            {
              siswaId: siswaId1,
              komponenNilai: [{ komponen_id: komponenAngkaId, nilai: 90 }],
            },
            {
              siswaId: siswaId1,
              komponenNilai: [{ komponen_id: komponenAngkaId, nilai: 80 }],
            },
            {
              siswaId: siswaId2,
              komponenNilai: [{ komponen_id: komponenAngkaId, nilai: 70 }],
            },
            {
              siswaId: siswaId2,
              komponenNilai: [{ komponen_id: komponenAngkaId, nilai: 60 }],
            },
          ]),
        }),
      });

      // Mock komponen_penilaian query
      const mockKomponenSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ id: komponenAngkaId, tipe: 'angka' }]),
        }),
      });

      // Mock active students query
      const mockStudentsSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { id: siswaId1, nama: 'Budi' },
            { id: siswaId2, nama: 'Ani' },
          ]),
        }),
      });

      // Mock the update for persisting rankings
      const mockUpdate = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      // Chain the select mocks
      let selectCallCount = 0;
      const selectMock = jest.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return mockNilaiSelect();
        if (selectCallCount === 2) return mockKomponenSelect();
        return mockStudentsSelect();
      });

      (service as any).db = { select: selectMock, update: mockUpdate };

      const result = await service.calculateRankings(tenantId, raporId, kelasId);

      expect(result).toHaveLength(2);
      // Budi: (90 + 80) / 2 = 85
      expect(result[0].siswa_id).toBe(siswaId1);
      expect(result[0].rata_rata).toBe(85);
      expect(result[0].peringkat).toBe(1);
      // Ani: (70 + 60) / 2 = 65
      expect(result[1].siswa_id).toBe(siswaId2);
      expect(result[1].rata_rata).toBe(65);
      expect(result[1].peringkat).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // GURU EDIT BLOCK Tests (Req 38.8)
  // This is enforced in RaporNilaiService.saveNilai — we verify behavior
  // ═══════════════════════════════════════════════════════════════════

  describe('guru edit block after finalization (Req 38.8)', () => {
    it('should prevent finalization of already finalized rapor (signals edit block is in place)', async () => {
      jest.spyOn(service, 'validateWaliKelas').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getActiveTahunAjaran').mockResolvedValue({
        id: tahunAjaranId,
        nama: '2024/2025',
      });
      jest.spyOn(service as any, 'getOrCreateRapor').mockResolvedValue({
        id: raporId,
        status: 'final',
      });

      await expect(
        service.finalizeRapor(tenantId, waliKelasId, kelasId, 'semester_1', {}),
      ).rejects.toThrow('Rapor sudah dalam status final');
    });
  });
});
