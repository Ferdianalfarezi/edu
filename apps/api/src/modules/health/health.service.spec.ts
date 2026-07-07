import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';
import { RedisService } from '../redis/redis.service';
import { DrizzleService } from '../../drizzle/drizzle.service';

describe('HealthService', () => {
  let service: HealthService;
  let mockDrizzleService: any;
  let mockRedisService: any;
  let mockConfigService: any;

  beforeEach(async () => {
    const mockClient = { release: jest.fn() };
    mockDrizzleService = {
      getPool: jest.fn().mockReturnValue({
        connect: jest.fn().mockResolvedValue(mockClient),
      }),
    };

    mockRedisService = {
      getClient: jest.fn().mockReturnValue({
        ping: jest.fn().mockResolvedValue('PONG'),
      }),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultVal?: any) => {
        const config: Record<string, any> = {
          S3_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
          NODE_ENV: 'test',
        };
        return config[key] ?? defaultVal;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DrizzleService, useValue: mockDrizzleService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe('getHealth', () => {
    it('should return healthy when all checks pass', async () => {
      // Mock fetch for storage check
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const result = await service.getHealth();

      expect(result.status).toBe('healthy');
      expect(result.checks.database.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
      expect(result.checks.storage.status).toBe('up');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.environment).toBe('test');
    });

    it('should return degraded when one service is down', async () => {
      mockRedisService.getClient.mockReturnValue({
        ping: jest.fn().mockRejectedValue(new Error('Connection refused')),
      });
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const result = await service.getHealth();

      expect(result.status).toBe('degraded');
      expect(result.checks.database.status).toBe('up');
      expect(result.checks.redis.status).toBe('down');
      expect(result.checks.redis.error).toBe('Connection refused');
    });

    it('should return unhealthy when all services are down', async () => {
      mockDrizzleService.getPool.mockReturnValue({
        connect: jest.fn().mockRejectedValue(new Error('DB down')),
      });
      mockRedisService.getClient.mockReturnValue({
        ping: jest.fn().mockRejectedValue(new Error('Redis down')),
      });
      mockConfigService.get.mockReturnValue(undefined);

      const result = await service.getHealth();

      expect(result.status).toBe('unhealthy');
    });

    it('should include response time in checks', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const result = await service.getHealth();

      expect(result.checks.database.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.checks.redis.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.checks.storage.responseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getLiveness', () => {
    it('should always return ok with timestamp', () => {
      const result = service.getLiveness();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });
  });
});
