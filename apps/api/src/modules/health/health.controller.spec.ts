import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: HealthService;
  let mockRes: any;

  beforeEach(async () => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            getHealth: jest.fn().mockResolvedValue({
              status: 'healthy',
              timestamp: new Date().toISOString(),
              uptime: 100,
              checks: {
                database: { status: 'up', responseTimeMs: 5 },
                redis: { status: 'up', responseTimeMs: 2 },
                storage: { status: 'up', responseTimeMs: 10 },
              },
              version: '0.0.1',
              environment: 'test',
            }),
            getLiveness: jest.fn().mockReturnValue({
              status: 'ok',
              timestamp: new Date().toISOString(),
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get<HealthService>(HealthService);
  });

  describe('GET /health', () => {
    it('should return 200 with healthy status when all checks pass', async () => {
      await controller.getHealth(mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          checks: expect.objectContaining({
            database: expect.objectContaining({ status: 'up' }),
            redis: expect.objectContaining({ status: 'up' }),
            storage: expect.objectContaining({ status: 'up' }),
          }),
        }),
      );
    });

    it('should return 503 when status is unhealthy', async () => {
      (healthService.getHealth as jest.Mock).mockResolvedValue({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: 100,
        checks: {
          database: { status: 'down', error: 'Connection refused' },
          redis: { status: 'down', error: 'Connection refused' },
          storage: { status: 'down', error: 'Unreachable' },
        },
        version: '0.0.1',
        environment: 'test',
      });

      await controller.getHealth(mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it('should return 200 when status is degraded', async () => {
      (healthService.getHealth as jest.Mock).mockResolvedValue({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        uptime: 100,
        checks: {
          database: { status: 'up', responseTimeMs: 5 },
          redis: { status: 'down', error: 'Timeout' },
          storage: { status: 'up', responseTimeMs: 10 },
        },
        version: '0.0.1',
        environment: 'test',
      });

      await controller.getHealth(mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness status', () => {
      const result = controller.getLiveness();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });
  });
});
