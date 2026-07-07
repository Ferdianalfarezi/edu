import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KenaikanKelasService } from './kenaikan-kelas.service';

/**
 * Creates a mock DB that tracks query chains for sequential resolution.
 * Each select/insert/update call consumes the next entry from queryResults.
 */
function createMockDb(queryResults: any[]) {
  let callIndex = 0;

  const createSelectChain = () => {
    const result = queryResults[callIndex++];
    const chain: any = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(result),
      orderBy: jest.fn().mockReturnThis(),
      then: (resolve: any) => resolve(result),
    };
    chain[Symbol.toStringTag] = 'Promise';
    return chain;
  };

  const mockDb: any = {
    select: jest.fn(() => createSelectChain()),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn().mockResolvedValue(queryResults[callIndex++]),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn().mockResolvedValue(queryResults[callIndex++]),
      })),
    })),
  };

  return mockDb;
}

describe('KenaikanKelasService', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const sourceKelasId = '22222222-2222-2222-2222-222222222222';
  const targetKelasId = '33333333-3333-3333-3333-333333333333';
  const tahunAjaranBaruId = '44444444-4444-4444-4444-444444444444';
  const tahunAjaranLamaId = '55555555-5555-5555-5555-555555555555';
  const siswaId1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const siswaId2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const siswaId3 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  function buildService(queryResults: any[]): KenaikanKelasService {
    const db = createMockDb(queryResults);
    return new KenaikanKelasService(db);
  }

  // ─── getStudentsForPromotion ──────────────────────────────────

  describe('getStudentsForPromotion', () => {
    it('should return students list and suggested target class', async () => {
      const service = buildService([
        // 1. source kelas found
        [{ id: sourceKelasId, nama: '5A', tingkat: 5, tahunAjaranId: tahunAjaranLamaId }],
        // 2. active students in source kelas
        [
          { siswaId: siswaId1, nama: 'Budi', nisn: '001' },
          { siswaId: siswaId2, nama: 'Ani', nisn: '002' },
        ],
        // 3. prepared tahun ajaran
        [{ id: tahunAjaranBaruId, nama: '2025/2026' }],
        // 4. target kelas at tingkat+1 in prepared tahun ajaran
        [{ id: targetKelasId, nama: '6A', tingkat: 6 }],
      ]);

      const result = await service.getStudentsForPromotion(tenantId, sourceKelasId);

      expect(result.currentKelas.id).toBe(sourceKelasId);
      expect(result.currentKelas.tingkat).toBe(5);
      expect(result.students).toHaveLength(2);
      expect(result.students[0].nama).toBe('Budi');
      expect(result.suggestedTarget).not.toBeNull();
      expect(result.suggestedTarget!.kelasId).toBe(targetKelasId);
      expect(result.suggestedTarget!.tingkat).toBe(6);
    });

    it('should return null suggestedTarget when no prepared tahun_ajaran exists', async () => {
      const service = buildService([
        // 1. source kelas found
        [{ id: sourceKelasId, nama: '5A', tingkat: 5, tahunAjaranId: tahunAjaranLamaId }],
        // 2. active students
        [{ siswaId: siswaId1, nama: 'Budi', nisn: '001' }],
        // 3. no prepared tahun ajaran
        [],
      ]);

      const result = await service.getStudentsForPromotion(tenantId, sourceKelasId);

      expect(result.suggestedTarget).toBeNull();
    });

    it('should throw NotFoundException when source kelas not found', async () => {
      const service = buildService([
        // kelas not found
        [],
      ]);

      await expect(service.getStudentsForPromotion(tenantId, 'nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty students list when no active students in class', async () => {
      const service = buildService([
        // 1. source kelas found
        [{ id: sourceKelasId, nama: '5A', tingkat: 5, tahunAjaranId: tahunAjaranLamaId }],
        // 2. no active students
        [],
        // 3. prepared tahun ajaran
        [{ id: tahunAjaranBaruId, nama: '2025/2026' }],
        // 4. target class exists
        [{ id: targetKelasId, nama: '6A', tingkat: 6 }],
      ]);

      const result = await service.getStudentsForPromotion(tenantId, sourceKelasId);

      expect(result.students).toHaveLength(0);
      expect(result.suggestedTarget).not.toBeNull();
    });

    it('should return null suggestedTarget when target tingkat class does not exist', async () => {
      const service = buildService([
        // 1. source kelas found
        [{ id: sourceKelasId, nama: '6A', tingkat: 6, tahunAjaranId: tahunAjaranLamaId }],
        // 2. active students
        [{ siswaId: siswaId1, nama: 'Budi', nisn: '001' }],
        // 3. prepared tahun ajaran exists
        [{ id: tahunAjaranBaruId, nama: '2025/2026' }],
        // 4. no class at tingkat 7
        [],
      ]);

      const result = await service.getStudentsForPromotion(tenantId, sourceKelasId);

      expect(result.suggestedTarget).toBeNull();
    });
  });

  // ─── promoteStudents ──────────────────────────────────────────

  describe('promoteStudents', () => {
    const baseDto = {
      sourceKelasId,
      targetKelasId,
      tahunAjaranBaruId,
      siswaIds: [siswaId1, siswaId2],
    };

    it('should promote students to target class successfully', async () => {
      const service = buildService([
        // 1. tahun ajaran baru exists
        [{ id: tahunAjaranBaruId, status: 'disiapkan' }],
        // 2. source kelas exists
        [{ id: sourceKelasId, nama: '5A', tingkat: 5, tahunAjaranId: tahunAjaranLamaId }],
        // 3. target kelas exists and belongs to tahun_ajaran_baru
        [{ id: targetKelasId, nama: '6A', tingkat: 6, tahunAjaranId: tahunAjaranBaruId }],
        // 4. active students in source kelas
        [{ id: siswaId1 }, { id: siswaId2 }],
        // 5. update (promote students)
        undefined,
        // 6. insert riwayat_kelas
        undefined,
      ]);

      const result = await service.promoteStudents(tenantId, baseDto);

      expect(result.promoted).toBe(2);
      expect(result.lulus).toBe(0);
      expect(result.targetKelas.id).toBe(targetKelasId);
      expect(result.sourceKelas.id).toBe(sourceKelasId);
    });

    it('should mark lulus students as alumni and not move them to target', async () => {
      const dto = {
        ...baseDto,
        siswaIds: [siswaId1],
        lulusIds: [siswaId3],
      };

      const service = buildService([
        // 1. tahun ajaran baru exists
        [{ id: tahunAjaranBaruId, status: 'disiapkan' }],
        // 2. source kelas exists
        [{ id: sourceKelasId, nama: '6A', tingkat: 6, tahunAjaranId: tahunAjaranLamaId }],
        // 3. target kelas exists
        [{ id: targetKelasId, nama: '1A-SMP', tingkat: 7, tahunAjaranId: tahunAjaranBaruId }],
        // 4. active students in source (for siswaIds validation)
        [{ id: siswaId1 }],
        // 5. active students in source (for lulusIds validation)
        [{ id: siswaId3 }],
        // 6. update promoted students
        undefined,
        // 7. update lulus students
        undefined,
        // 8. insert riwayat_kelas
        undefined,
      ]);

      const result = await service.promoteStudents(tenantId, dto);

      expect(result.promoted).toBe(1);
      expect(result.lulus).toBe(1);
    });

    it('should throw NotFoundException when tahun_ajaran_baru not found', async () => {
      const service = buildService([
        // tahun ajaran baru not found
        [],
      ]);

      await expect(service.promoteStudents(tenantId, baseDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when source kelas not found', async () => {
      const service = buildService([
        // 1. tahun ajaran found
        [{ id: tahunAjaranBaruId, status: 'disiapkan' }],
        // 2. source kelas not found
        [],
      ]);

      await expect(service.promoteStudents(tenantId, baseDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when target kelas not found', async () => {
      const service = buildService([
        // 1. tahun ajaran found
        [{ id: tahunAjaranBaruId, status: 'disiapkan' }],
        // 2. source kelas found
        [{ id: sourceKelasId, nama: '5A', tingkat: 5, tahunAjaranId: tahunAjaranLamaId }],
        // 3. target kelas not found
        [],
      ]);

      await expect(service.promoteStudents(tenantId, baseDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when target kelas does not belong to tahun_ajaran_baru', async () => {
      const service = buildService([
        // 1. tahun ajaran found
        [{ id: tahunAjaranBaruId, status: 'disiapkan' }],
        // 2. source kelas found
        [{ id: sourceKelasId, nama: '5A', tingkat: 5, tahunAjaranId: tahunAjaranLamaId }],
        // 3. target kelas exists but belongs to a DIFFERENT tahun_ajaran
        [{ id: targetKelasId, nama: '6A', tingkat: 6, tahunAjaranId: 'wrong-tahun-ajaran' }],
      ]);

      await expect(service.promoteStudents(tenantId, baseDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when some students are not in source kelas', async () => {
      const service = buildService([
        // 1. tahun ajaran found
        [{ id: tahunAjaranBaruId, status: 'disiapkan' }],
        // 2. source kelas found
        [{ id: sourceKelasId, nama: '5A', tingkat: 5, tahunAjaranId: tahunAjaranLamaId }],
        // 3. target kelas found
        [{ id: targetKelasId, nama: '6A', tingkat: 6, tahunAjaranId: tahunAjaranBaruId }],
        // 4. only siswaId1 is active (siswaId2 not found)
        [{ id: siswaId1 }],
      ]);

      await expect(service.promoteStudents(tenantId, baseDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when student is in both siswaIds and lulusIds', async () => {
      const dto = {
        ...baseDto,
        siswaIds: [siswaId1],
        lulusIds: [siswaId1], // overlap!
      };

      const service = buildService([
        // 1. tahun ajaran found
        [{ id: tahunAjaranBaruId, status: 'disiapkan' }],
        // 2. source kelas found
        [{ id: sourceKelasId, nama: '6A', tingkat: 6, tahunAjaranId: tahunAjaranLamaId }],
        // 3. target kelas found
        [{ id: targetKelasId, nama: '7A', tingkat: 7, tahunAjaranId: tahunAjaranBaruId }],
        // 4. active students validation for siswaIds
        [{ id: siswaId1 }],
        // 5. active students validation for lulusIds
        [{ id: siswaId1 }],
      ]);

      await expect(service.promoteStudents(tenantId, dto)).rejects.toThrow(BadRequestException);
    });
  });
});
