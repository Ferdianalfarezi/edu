import { Test, TestingModule } from '@nestjs/testing';
import { HariLiburController } from './hari-libur.controller';
import { KonfigurasiService } from './konfigurasi.service';
import { RedisService } from '@/modules/redis/redis.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';

describe('HariLiburController', () => {
  let controller: HariLiburController;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';

  const mockService = {
    getHariLibur: jest.fn(),
    createHariLibur: jest.fn(),
    deleteHariLibur: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HariLiburController],
      providers: [
        { provide: KonfigurasiService, useValue: mockService },
        { provide: RedisService, useValue: {} },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    controller = module.get<HariLiburController>(HariLiburController);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /hari-libur', () => {
    it('should return holidays for specified year', async () => {
      const holidays = [{ id: 'h1', tanggal: '2024-08-17', keterangan: 'Hari Kemerdekaan' }];
      mockService.getHariLibur.mockResolvedValue(holidays);

      const result = await controller.getHariLibur(TENANT_ID, '2024');

      expect(result).toEqual(holidays);
      expect(mockService.getHariLibur).toHaveBeenCalledWith(TENANT_ID, 2024);
    });

    it('should use undefined year when not specified', async () => {
      mockService.getHariLibur.mockResolvedValue([]);

      await controller.getHariLibur(TENANT_ID, undefined);

      expect(mockService.getHariLibur).toHaveBeenCalledWith(TENANT_ID, undefined);
    });
  });

  describe('POST /hari-libur', () => {
    it('should create a holiday entry', async () => {
      const created = { id: 'new-id', tanggal: '2024-08-17', keterangan: 'Hari Kemerdekaan' };
      mockService.createHariLibur.mockResolvedValue(created);

      const result = await controller.createHariLibur(TENANT_ID, {
        tanggal: '2024-08-17',
        keterangan: 'Hari Kemerdekaan',
      });

      expect(result).toEqual(created);
      expect(mockService.createHariLibur).toHaveBeenCalledWith(TENANT_ID, {
        tanggal: '2024-08-17',
        keterangan: 'Hari Kemerdekaan',
      });
    });
  });

  describe('DELETE /hari-libur/:id', () => {
    it('should delete a holiday entry', async () => {
      mockService.deleteHariLibur.mockResolvedValue(undefined);

      await controller.deleteHariLibur(TENANT_ID, 'h1');

      expect(mockService.deleteHariLibur).toHaveBeenCalledWith(TENANT_ID, 'h1');
    });
  });
});
