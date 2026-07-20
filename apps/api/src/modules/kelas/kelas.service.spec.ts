import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { KelasService } from './kelas.service';
import { TenantService } from '@/modules/tenant/tenant.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';

/**
 * Creates a mock DB that tracks query chains.
 * Each call to select() starts a new "query chain" that resolves
 * sequentially through the queryResults array.
 */
function createMockDb(queryResults: any[]) {
  let callIndex = 0;

  const createChain = () => {
    const result = queryResults[callIndex++];
    const chain: any = {
      select: jest.fn(() => createChain()),
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(result),
      orderBy: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockResolvedValue(result),
      // For queries that end at where() without limit (e.g. count queries)
      then: (resolve: any) => resolve(result),
    };
    // Make the chain itself awaitable (for when there's no .limit())
    chain[Symbol.toStringTag] = 'Promise';
    return chain;
  };

  const mockDb: any = {
    select: jest.fn(() => createChain()),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn().mockResolvedValue(queryResults[callIndex++]),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn().mockResolvedValue(queryResults[callIndex++]),
        })),
      })),
    })),
    delete: jest.fn(() => ({
      where: jest.fn().mockResolvedValue(undefined),
    })),
  };

  return mockDb;
}

describe('KelasService', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const tahunAjaranId = '22222222-2222-2222-2222-222222222222';
  const kelasId = '33333333-3333-3333-3333-333333333333';
  const guruId = '44444444-4444-4444-4444-444444444444';

  const mockTenantService = {
    getJumlahTingkat: jest.fn().mockResolvedValue(6),
  } as unknown as TenantService;

  function buildService(queryResults: any[]): KelasService {
    const db = createMockDb(queryResults);
    const service = new KelasService(db, mockTenantService);
    return service;
  }

  // ─── createKelas ──────────────────────────────────────────────

  describe('createKelas', () => {
    const dto = {
      nama: '1A',
      tingkat: 1,
      tahunAjaranId,
    };

    it('should create a class successfully without wali_kelas', async () => {
      const service = buildService([
        // validateTahunAjaran: select().from().where().limit()
        [{ id: tahunAjaranId }],
        // insert().values().returning()
        [
          {
            id: kelasId,
            tenantId,
            tahunAjaranId,
            nama: '1A',
            tingkat: 1,
            waliKelasId: null,
            kapasitas: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      const result = await service.createKelas(tenantId, dto);

      expect(result.id).toBe(kelasId);
      expect(result.nama).toBe('1A');
      expect(result.tingkat).toBe(1);
      expect(result.waliKelasId).toBeNull();
    });

    it('should create a class with wali_kelas when guru is available', async () => {
      const dtoWithWali = { ...dto, waliKelasId: guruId };

      const service = buildService([
        // validateTahunAjaran
        [{ id: tahunAjaranId }],
        // validateWaliKelasUniqueness: guru exists check
        [{ id: guruId }],
        // validateWaliKelasUniqueness: no existing assignment
        [],
        // insert returning
        [
          {
            id: kelasId,
            tenantId,
            tahunAjaranId,
            nama: '1A',
            tingkat: 1,
            waliKelasId: guruId,
            kapasitas: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      const result = await service.createKelas(tenantId, dtoWithWali);

      expect(result.waliKelasId).toBe(guruId);
    });

    it('should throw NotFoundException if tahun_ajaran does not exist', async () => {
      const service = buildService([
        // validateTahunAjaran: not found
        [],
      ]);

      await expect(service.createKelas(tenantId, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if guru is already wali_kelas in the same tahun_ajaran', async () => {
      const dtoWithWali = { ...dto, waliKelasId: guruId };

      const service = buildService([
        // validateTahunAjaran
        [{ id: tahunAjaranId }],
        // guru exists
        [{ id: guruId }],
        // guru already assigned to another class
        [{ id: 'other-kelas', nama: '2B' }],
      ]);

      await expect(service.createKelas(tenantId, dtoWithWali)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if wali_kelas guru not found or not active', async () => {
      const dtoWithWali = { ...dto, waliKelasId: 'bad-guru-id' };

      const service = buildService([
        // validateTahunAjaran
        [{ id: tahunAjaranId }],
        // guru not found
        [],
      ]);

      await expect(service.createKelas(tenantId, dtoWithWali)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getKelasById ─────────────────────────────────────────────

  describe('getKelasById', () => {
    it('should return kelas with student count', async () => {
      const service = buildService([
        // kelas found
        [
          {
            id: kelasId,
            nama: '1A',
            tingkat: 1,
            tahunAjaranId,
            waliKelasId: guruId,
            kapasitas: 30,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        // student count
        [{ count: 25 }],
      ]);

      const result = await service.getKelasById(tenantId, kelasId);

      expect(result.id).toBe(kelasId);
      expect(result.nama).toBe('1A');
      expect(result.jumlahSiswa).toBe(25);
    });

    it('should throw NotFoundException if kelas not found', async () => {
      const service = buildService([
        // kelas not found
        [],
      ]);

      await expect(service.getKelasById(tenantId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── updateKelas ──────────────────────────────────────────────

  describe('updateKelas', () => {
    it('should update kelas nama successfully', async () => {
      const service = buildService([
        // getKelasById: kelas found
        [
          {
            id: kelasId,
            nama: '1A',
            tingkat: 1,
            tahunAjaranId,
            waliKelasId: null,
            kapasitas: 30,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        // getKelasById: student count
        [{ count: 0 }],
        // update returning
        [
          {
            id: kelasId,
            nama: '1B',
            tingkat: 1,
            tahunAjaranId,
            waliKelasId: null,
            kapasitas: 30,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      const result = await service.updateKelas(tenantId, kelasId, { nama: '1B' });

      expect(result.nama).toBe('1B');
    });

    it('should validate wali_kelas uniqueness on update and throw ConflictException', async () => {
      const service = buildService([
        // getKelasById: kelas found
        [
          {
            id: kelasId,
            nama: '1A',
            tingkat: 1,
            tahunAjaranId,
            waliKelasId: null,
            kapasitas: 30,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        // getKelasById: student count
        [{ count: 0 }],
        // validateWaliKelasUniqueness: guru exists
        [{ id: guruId }],
        // validateWaliKelasUniqueness: guru already assigned
        [{ id: 'other-kelas', nama: '2B' }],
      ]);

      await expect(service.updateKelas(tenantId, kelasId, { waliKelasId: guruId })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── deleteKelas ──────────────────────────────────────────────

  describe('deleteKelas', () => {
    it('should delete kelas when no active students', async () => {
      const service = buildService([
        // getKelasById: kelas found
        [
          {
            id: kelasId,
            nama: '1A',
            tingkat: 1,
            tahunAjaranId,
            waliKelasId: null,
            kapasitas: 30,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        // getKelasById: student count = 0
        [{ count: 0 }],
        // deleteKelas: student count check = 0
        [{ count: 0 }],
      ]);

      const result = await service.deleteKelas(tenantId, kelasId);

      expect(result.deleted).toBe(true);
    });

    it('should throw BadRequestException when kelas has active students', async () => {
      const service = buildService([
        // getKelasById: kelas found
        [
          {
            id: kelasId,
            nama: '1A',
            tingkat: 1,
            tahunAjaranId,
            waliKelasId: null,
            kapasitas: 30,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        // getKelasById: student count = 15
        [{ count: 15 }],
        // deleteKelas: student count check = 15
        [{ count: 15 }],
      ]);

      await expect(service.deleteKelas(tenantId, kelasId)).rejects.toThrow(BadRequestException);
    });

    it('should include student count in error message when deletion fails', async () => {
      const service = buildService([
        // getKelasById: kelas found
        [
          {
            id: kelasId,
            nama: '1A',
            tingkat: 1,
            tahunAjaranId,
            waliKelasId: null,
            kapasitas: 30,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        // getKelasById: student count = 7
        [{ count: 7 }],
        // deleteKelas: student count check = 7
        [{ count: 7 }],
      ]);

      try {
        await service.deleteKelas(tenantId, kelasId);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toContain('7');
      }
    });
  });

  // ─── duplicateClassStructure ──────────────────────────────────

  describe('duplicateClassStructure', () => {
    const newTahunAjaranId = '55555555-5555-5555-5555-555555555555';

    it('should duplicate all classes from source to target tahun_ajaran', async () => {
      const service = buildService([
        // source classes
        [
          { nama: '1A', tingkat: 1, kapasitas: 30 },
          { nama: '1B', tingkat: 1, kapasitas: 30 },
          { nama: '2A', tingkat: 2, kapasitas: 28 },
        ],
        // insert (bulk) — no returning needed
        undefined,
      ]);

      const result = await service.duplicateClassStructure(
        tenantId,
        tahunAjaranId,
        newTahunAjaranId,
      );

      expect(result.duplicated).toBe(3);
    });

    it('should return duplicated: 0 when source has no classes', async () => {
      const service = buildService([
        // source classes: empty
        [],
      ]);

      const result = await service.duplicateClassStructure(
        tenantId,
        tahunAjaranId,
        newTahunAjaranId,
      );

      expect(result.duplicated).toBe(0);
    });
  });

  // ─── listKelas ────────────────────────────────────────────────

  describe('listKelas', () => {
    it('should return list with resolved names and student counts', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({
        id: `kelas-${String(i).padStart(3, '0')}`,
        nama: `${Math.floor(i / 3) + 1}${String.fromCharCode(65 + (i % 3))}`,
        tingkat: Math.floor(i / 3) + 1,
        tahunAjaranId,
        tahunAjaranNama: '2024/2025',
        waliKelasId: null,
        waliKelasNama: null,
        kapasitas: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // First call: main query; Second call: student counts
      const service = buildService([items, []]);

      const result = await service.listKelas(tenantId, {});

      expect(result.data).toHaveLength(20);
    });

    it('should return all items when less than page size', async () => {
      const service = buildService([
        [
          {
            id: kelasId,
            nama: '1A',
            tingkat: 1,
            tahunAjaranId,
            tahunAjaranNama: '2024/2025',
            waliKelasId: null,
            waliKelasNama: null,
            kapasitas: 30,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        [], // student counts
      ]);

      const result = await service.listKelas(tenantId, {});

      expect(result.data).toHaveLength(1);
      expect(result.data[0].wali_kelas_nama).toBeNull();
      expect(result.data[0].tahun_ajaran_nama).toBe('2024/2025');
    });
  });
});
