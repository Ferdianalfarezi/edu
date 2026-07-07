import { Test, TestingModule } from '@nestjs/testing';
import { TagihanController } from './tagihan.controller';
import { TagihanService } from './tagihan.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { BillingRateLimitGuard } from '@/common/guards/billing-rate-limit.guard';

/**
 * TagihanController Unit Tests — POST /tagihan/generate
 * Validates that the controller correctly delegates to the service
 * and returns the expected response shape.
 */
describe('TagihanController - generateTagihan', () => {
  let controller: TagihanController;
  let mockService: { generateTagihan: jest.Mock };

  const tenantId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    mockService = {
      generateTagihan: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagihanController],
      providers: [{ provide: TagihanService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(BillingRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TagihanController>(TagihanController);
  });

  it('should return success message with generation summary for per-month', async () => {
    const mockResult = {
      created: 10,
      skipped: 5,
      total_nominal: 2500000,
      months_processed: 1,
    };
    mockService.generateTagihan.mockResolvedValue(mockResult);

    const result = await controller.generateTagihan(tenantId, { bulan: 9, tahun: 2024 });

    expect(result.message).toBe('Tagihan berhasil di-generate');
    expect(result.data).toEqual(mockResult);
    expect(mockService.generateTagihan).toHaveBeenCalledWith(tenantId, {
      bulan: 9,
      tahun: 2024,
    });
  });

  it('should pass tahun_ajaran_id to service for full-year generation', async () => {
    const mockResult = {
      created: 120,
      skipped: 0,
      total_nominal: 30000000,
      months_processed: 12,
    };
    mockService.generateTagihan.mockResolvedValue(mockResult);

    const taId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const result = await controller.generateTagihan(tenantId, { tahun_ajaran_id: taId });

    expect(result.data.months_processed).toBe(12);
    expect(mockService.generateTagihan).toHaveBeenCalledWith(tenantId, {
      tahun_ajaran_id: taId,
    });
  });
});
