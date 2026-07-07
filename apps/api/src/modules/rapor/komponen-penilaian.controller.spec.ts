import { Test, TestingModule } from '@nestjs/testing';
import { KomponenPenilaianController } from './komponen-penilaian.controller';
import { KomponenPenilaianService } from './komponen-penilaian.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';

describe('KomponenPenilaianController', () => {
  let controller: KomponenPenilaianController;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const KOMPONEN_ID = '22222222-2222-2222-2222-222222222222';

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    initDefaults: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KomponenPenilaianController],
      providers: [
        { provide: KomponenPenilaianService, useValue: mockService },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    controller = module.get<KomponenPenilaianController>(KomponenPenilaianController);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('POST /rapor/komponen', () => {
    it('should create a new assessment component', async () => {
      const dto = { nama: 'UTS', tipe: 'angka' as const, skala_min: 0, skala_max: 100 };
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
      mockService.create.mockResolvedValue(created);

      const result = await controller.create(TENANT_ID, dto);

      expect(result).toEqual(created);
      expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, dto);
    });
  });

  describe('GET /rapor/komponen', () => {
    it('should return all components for tenant', async () => {
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
          nama: 'Sikap',
          tipe: 'huruf',
          skala_min: null,
          skala_max: null,
          is_wajib: true,
          urutan: 2,
          created_at: new Date(),
        },
      ];
      mockService.findAll.mockResolvedValue(components);

      const result = await controller.findAll(TENANT_ID);

      expect(result).toHaveLength(2);
      expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID);
    });
  });

  describe('PATCH /rapor/komponen/:id', () => {
    it('should update an assessment component', async () => {
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
      mockService.update.mockResolvedValue(updated);

      const result = await controller.update(TENANT_ID, KOMPONEN_ID, dto);

      expect(result).toEqual(updated);
      expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, KOMPONEN_ID, dto);
    });
  });

  describe('DELETE /rapor/komponen/:id', () => {
    it('should delete a component', async () => {
      mockService.delete.mockResolvedValue(undefined);

      await expect(controller.delete(TENANT_ID, KOMPONEN_ID)).resolves.toBeUndefined();
      expect(mockService.delete).toHaveBeenCalledWith(TENANT_ID, KOMPONEN_ID);
    });
  });

  describe('POST /rapor/komponen/init-defaults', () => {
    it('should initialize Kurikulum Merdeka defaults', async () => {
      const defaults = [
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
          nama: 'Sikap',
          tipe: 'huruf',
          skala_min: null,
          skala_max: null,
          is_wajib: true,
          urutan: 3,
          created_at: new Date(),
        },
        {
          id: '4',
          nama: 'P5',
          tipe: 'deskripsi',
          skala_min: null,
          skala_max: null,
          is_wajib: false,
          urutan: 4,
          created_at: new Date(),
        },
      ];
      mockService.initDefaults.mockResolvedValue(defaults);

      const result = await controller.initDefaults(TENANT_ID);

      expect(result).toHaveLength(4);
      expect(mockService.initDefaults).toHaveBeenCalledWith(TENANT_ID);
    });
  });
});
