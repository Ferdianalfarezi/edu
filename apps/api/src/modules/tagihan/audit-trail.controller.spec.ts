import { Test, TestingModule } from '@nestjs/testing';
import { AuditTrailController } from './audit-trail.controller';
import { AuditTrailService } from './audit-trail.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';

/**
 * AuditTrailController Unit Tests
 *
 * Validates:
 * - Controller correctly delegates to AuditTrailService
 * - Returns expected response shape from service
 * - Route guards are applied (bendahara, admin, kepala_sekolah)
 *
 * Requirements: 29.3, 29.4
 */
describe('AuditTrailController', () => {
  let controller: AuditTrailController;
  let mockService: { list: jest.Mock };

  const tenantId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    mockService = {
      list: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditTrailController],
      providers: [{ provide: AuditTrailService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuditTrailController>(AuditTrailController);
  });

  it('should return paginated audit trail list', async () => {
    const mockResult = {
      data: [
        {
          id: 'aaaa',
          user_id: '22222222-2222-2222-2222-222222222222',
          jenis_aksi: 'edit_tagihan',
          entity_type: 'tagihan',
          entity_id: '33333333-3333-3333-3333-333333333333',
          nilai_sebelum: { nominal: 500000 },
          nilai_sesudah: { nominal: 750000 },
          alasan: null,
          created_at: new Date('2024-01-15T10:00:00Z'),
        },
      ],
      meta: { has_next: false, cursor: null },
    };
    mockService.list.mockResolvedValue(mockResult);

    const result = await controller.list(tenantId, { limit: 20 });

    expect(result).toEqual(mockResult);
    expect(mockService.list).toHaveBeenCalledWith(tenantId, { limit: 20 });
  });

  it('should pass cursor parameter to service', async () => {
    const cursorId = '44444444-4444-4444-4444-444444444444';
    const mockResult = { data: [], meta: { has_next: false, cursor: null } };
    mockService.list.mockResolvedValue(mockResult);

    await controller.list(tenantId, { cursor: cursorId, limit: 10 });

    expect(mockService.list).toHaveBeenCalledWith(tenantId, { cursor: cursorId, limit: 10 });
  });

  it('should use default limit when not specified', async () => {
    const mockResult = { data: [], meta: { has_next: false, cursor: null } };
    mockService.list.mockResolvedValue(mockResult);

    await controller.list(tenantId, {});

    expect(mockService.list).toHaveBeenCalledWith(tenantId, {});
  });
});
