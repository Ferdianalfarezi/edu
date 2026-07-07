import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { RaporOrangTuaService } from './rapor-orangtua.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';

/**
 * RaporOrangTuaService Unit Tests
 * Verifies rapor data retrieval logic for orang_tua.
 *
 * Requirements: 39.1–39.5
 */
describe('RaporOrangTuaService', () => {
  let service: RaporOrangTuaService;

  const parentUserId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const siswaId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const tenantId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const otherParentId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  /**
   * Helper: creates a chainable DB mock that yields different results per sequential .where() call.
   */
  function createSequentialDb(queryResults: any[][]) {
    let callIndex = 0;
    const chain: any = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockImplementation(() => {
      const result = queryResults[callIndex] ?? [];
      callIndex++;
      return Promise.resolve(result);
    });
    chain.innerJoin = jest.fn().mockReturnValue(chain);
    return chain;
  }

  beforeEach(async () => {
    const mockDb = createSequentialDb([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [RaporOrangTuaService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<RaporOrangTuaService>(RaporOrangTuaService);
  });

  describe('getRaporSiswa', () => {
    it('should throw NotFoundException if siswa does not exist', async () => {
      const db = createSequentialDb([
        [], // siswa lookup - not found
      ]);
      Object.defineProperty(service, 'db', { value: db, writable: true });

      await expect(service.getRaporSiswa(parentUserId, siswaId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if parent does not own the child', async () => {
      const db = createSequentialDb([
        // siswa lookup - owned by different parent
        [
          {
            id: siswaId,
            nama: 'Anak Test',
            orangTuaId: otherParentId,
            kelasId: 'kelas-1',
            tenantId,
          },
        ],
      ]);
      Object.defineProperty(service, 'db', { value: db, writable: true });

      await expect(service.getRaporSiswa(parentUserId, siswaId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return empty array when no finalized rapor exists', async () => {
      const db = createSequentialDb([
        // siswa lookup - valid ownership
        [
          {
            id: siswaId,
            nama: 'Anak Test',
            orangTuaId: parentUserId,
            kelasId: 'kelas-1',
            tenantId,
          },
        ],
        // rapor lookup - no final rapors
        [],
      ]);
      Object.defineProperty(service, 'db', { value: db, writable: true });

      const result = await service.getRaporSiswa(parentUserId, siswaId);
      expect(result).toEqual([]);
    });

    it('should return finalized rapor with nilai, peringkat, rata-rata, catatan, and P5', async () => {
      const raporId = 'rapor-111';
      const mapelId = 'mapel-1';
      const taId = 'ta-1';

      const db = createSequentialDb([
        // 1. siswa lookup - valid
        [
          {
            id: siswaId,
            nama: 'Anak Test',
            orangTuaId: parentUserId,
            kelasId: 'kelas-1',
            tenantId,
          },
        ],
        // 2. rapor lookup - one finalized rapor
        [
          {
            raporId,
            periode: 'semester_1',
            tahunAjaranId: taId,
            kelasId: 'kelas-1',
          },
        ],
        // 3. raporNilai for student in this rapor
        [
          {
            mataPelajaranId: mapelId,
            komponenNilai: [{ komponen_id: 'k1', nilai: 90 }],
            capaianPembelajaran: 'Menguasai konsep dasar',
            peringkat: 2,
            rataRata: '87.50',
            catatanWaliKelas: 'Rajin belajar',
            p5Deskripsi: [{ dimensi: 'Mandiri', deskripsi: 'Sangat baik' }],
          },
        ],
        // 4. tahunAjaran name lookup
        [{ nama: '2024/2025' }],
        // 5. mataPelajaran name lookup
        [{ nama: 'Matematika' }],
      ]);
      Object.defineProperty(service, 'db', { value: db, writable: true });

      const result = await service.getRaporSiswa(parentUserId, siswaId);

      expect(result).toHaveLength(1);
      expect(result[0].rapor_id).toBe(raporId);
      expect(result[0].periode).toBe('semester_1');
      expect(result[0].tahun_ajaran).toBe('2024/2025');
      expect(result[0].nilai).toHaveLength(1);
      expect(result[0].nilai[0].mapel).toBe('Matematika');
      expect(result[0].nilai[0].komponen_nilai).toEqual([{ komponen_id: 'k1', nilai: 90 }]);
      expect(result[0].nilai[0].capaian_pembelajaran).toBe('Menguasai konsep dasar');
      expect(result[0].peringkat).toBe(2);
      expect(result[0].rata_rata).toBe('87.50');
      expect(result[0].catatan_wali_kelas).toBe('Rajin belajar');
      expect(result[0].p5_deskripsi).toEqual([{ dimensi: 'Mandiri', deskripsi: 'Sangat baik' }]);
    });

    it('should skip rapor periods where student has no nilai entries', async () => {
      const raporId1 = 'rapor-111';
      const raporId2 = 'rapor-222';
      const taId = 'ta-1';
      const mapelId = 'mapel-1';

      const db = createSequentialDb([
        // 1. siswa lookup - valid
        [
          {
            id: siswaId,
            nama: 'Anak Test',
            orangTuaId: parentUserId,
            kelasId: 'kelas-1',
            tenantId,
          },
        ],
        // 2. rapor lookup - two finalized rapors
        [
          { raporId: raporId1, periode: 'semester_1', tahunAjaranId: taId, kelasId: 'kelas-1' },
          { raporId: raporId2, periode: 'semester_2', tahunAjaranId: taId, kelasId: 'kelas-1' },
        ],
        // 3. raporNilai for first rapor - has entries
        [
          {
            mataPelajaranId: mapelId,
            komponenNilai: [{ komponen_id: 'k1', nilai: 75 }],
            capaianPembelajaran: null,
            peringkat: 5,
            rataRata: '75.00',
            catatanWaliKelas: null,
            p5Deskripsi: null,
          },
        ],
        // 4. tahunAjaran name for first rapor
        [{ nama: '2024/2025' }],
        // 5. mataPelajaran name for first rapor
        [{ nama: 'Bahasa Indonesia' }],
        // 6. raporNilai for second rapor - empty (student has no grades here)
        [],
      ]);
      Object.defineProperty(service, 'db', { value: db, writable: true });

      const result = await service.getRaporSiswa(parentUserId, siswaId);

      // Only the first rapor should be returned (second has no nilai)
      expect(result).toHaveLength(1);
      expect(result[0].periode).toBe('semester_1');
    });
  });
});
