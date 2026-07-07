import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { KomponenPenilaianService, KURIKULUM_MERDEKA_DEFAULTS } from './komponen-penilaian.service';

describe('KomponenPenilaianService', () => {
  let service: KomponenPenilaianService;
  let mockDb: any;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const KOMPONEN_ID = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [KomponenPenilaianService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<KomponenPenilaianService>(KomponenPenilaianService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('create', () => {
    it('should create an angka-type component with skala defaults', async () => {
      const dto = { nama: 'UTS', tipe: 'angka' as const };
      const created = {
        id: KOMPONEN_ID,
        nama: 'UTS',
        tipe: 'angka',
        skala_min: 0,
        skala_max: 100,
        is_wajib: true,
        urutan: 0,
        created_at: new Date(),
      };
      mockDb.returning.mockResolvedValue([created]);

      const result = await service.create(TENANT_ID, dto);

      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          nama: 'UTS',
          tipe: 'angka',
          skalaMin: 0,
          skalaMax: 100,
          isWajib: true,
        }),
      );
    });

    it('should create a huruf-type component with null skala', async () => {
      const dto = { nama: 'Sikap', tipe: 'huruf' as const, is_wajib: true };
      const created = {
        id: KOMPONEN_ID,
        nama: 'Sikap',
        tipe: 'huruf',
        skala_min: null,
        skala_max: null,
        is_wajib: true,
        urutan: 0,
        created_at: new Date(),
      };
      mockDb.returning.mockResolvedValue([created]);

      const result = await service.create(TENANT_ID, dto);

      expect(result.tipe).toBe('huruf');
      expect(result.skala_min).toBeNull();
      expect(result.skala_max).toBeNull();
      // Verify skala fields are explicitly set to null for non-angka type
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          skalaMin: null,
          skalaMax: null,
        }),
      );
    });

    it('should create a deskripsi-type component marked optional', async () => {
      const dto = { nama: 'P5', tipe: 'deskripsi' as const, is_wajib: false, urutan: 4 };
      const created = {
        id: KOMPONEN_ID,
        nama: 'P5',
        tipe: 'deskripsi',
        skala_min: null,
        skala_max: null,
        is_wajib: false,
        urutan: 4,
        created_at: new Date(),
      };
      mockDb.returning.mockResolvedValue([created]);

      const result = await service.create(TENANT_ID, dto);

      expect(result.is_wajib).toBe(false);
      expect(result.urutan).toBe(4);
    });

    it('should use custom skala values for angka type', async () => {
      const dto = { nama: 'Nilai', tipe: 'angka' as const, skala_min: 10, skala_max: 200 };
      const created = {
        id: KOMPONEN_ID,
        nama: 'Nilai',
        tipe: 'angka',
        skala_min: 10,
        skala_max: 200,
        is_wajib: true,
        urutan: 0,
        created_at: new Date(),
      };
      mockDb.returning.mockResolvedValue([created]);

      await service.create(TENANT_ID, dto);

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          skalaMin: 10,
          skalaMax: 200,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return all components ordered by urutan', async () => {
      const components = [
        {
          id: '1',
          nama: 'Pengetahuan',
          tipe: 'angka',
          skala_min: 0,
          skala_max: 100,
          is_wajib: true,
          urutan: 1,
          created_at: new Date(),
        },
        {
          id: '2',
          nama: 'Keterampilan',
          tipe: 'angka',
          skala_min: 0,
          skala_max: 100,
          is_wajib: true,
          urutan: 2,
          created_at: new Date(),
        },
        {
          id: '3',
          nama: 'P5',
          tipe: 'deskripsi',
          skala_min: null,
          skala_max: null,
          is_wajib: false,
          urutan: 4,
          created_at: new Date(),
        },
      ];
      mockDb.orderBy.mockResolvedValue(components);

      const result = await service.findAll(TENANT_ID);

      expect(result).toHaveLength(3);
      expect(result[0].nama).toBe('Pengetahuan');
      expect(result[2].is_wajib).toBe(false);
    });

    it('should return empty array when no components exist', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      const result = await service.findAll(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update component fields and return updated result', async () => {
      const dto = { nama: 'UAS', skala_max: 200 };
      const updated = {
        id: KOMPONEN_ID,
        nama: 'UAS',
        tipe: 'angka',
        skala_min: 0,
        skala_max: 200,
        is_wajib: true,
        urutan: 1,
        created_at: new Date(),
      };
      mockDb.returning.mockResolvedValue([updated]);

      const result = await service.update(TENANT_ID, KOMPONEN_ID, dto);

      expect(result.nama).toBe('UAS');
      expect(result.skala_max).toBe(200);
    });

    it('should throw NotFoundException when component does not exist', async () => {
      mockDb.returning.mockResolvedValue([]);

      await expect(service.update(TENANT_ID, KOMPONEN_ID, { nama: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should clear skala fields when changing type to huruf', async () => {
      const dto = { tipe: 'huruf' as const };
      const updated = {
        id: KOMPONEN_ID,
        nama: 'Sikap',
        tipe: 'huruf',
        skala_min: null,
        skala_max: null,
        is_wajib: true,
        urutan: 1,
        created_at: new Date(),
      };
      mockDb.returning.mockResolvedValue([updated]);

      const result = await service.update(TENANT_ID, KOMPONEN_ID, dto);

      expect(result.tipe).toBe('huruf');
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          tipe: 'huruf',
          skalaMin: null,
          skalaMax: null,
        }),
      );
    });

    it('should return existing when no fields to update and component exists', async () => {
      const existing = {
        id: KOMPONEN_ID,
        nama: 'UTS',
        tipe: 'angka',
        skala_min: 0,
        skala_max: 100,
        is_wajib: true,
        urutan: 1,
        created_at: new Date(),
      };
      // For the findById call path (select -> from -> where returns results)
      mockDb.where.mockResolvedValue([existing]);

      const result = await service.update(TENANT_ID, KOMPONEN_ID, {});

      expect(result).toEqual(existing);
    });
  });

  describe('delete', () => {
    it('should delete component when not referenced in rapor_nilai', async () => {
      // execute (JSONB check) returns no rows
      mockDb.execute.mockResolvedValue({ rows: [] });
      // delete returning finds the component
      mockDb.returning.mockResolvedValue([{ id: KOMPONEN_ID }]);

      await expect(service.delete(TENANT_ID, KOMPONEN_ID)).resolves.toBeUndefined();
    });

    it('should throw ConflictException when component is referenced in rapor_nilai', async () => {
      // execute (JSONB check) returns a row
      mockDb.execute.mockResolvedValue({ rows: [{ '?column?': 1 }] });

      await expect(service.delete(TENANT_ID, KOMPONEN_ID)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when component does not exist', async () => {
      mockDb.execute.mockResolvedValue({ rows: [] });
      mockDb.returning.mockResolvedValue([]);

      await expect(service.delete(TENANT_ID, KOMPONEN_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('initDefaults', () => {
    it('should create Kurikulum Merdeka default components for new tenant', async () => {
      // No existing components
      mockDb.limit.mockResolvedValue([]);

      const defaults = KURIKULUM_MERDEKA_DEFAULTS.map((d, i) => ({
        id: `default-${i}`,
        nama: d.nama,
        tipe: d.tipe,
        skala_min: d.skalaMin,
        skala_max: d.skalaMax,
        is_wajib: d.isWajib,
        urutan: d.urutan,
        created_at: new Date(),
      }));
      mockDb.returning.mockResolvedValue(defaults);

      const result = await service.initDefaults(TENANT_ID);

      expect(result).toHaveLength(4);
      expect(result[0].nama).toBe('Pengetahuan');
      expect(result[0].tipe).toBe('angka');
      expect(result[0].skala_min).toBe(0);
      expect(result[0].skala_max).toBe(100);
      expect(result[1].nama).toBe('Keterampilan');
      expect(result[2].nama).toBe('Sikap');
      expect(result[2].tipe).toBe('huruf');
      expect(result[3].nama).toBe('P5');
      expect(result[3].tipe).toBe('deskripsi');
      expect(result[3].is_wajib).toBe(false);
    });

    it('should throw ConflictException when tenant already has components', async () => {
      // Existing components found
      mockDb.limit.mockResolvedValue([{ id: 'existing-id' }]);

      await expect(service.initDefaults(TENANT_ID)).rejects.toThrow(ConflictException);
    });

    it('should include P5 as optional (is_wajib=false) in defaults', () => {
      const p5 = KURIKULUM_MERDEKA_DEFAULTS.find((d) => d.nama === 'P5');
      expect(p5).toBeDefined();
      expect(p5!.tipe).toBe('deskripsi');
      expect(p5!.isWajib).toBe(false);
    });
  });
});
