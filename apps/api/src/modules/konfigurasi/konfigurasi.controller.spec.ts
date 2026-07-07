import { Test, TestingModule } from '@nestjs/testing';
import { KonfigurasiController } from './konfigurasi.controller';
import { KonfigurasiService } from './konfigurasi.service';
import { RedisService } from '@/modules/redis/redis.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';

describe('KonfigurasiController', () => {
  let controller: KonfigurasiController;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';

  const mockService = {
    getAllConfig: jest.fn(),
    getConfigByKey: jest.fn(),
    upsertConfig: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KonfigurasiController],
      providers: [
        { provide: KonfigurasiService, useValue: mockService },
        { provide: RedisService, useValue: {} },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    controller = module.get<KonfigurasiController>(KonfigurasiController);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /konfigurasi', () => {
    it('should return all config with defaults', async () => {
      const configs = [
        { key: 'threshold_alpa', value: { value: 10 } },
        { key: 'nominal_spp', value: { tingkat_1: 250000 } },
      ];
      mockService.getAllConfig.mockResolvedValue(configs);

      const result = await controller.getAllConfig(TENANT_ID);

      expect(result).toEqual(configs);
      expect(mockService.getAllConfig).toHaveBeenCalledWith(TENANT_ID);
    });
  });

  describe('GET /konfigurasi/:key', () => {
    it('should return a single config value', async () => {
      const config = { key: 'threshold_alpa', value: { value: 5 } };
      mockService.getConfigByKey.mockResolvedValue(config);

      const result = await controller.getConfigByKey(TENANT_ID, 'threshold_alpa');

      expect(result).toEqual(config);
      expect(mockService.getConfigByKey).toHaveBeenCalledWith(TENANT_ID, 'threshold_alpa');
    });
  });

  describe('PUT /konfigurasi/:key', () => {
    it('should upsert config value', async () => {
      const newValue = { value: 15 };
      const upserted = { key: 'threshold_alpa', value: newValue };
      mockService.upsertConfig.mockResolvedValue(upserted);

      const result = await controller.upsertConfig(TENANT_ID, 'threshold_alpa', {
        value: newValue,
      });

      expect(result).toEqual(upserted);
      expect(mockService.upsertConfig).toHaveBeenCalledWith(TENANT_ID, 'threshold_alpa', newValue);
    });
  });
});
