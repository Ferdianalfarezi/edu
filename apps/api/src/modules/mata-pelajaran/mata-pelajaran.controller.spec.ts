import { Test, TestingModule } from '@nestjs/testing';
import { MataPelajaranController } from './mata-pelajaran.controller';
import { MataPelajaranService } from './mata-pelajaran.service';
import { RedisService } from '@/modules/redis/redis.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';

describe('MataPelajaranController', () => {
  let controller: MataPelajaranController;
  let service: MataPelajaranService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const mapelId = '22222222-2222-2222-2222-222222222222';

  const mockMapel = {
    id: mapelId,
    tenantId,
    nama: 'Matematika',
    kode: 'MTK',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MataPelajaranController],
      providers: [
        {
          provide: MataPelajaranService,
          useValue: {
            create: jest.fn().mockResolvedValue(mockMapel),
            findAll: jest.fn().mockResolvedValue([mockMapel]),
            findOne: jest.fn().mockResolvedValue(mockMapel),
            update: jest.fn().mockResolvedValue({ ...mockMapel, nama: 'Updated' }),
            remove: jest.fn().mockResolvedValue({ message: 'Mata pelajaran berhasil dihapus' }),
          },
        },
        { provide: RedisService, useValue: {} },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    controller = module.get<MataPelajaranController>(MataPelajaranController);
    service = module.get<MataPelajaranService>(MataPelajaranService);
  });

  describe('create', () => {
    it('should call service.create with tenantId and dto', async () => {
      const dto = { nama: 'Matematika', kode: 'MTK' };
      const result = await controller.create(tenantId, dto);

      expect(service.create).toHaveBeenCalledWith(tenantId, dto);
      expect(result).toEqual(mockMapel);
    });
  });

  describe('findAll', () => {
    it('should return all mata pelajaran for the tenant', async () => {
      const result = await controller.findAll(tenantId);

      expect(service.findAll).toHaveBeenCalledWith(tenantId);
      expect(result).toEqual([mockMapel]);
    });
  });

  describe('findOne', () => {
    it('should return a single mata pelajaran', async () => {
      const result = await controller.findOne(tenantId, mapelId);

      expect(service.findOne).toHaveBeenCalledWith(tenantId, mapelId);
      expect(result).toEqual(mockMapel);
    });
  });

  describe('update', () => {
    it('should call service.update and return the updated record', async () => {
      const dto = { nama: 'Updated' };
      const result = await controller.update(tenantId, mapelId, dto);

      expect(service.update).toHaveBeenCalledWith(tenantId, mapelId, dto);
      expect(result.nama).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should call service.remove and return success message', async () => {
      const result = await controller.remove(tenantId, mapelId);

      expect(service.remove).toHaveBeenCalledWith(tenantId, mapelId);
      expect(result).toEqual({ message: 'Mata pelajaran berhasil dihapus' });
    });
  });
});
