import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule, DRIZZLE } from './drizzle.module';
import { DrizzleService } from './drizzle.service';

describe('DrizzleModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
              DB_POOL_MAX: 20,
              DB_POOL_MIN: 5,
              DB_IDLE_TIMEOUT: 30000,
            }),
          ],
        }),
        DrizzleModule,
      ],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should provide DrizzleService', () => {
    const service = module.get<DrizzleService>(DrizzleService);
    expect(service).toBeDefined();
  });

  it('should provide DRIZZLE token with db instance', () => {
    const db = module.get(DRIZZLE);
    expect(db).toBeDefined();
  });

  it('should configure pool with env values', () => {
    const service = module.get<DrizzleService>(DrizzleService);
    const pool = service.getPool();
    expect(pool.options.max).toBe(20);
    expect(pool.options.min).toBe(5);
    expect(pool.options.idleTimeoutMillis).toBe(30000);
  });
});
