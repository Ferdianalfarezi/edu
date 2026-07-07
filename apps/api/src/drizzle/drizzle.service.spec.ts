import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DrizzleService } from './drizzle.service';

describe('DrizzleService', () => {
  let service: DrizzleService;
  let configService: ConfigService;

  const mockConfigValues: Record<string, string | number> = {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
    DB_POOL_MAX: 20,
    DB_POOL_MIN: 5,
    DB_IDLE_TIMEOUT: 30000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DrizzleService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              return mockConfigValues[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DrizzleService>(DrizzleService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should expose a drizzle db instance', () => {
    expect(service.db).toBeDefined();
  });

  it('should expose the underlying pg Pool', () => {
    const pool = service.getPool();
    expect(pool).toBeDefined();
    expect(pool.options.max).toBe(20);
    expect(pool.options.min).toBe(5);
    expect(pool.options.idleTimeoutMillis).toBe(30000);
    expect(pool.options.connectionTimeoutMillis).toBe(5000);
  });

  it('should read pool config from ConfigService', () => {
    expect(configService.get).toHaveBeenCalledWith('DATABASE_URL');
    expect(configService.get).toHaveBeenCalledWith('DB_POOL_MAX', 20);
    expect(configService.get).toHaveBeenCalledWith('DB_POOL_MIN', 5);
    expect(configService.get).toHaveBeenCalledWith('DB_IDLE_TIMEOUT', 30000);
  });

  afterEach(async () => {
    // Clean up pool to avoid open handles
    await service.onModuleDestroy();
  });
});
