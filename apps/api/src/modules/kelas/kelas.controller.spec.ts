import { Test, TestingModule } from '@nestjs/testing';
import { KelasController } from './kelas.controller';
import { KelasService } from './kelas.service';
import { RedisService } from '@/modules/redis/redis.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';

describe('KelasController', () => {
  let controller: KelasController;
  let mockService: Partial<Record<keyof KelasService, jest.Mock>>;

  const tenantId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    mockService = {
      createKelas: jest.fn(),
      listKelas: jest.fn(),
      getKelasById: jest.fn(),
      updateKelas: jest.fn(),
      deleteKelas: jest.fn(),
      duplicateClassStructure: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [KelasController],
      providers: [
        { provide: KelasService, useValue: mockService },
        { provide: RedisService, useValue: {} },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    controller = module.get<KelasController>(KelasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /kelas', () => {
    it('should call service.createKelas with tenantId and dto', async () => {
      const dto = { nama: '1A', tingkat: 1, tahunAjaranId: 'ta-id' };
      const expected = { id: 'kelas-id', ...dto, waliKelasId: null, kapasitas: null };
      mockService.createKelas!.mockResolvedValue(expected);

      const result = await controller.createKelas(tenantId, dto);

      expect(mockService.createKelas).toHaveBeenCalledWith(tenantId, dto);
      expect(result).toEqual(expected);
    });
  });

  describe('GET /kelas', () => {
    it('should call service.listKelas with tenantId and query', async () => {
      const query = { tahunAjaranId: 'ta-id' };
      const expected = { data: [], nextCursor: null };
      mockService.listKelas!.mockResolvedValue(expected);

      const result = await controller.listKelas(tenantId, query);

      expect(mockService.listKelas).toHaveBeenCalledWith(tenantId, query);
      expect(result).toEqual(expected);
    });
  });

  describe('GET /kelas/:id', () => {
    it('should call service.getKelasById with tenantId and id', async () => {
      const expected = { id: 'kelas-id', nama: '1A', jumlahSiswa: 10 };
      mockService.getKelasById!.mockResolvedValue(expected);

      const result = await controller.getKelas(tenantId, 'kelas-id');

      expect(mockService.getKelasById).toHaveBeenCalledWith(tenantId, 'kelas-id');
      expect(result).toEqual(expected);
    });
  });

  describe('PATCH /kelas/:id', () => {
    it('should call service.updateKelas with tenantId, id, and dto', async () => {
      const dto = { nama: '1B' };
      const expected = { id: 'kelas-id', nama: '1B' };
      mockService.updateKelas!.mockResolvedValue(expected);

      const result = await controller.updateKelas(tenantId, 'kelas-id', dto);

      expect(mockService.updateKelas).toHaveBeenCalledWith(tenantId, 'kelas-id', dto);
      expect(result).toEqual(expected);
    });
  });

  describe('DELETE /kelas/:id', () => {
    it('should call service.deleteKelas with tenantId and id', async () => {
      mockService.deleteKelas!.mockResolvedValue({ deleted: true });

      const result = await controller.deleteKelas(tenantId, 'kelas-id');

      expect(mockService.deleteKelas).toHaveBeenCalledWith(tenantId, 'kelas-id');
      expect(result).toEqual({ deleted: true });
    });
  });
});
