import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getQueueToken } from '@nestjs/bull';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { REDIS_CLIENT } from '@/modules/redis/redis.constants';
import { RedisService } from '@/modules/redis/redis.service';
import { JwtStrategy } from '@/modules/auth/strategies';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { QUEUE_NAMES } from '@/modules/queue';

const JWT_SECRET = 'contract-test-secret';

export interface MockProviders {
  db: any;
  redis: any;
  serviceOverrides?: Array<{ provide: any; useValue: any }>;
}

/**
 * Creates a NestJS test app with mocked infrastructure (DB, Redis, queues).
 * Used for fast contract tests that only validate response shapes.
 */
export async function createMockTestApp(
  controllers: any[],
  providers: any[],
  mocks: MockProviders,
): Promise<INestApplication> {
  const mockQueue = { add: jest.fn().mockResolvedValue({}) };

  const queueProviders: any[] = [];
  // Provide all queue tokens to avoid DI errors
  for (const name of Object.values(QUEUE_NAMES)) {
    queueProviders.push({ provide: getQueueToken(name as string), useValue: mockQueue });
  }

  const moduleBuilder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            NODE_ENV: 'test',
            JWT_ACCESS_SECRET: JWT_SECRET,
            JWT_REFRESH_SECRET: JWT_SECRET,
            JWT_ACCESS_EXPIRATION: '24h',
            JWT_REFRESH_EXPIRATION: '7d',
            MINIMUM_APP_VERSION: '1.0.0',
          }),
        ],
      }),
      PassportModule.register({ defaultStrategy: 'jwt' }),
      JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '24h' } }),
    ],
    controllers,
    providers: [
      ...providers,
      JwtStrategy,
      JwtAuthGuard,
      RedisService,
      { provide: DRIZZLE, useValue: mocks.db },
      { provide: REDIS_CLIENT, useValue: mocks.redis },
      ...queueProviders,
      ...(mocks.serviceOverrides || []),
    ],
  });

  const module: TestingModule = await moduleBuilder.compile();
  const app = module.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.setGlobalPrefix('api/v1');

  await app.init();
  return app;
}

export { JWT_SECRET };
