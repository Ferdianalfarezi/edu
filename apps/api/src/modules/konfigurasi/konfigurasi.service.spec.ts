import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { TenantService } from '@/modules/tenant/tenant.service';
import { KonfigurasiService, DEFAULT_CONFIG } from './konfigurasi.service';

describe('KonfigurasiService', () => {
  let service: KonfigurasiService;
  let mockDb: any;
  let mockTenantService: { getJumlahTingkat: jest.Mock };

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      delete: jest.fn().mockReturnThis(),
    };

    mockTenantService = {
      getJumlahTingkat: jest.fn().mockResolvedValue(3),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KonfigurasiService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: TenantService, useValue: mockTenantService },
      ],
    }).compile();

    service = module.get<KonfigurasiService>(KonfigurasiService);
  });

  describe('getAllConfig', () => {
    it('should return defaults when no config is stored', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await service.getAllConfig(TENANT_ID);

      expect(result).toHaveLength(Object.keys(DEFAULT_CONFIG).length);
      expect(result.find((r) => r.key === 'threshold_alpa')).toEqual({
        key: 'threshold_alpa',
        value: { value: 10 },
      });
      expect(result.find((r) => r.key === 'nominal_spp')).toEqual({
        key: 'nominal_spp',
        value: {
          tingkat_1: 250000,
          tingkat_2: 275000,
          tingkat_3: 300000,
          tingkat_4: 325000,
          tingkat_5: 350000,
          tingkat_6: 375000,
        },
      });
      expect(result.find((r) => r.key === 'tanggal_jatuh_tempo')).toEqual({
        key: 'tanggal_jatuh_tempo',
        value: { hari: 10 },
      });
    });

    it('should override defaults with stored values', async () => {
      mockDb.where.mockResolvedValue([{ key: 'threshold_alpa', value: { value: 5 } }]);

      const result = await service.getAllConfig(TENANT_ID);

      expect(result.find((r) => r.key === 'threshold_alpa')).toEqual({
        key: 'threshold_alpa',
        value: { value: 5 },
      });
      // Non-overridden keys still use defaults
      expect(result.find((r) => r.key === 'nominal_spp')?.value).toEqual(
        DEFAULT_CONFIG['nominal_spp'],
      );
    });

    it('should include custom keys not in defaults', async () => {
      mockDb.where.mockResolvedValue([{ key: 'custom_setting', value: { enabled: true } }]);

      const result = await service.getAllConfig(TENANT_ID);

      expect(result.find((r) => r.key === 'custom_setting')).toEqual({
        key: 'custom_setting',
        value: { enabled: true },
      });
      // Still includes defaults
      expect(result.length).toBe(Object.keys(DEFAULT_CONFIG).length + 1);
    });
  });

  describe('getConfigByKey', () => {
    it('should return stored value when key exists in DB', async () => {
      mockDb.where.mockResolvedValue([{ key: 'threshold_alpa', value: { value: 7 } }]);

      const result = await service.getConfigByKey(TENANT_ID, 'threshold_alpa');

      expect(result).toEqual({ key: 'threshold_alpa', value: { value: 7 } });
    });

    it('should return default value when key is not in DB but has a default', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await service.getConfigByKey(TENANT_ID, 'threshold_alpa');

      expect(result).toEqual({ key: 'threshold_alpa', value: { value: 10 } });
    });

    it('should throw NotFoundException for unknown key with no default', async () => {
      mockDb.where.mockResolvedValue([]);

      await expect(service.getConfigByKey(TENANT_ID, 'nonexistent_key')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('upsertConfig', () => {
    it('should upsert config value and return result', async () => {
      const newValue = { value: 15 };
      mockDb.returning.mockResolvedValue([{ key: 'threshold_alpa', value: newValue }]);

      const result = await service.upsertConfig(TENANT_ID, 'threshold_alpa', newValue);

      expect(result).toEqual({ key: 'threshold_alpa', value: newValue });
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('getHariLibur', () => {
    it('should return holidays for the specified year', async () => {
      const holidays = [
        { id: 'h1', tanggal: '2024-08-17', keterangan: 'Hari Kemerdekaan' },
        { id: 'h2', tanggal: '2024-12-25', keterangan: 'Natal' },
      ];
      mockDb.orderBy.mockResolvedValue(holidays);

      const result = await service.getHariLibur(TENANT_ID, 2024);

      expect(result).toEqual(holidays);
    });

    it('should use current year when year not specified', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      const result = await service.getHariLibur(TENANT_ID);

      expect(result).toEqual([]);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('createHariLibur', () => {
    it('should create a holiday entry and return it', async () => {
      const created = { id: 'new-id', tanggal: '2024-08-17', keterangan: 'Hari Kemerdekaan' };
      mockDb.returning.mockResolvedValue([created]);

      const result = await service.createHariLibur(TENANT_ID, {
        tanggal: '2024-08-17',
        keterangan: 'Hari Kemerdekaan',
      });

      expect(result).toEqual(created);
    });

    it('should throw ConflictException on duplicate date', async () => {
      mockDb.returning.mockRejectedValue({ code: '23505' });

      await expect(
        service.createHariLibur(TENANT_ID, {
          tanggal: '2024-08-17',
          keterangan: 'Hari Kemerdekaan',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should re-throw non-conflict errors', async () => {
      mockDb.returning.mockRejectedValue(new Error('Connection error'));

      await expect(
        service.createHariLibur(TENANT_ID, {
          tanggal: '2024-08-17',
        }),
      ).rejects.toThrow('Connection error');
    });
  });

  describe('deleteHariLibur', () => {
    it('should delete a holiday entry', async () => {
      mockDb.returning.mockResolvedValue([{ id: 'h1' }]);

      await expect(service.deleteHariLibur(TENANT_ID, 'h1')).resolves.toBeUndefined();
    });

    it('should throw NotFoundException if holiday not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      await expect(service.deleteHariLibur(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('bulkUpsertConfig - SPP validation', () => {
    it('should accept valid nominal_spp with exactly jumlah_tingkat keys', async () => {
      mockTenantService.getJumlahTingkat.mockResolvedValue(3);
      mockDb.returning.mockResolvedValue([
        { key: 'nominal_spp', value: { tingkat_1: 100000, tingkat_2: 150000, tingkat_3: 200000 } },
      ]);

      const result = await service.bulkUpsertConfig(TENANT_ID, [
        { key: 'nominal_spp', value: { tingkat_1: 100000, tingkat_2: 150000, tingkat_3: 200000 } },
      ]);

      expect(result).toHaveLength(1);
      expect(mockTenantService.getJumlahTingkat).toHaveBeenCalledWith(TENANT_ID);
    });

    it('should throw BadRequestException when extra keys are present', async () => {
      mockTenantService.getJumlahTingkat.mockResolvedValue(3);

      await expect(
        service.bulkUpsertConfig(TENANT_ID, [
          {
            key: 'nominal_spp',
            value: { tingkat_1: 100000, tingkat_2: 150000, tingkat_3: 200000, tingkat_4: 250000 },
          },
        ]),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.bulkUpsertConfig(TENANT_ID, [
          {
            key: 'nominal_spp',
            value: { tingkat_1: 100000, tingkat_2: 150000, tingkat_3: 200000, tingkat_4: 250000 },
          },
        ]),
      ).rejects.toThrow('Tingkat SPP melebihi batas (maks 3): tingkat_4');
    });

    it('should throw BadRequestException when keys are missing', async () => {
      mockTenantService.getJumlahTingkat.mockResolvedValue(3);

      await expect(
        service.bulkUpsertConfig(TENANT_ID, [
          { key: 'nominal_spp', value: { tingkat_1: 100000, tingkat_3: 200000 } },
        ]),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.bulkUpsertConfig(TENANT_ID, [
          { key: 'nominal_spp', value: { tingkat_1: 100000, tingkat_3: 200000 } },
        ]),
      ).rejects.toThrow('Nominal SPP untuk tingkat 2 wajib diisi');
    });

    it('should throw BadRequestException for negative nominal value', async () => {
      mockTenantService.getJumlahTingkat.mockResolvedValue(3);

      await expect(
        service.bulkUpsertConfig(TENANT_ID, [
          { key: 'nominal_spp', value: { tingkat_1: -100, tingkat_2: 150000, tingkat_3: 200000 } },
        ]),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.bulkUpsertConfig(TENANT_ID, [
          { key: 'nominal_spp', value: { tingkat_1: -100, tingkat_2: 150000, tingkat_3: 200000 } },
        ]),
      ).rejects.toThrow('Nominal SPP untuk tingkat_1 harus berupa bilangan bulat non-negatif');
    });

    it('should throw BadRequestException for non-integer nominal value', async () => {
      mockTenantService.getJumlahTingkat.mockResolvedValue(3);

      await expect(
        service.bulkUpsertConfig(TENANT_ID, [
          {
            key: 'nominal_spp',
            value: { tingkat_1: 100000, tingkat_2: 150.5, tingkat_3: 200000 },
          },
        ]),
      ).rejects.toThrow('Nominal SPP untuk tingkat_2 harus berupa bilangan bulat non-negatif');
    });

    it('should accept nominal_spp value of zero', async () => {
      mockTenantService.getJumlahTingkat.mockResolvedValue(2);
      mockDb.returning.mockResolvedValue([
        { key: 'nominal_spp', value: { tingkat_1: 0, tingkat_2: 0 } },
      ]);

      const result = await service.bulkUpsertConfig(TENANT_ID, [
        { key: 'nominal_spp', value: { tingkat_1: 0, tingkat_2: 0 } },
      ]);

      expect(result).toHaveLength(1);
    });

    it('should skip SPP validation when nominal_spp is not in items', async () => {
      mockDb.returning.mockResolvedValue([{ key: 'threshold_alpa', value: { value: 5 } }]);

      const result = await service.bulkUpsertConfig(TENANT_ID, [
        { key: 'threshold_alpa', value: { value: 5 } },
      ]);

      expect(result).toHaveLength(1);
      expect(mockTenantService.getJumlahTingkat).not.toHaveBeenCalled();
    });
  });
});
