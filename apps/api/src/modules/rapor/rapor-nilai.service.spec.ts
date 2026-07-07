import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { RaporNilaiService } from './rapor-nilai.service';

/**
 * RaporNilaiService Unit Tests
 * Tests for input nilai (grade input) by guru.
 *
 * Requirements: 37.1–37.10
 */
describe('RaporNilaiService', () => {
  let service: RaporNilaiService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const guruId = '22222222-2222-2222-2222-222222222222';
  const kelasId = '33333333-3333-3333-3333-333333333333';
  const mapelId = '44444444-4444-4444-4444-444444444444';
  const siswaId = '55555555-5555-5555-5555-555555555555';
  const komponenAngkaId = '66666666-6666-6666-6666-666666666666';
  const komponenHurufId = '77777777-7777-7777-7777-777777777777';
  const komponenDeskripsiId = '88888888-8888-8888-8888-888888888888';
  const tahunAjaranId = '99999999-9999-9999-9999-999999999999';

  // A simple mock db that won't be called directly in most tests
  // (we spy on private methods to avoid complex chain mocking)
  const mockDb = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RaporNilaiService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<RaporNilaiService>(RaporNilaiService);
  });

  // ═══════════════════════════════════════════════════════════════════
  // getGuruMapel Tests (Requirements: 37.1, 37.9)
  // ═══════════════════════════════════════════════════════════════════

  describe('getGuruMapel', () => {
    it('should return empty array when no active tahun_ajaran', async () => {
      jest.spyOn(service as any, 'getActiveTahunAjaran').mockResolvedValue(null);

      const result = await service.getGuruMapel(tenantId, guruId);
      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // saveNilai Tests (Requirements: 37.3–37.9)
  // ═══════════════════════════════════════════════════════════════════

  describe('saveNilai', () => {
    it('should throw ForbiddenException if guru is not assigned (Req 37.9)', async () => {
      jest
        .spyOn(service, 'validateGuruAssignment')
        .mockRejectedValue(
          new ForbiddenException(
            'Anda tidak ditugaskan untuk mata pelajaran ini di kelas tersebut',
          ),
        );

      await expect(
        service.saveNilai(tenantId, guruId, {
          kelas_id: kelasId,
          mata_pelajaran_id: mapelId,
          periode_rapor_id: 'uts_semester_1',
          nilai: [],
          status: 'draft',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for invalid periode (Req 37.3)', async () => {
      jest.spyOn(service, 'validateGuruAssignment').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getActiveTahunAjaran').mockResolvedValue({
        id: tahunAjaranId,
        nama: '2024/2025',
      });

      await expect(
        service.saveNilai(tenantId, guruId, {
          kelas_id: kelasId,
          mata_pelajaran_id: mapelId,
          periode_rapor_id: 'not_valid',
          nilai: [],
          status: 'draft',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no active tahun ajaran', async () => {
      jest.spyOn(service, 'validateGuruAssignment').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getActiveTahunAjaran').mockResolvedValue(null);

      await expect(
        service.saveNilai(tenantId, guruId, {
          kelas_id: kelasId,
          mata_pelajaran_id: mapelId,
          periode_rapor_id: 'uts_semester_1',
          nilai: [],
          status: 'draft',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // validateNilaiEntry (private method tested indirectly via saveNilai)
  // Since mocking the full DB chain for saveNilai is complex, we test
  // the validation logic directly using reflection.
  // Requirements: 37.3, 37.4, 37.5
  // ═══════════════════════════════════════════════════════════════════

  describe('validateNilaiEntry (private)', () => {
    const getValidator = () => (service as any).validateNilaiEntry.bind(service);

    const baseKomponenMap = new Map<string, any>([
      [
        komponenAngkaId,
        { id: komponenAngkaId, tipe: 'angka', skalaMin: 0, skalaMax: 100, isWajib: true },
      ],
      [
        komponenHurufId,
        { id: komponenHurufId, tipe: 'huruf', skalaMin: null, skalaMax: null, isWajib: true },
      ],
      [
        komponenDeskripsiId,
        {
          id: komponenDeskripsiId,
          tipe: 'deskripsi',
          skalaMin: null,
          skalaMax: null,
          isWajib: false,
        },
      ],
    ]);

    it('should accept valid angka value within range (Req 37.5)', () => {
      const validate = getValidator();
      expect(() =>
        validate(
          { siswa_id: siswaId, komponen: [{ komponen_id: komponenAngkaId, nilai: 85 }] },
          baseKomponenMap,
          true, // isUts
          'draft',
        ),
      ).not.toThrow();
    });

    it('should reject angka value exceeding skala_max (Req 37.5)', () => {
      const validate = getValidator();
      expect(() =>
        validate(
          { siswa_id: siswaId, komponen: [{ komponen_id: komponenAngkaId, nilai: 150 }] },
          baseKomponenMap,
          true,
          'draft',
        ),
      ).toThrow(BadRequestException);
    });

    it('should reject angka value below skala_min (Req 37.5)', () => {
      const validate = getValidator();
      expect(() =>
        validate(
          { siswa_id: siswaId, komponen: [{ komponen_id: komponenAngkaId, nilai: -5 }] },
          baseKomponenMap,
          true,
          'draft',
        ),
      ).toThrow(BadRequestException);
    });

    it('should accept valid huruf values A-E', () => {
      const validate = getValidator();
      for (const grade of ['A', 'B', 'C', 'D', 'E']) {
        expect(() =>
          validate(
            { siswa_id: siswaId, komponen: [{ komponen_id: komponenHurufId, nilai: grade }] },
            baseKomponenMap,
            true,
            'draft',
          ),
        ).not.toThrow();
      }
    });

    it('should reject invalid huruf values (Req 37.5)', () => {
      const validate = getValidator();
      expect(() =>
        validate(
          { siswa_id: siswaId, komponen: [{ komponen_id: komponenHurufId, nilai: 'X' }] },
          baseKomponenMap,
          true,
          'draft',
        ),
      ).toThrow(BadRequestException);
    });

    it('should reject empty deskripsi value', () => {
      const validate = getValidator();
      expect(() =>
        validate(
          { siswa_id: siswaId, komponen: [{ komponen_id: komponenDeskripsiId, nilai: '' }] },
          baseKomponenMap,
          true,
          'draft',
        ),
      ).toThrow(BadRequestException);
    });

    it('should accept non-empty deskripsi value', () => {
      const validate = getValidator();
      expect(() =>
        validate(
          {
            siswa_id: siswaId,
            komponen: [{ komponen_id: komponenDeskripsiId, nilai: 'Baik sekali' }],
          },
          baseKomponenMap,
          true,
          'draft',
        ),
      ).not.toThrow();
    });

    it('should reject unknown komponen_id', () => {
      const validate = getValidator();
      expect(() =>
        validate(
          { siswa_id: siswaId, komponen: [{ komponen_id: 'unknown-id', nilai: 50 }] },
          baseKomponenMap,
          true,
          'draft',
        ),
      ).toThrow(BadRequestException);
    });

    it('should require capaian_pembelajaran for semester when submitted (Req 37.4)', () => {
      const validate = getValidator();
      expect(() =>
        validate(
          {
            siswa_id: siswaId,
            komponen: [{ komponen_id: komponenAngkaId, nilai: 85 }],
            // no capaian_pembelajaran
          },
          baseKomponenMap,
          false, // NOT UTS → semester
          'submitted',
        ),
      ).toThrow(BadRequestException);
    });

    it('should NOT require capaian_pembelajaran for UTS even when submitted (Req 37.3)', () => {
      const validate = getValidator();
      expect(() =>
        validate(
          {
            siswa_id: siswaId,
            komponen: [{ komponen_id: komponenAngkaId, nilai: 85 }],
            // no capaian_pembelajaran
          },
          baseKomponenMap,
          true, // IS UTS
          'submitted',
        ),
      ).not.toThrow();
    });

    it('should NOT require capaian_pembelajaran for semester when draft (partial save allowed)', () => {
      const validate = getValidator();
      expect(() =>
        validate(
          {
            siswa_id: siswaId,
            komponen: [{ komponen_id: komponenAngkaId, nilai: 85 }],
            // no capaian_pembelajaran — but it's a draft, so OK
          },
          baseKomponenMap,
          false, // semester
          'draft',
        ),
      ).not.toThrow();
    });

    it('should accept string representation of valid angka', () => {
      const validate = getValidator();
      expect(() =>
        validate(
          { siswa_id: siswaId, komponen: [{ komponen_id: komponenAngkaId, nilai: '75' }] },
          baseKomponenMap,
          true,
          'draft',
        ),
      ).not.toThrow();
    });

    it('should reject non-numeric string for angka komponen', () => {
      const validate = getValidator();
      expect(() =>
        validate(
          { siswa_id: siswaId, komponen: [{ komponen_id: komponenAngkaId, nilai: 'abc' }] },
          baseKomponenMap,
          true,
          'draft',
        ),
      ).toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // validateGuruAssignment Tests (Requirements: 37.9)
  // ═══════════════════════════════════════════════════════════════════

  describe('validateGuruAssignment', () => {
    it('should throw ForbiddenException when no active tahun ajaran', async () => {
      jest.spyOn(service as any, 'getActiveTahunAjaran').mockResolvedValue(null);

      await expect(
        service.validateGuruAssignment(tenantId, guruId, kelasId, mapelId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
