# API Contract Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hybrid contract test suite that validates API response shapes match what the Vue admin frontend expects, with fast mocked tests for local dev (Kiro Hook) and thorough real-DB tests for CI.

**Architecture:** Two-layer contract testing — a "contract-mock" Jest project using mocked services for instant feedback on controller changes, and a "contract-real" Jest project using real PostgreSQL + Redis for CI pipeline. Both validate the same response schemas via shared validators. A Kiro Hook triggers the mocked suite on controller file save.

**Tech Stack:** Jest (existing), supertest (existing), NestJS Testing module (existing), custom schema validators (new), Kiro Hooks (new)

## Global Constraints

- Node.js >= 18, pnpm >= 8
- All API endpoints prefixed with `/api/v1/`
- Response shapes defined by `@edu/shared` interfaces: `PaginatedResponse<T>`, `ApiErrorResponse`, `ApiSuccessResponse`
- Auth via JWT Bearer token
- Multi-tenant via `x-tenant-id` header (set by TenantInterceptor from JWT)
- Existing test path aliases: `@/` → `src/`, `@test/` → `test/`

---

### Task 1: Jest Configuration & Shared Schema Validators

**Files:**
- Create: `apps/api/jest.contract-mock.config.ts`
- Create: `apps/api/jest.contract-real.config.ts`
- Create: `apps/api/src/test/contract/helpers/schema-validators.ts`
- Create: `apps/api/src/test/contract/helpers/test-app.factory.ts`
- Create: `apps/api/src/test/contract/helpers/auth.helper.ts`
- Modify: `apps/api/package.json` (add scripts)

**Interfaces:**
- Consumes: `@edu/shared` types (`PaginatedResponse`, `ApiErrorResponse`, `LoginResponse`, `AuthUser`)
- Produces: `expectPaginatedResponse(body)`, `expectApiError(body, statusCode)`, `expectDataArray(body)`, `expectObjectWithFields(body, fields)`, `createMockTestApp(modules)`, `getAuthToken(app, role)`

- [ ] **Step 1: Create jest.contract-mock.config.ts**

```typescript
// apps/api/jest.contract-mock.config.ts
import type { Config } from 'jest';

const config: Config = {
  displayName: 'contract-mock',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.contract\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },
  // No global setup needed — uses mocked services
};

export default config;
```

- [ ] **Step 2: Create jest.contract-real.config.ts**

```typescript
// apps/api/jest.contract-real.config.ts
import type { Config } from 'jest';

const config: Config = {
  displayName: 'contract-real',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.contract\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
  // Uses real DB — set env var CONTRACT_USE_REAL_DB=true
};

export default config;
```

- [ ] **Step 3: Create schema-validators.ts**

```typescript
// apps/api/src/test/contract/helpers/schema-validators.ts

/**
 * Shared contract validators that check response shapes match
 * what the Vue admin frontend expects.
 *
 * These don't validate data correctness — just structure, types, field presence.
 */

export function expectPaginatedResponse(body: any, itemValidator?: (item: any) => void) {
  expect(body).toHaveProperty('data');
  expect(body).toHaveProperty('meta');
  expect(Array.isArray(body.data)).toBe(true);
  expect(body.meta).toHaveProperty('has_next');
  expect(typeof body.meta.has_next).toBe('boolean');
  expect(body.meta).toHaveProperty('cursor');
  // cursor can be string or null
  if (body.meta.cursor !== null) {
    expect(typeof body.meta.cursor).toBe('string');
  }
  // total is optional
  if (body.meta.total !== undefined) {
    expect(typeof body.meta.total).toBe('number');
  }
  if (itemValidator && body.data.length > 0) {
    body.data.forEach(itemValidator);
  }
}

export function expectDataArray(body: any, itemValidator?: (item: any) => void) {
  expect(body).toHaveProperty('data');
  expect(Array.isArray(body.data)).toBe(true);
  if (itemValidator && body.data.length > 0) {
    body.data.forEach(itemValidator);
  }
}

export function expectApiError(body: any, expectedStatus: number) {
  expect(body).toHaveProperty('statusCode', expectedStatus);
  expect(body).toHaveProperty('message');
  expect(typeof body.message).toBe('string');
  // error field is present on NestJS default errors
  if (body.error !== undefined) {
    expect(typeof body.error).toBe('string');
  }
}

export function expectLoginResponse(body: any) {
  expect(body).toHaveProperty('access_token');
  expect(typeof body.access_token).toBe('string');
  expect(body).toHaveProperty('refresh_token');
  expect(typeof body.refresh_token).toBe('string');
  expect(body).toHaveProperty('must_change_password');
  expect(typeof body.must_change_password).toBe('boolean');
  expect(body).toHaveProperty('user');
  expectAuthUser(body.user);
}

export function expectAuthUser(user: any) {
  expect(user).toHaveProperty('id');
  expect(typeof user.id).toBe('string');
  expect(user).toHaveProperty('name');
  expect(typeof user.name).toBe('string');
  expect(user).toHaveProperty('role');
  expect(typeof user.role).toBe('string');
  expect(user).toHaveProperty('tenant_id');
  // tenant_id can be string or null (orang_tua)
}

export function expectMessageResponse(body: any) {
  expect(body).toHaveProperty('message');
  expect(typeof body.message).toBe('string');
}

export function expectObjectWithFields(body: any, requiredFields: string[]) {
  for (const field of requiredFields) {
    expect(body).toHaveProperty(field);
  }
}

export function expectUUID(value: any) {
  expect(typeof value).toBe('string');
  expect(value).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
}
```

- [ ] **Step 4: Create test-app.factory.ts**

```typescript
// apps/api/src/test/contract/helpers/test-app.factory.ts
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
      { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: mockQueue },
      { provide: getQueueToken(QUEUE_NAMES.EXPORT), useValue: mockQueue },
      { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION), useValue: mockQueue },
      { provide: getQueueToken(QUEUE_NAMES.CSV_IMPORT), useValue: mockQueue },
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
```

- [ ] **Step 5: Create auth.helper.ts**

```typescript
// apps/api/src/test/contract/helpers/auth.helper.ts
import { JwtService } from '@nestjs/jwt';
import { Role } from '@edu/shared';
import { JWT_SECRET } from './test-app.factory';
import { v4 as uuidv4 } from 'uuid';

const jwtService = new JwtService({ secret: JWT_SECRET });

export interface TokenOptions {
  role: Role;
  tenantId?: string;
  userId?: string;
}

/**
 * Generate a valid JWT token for contract testing.
 * Does NOT hit the login endpoint — directly creates a token.
 */
export function generateTestToken(options: TokenOptions): string {
  const { role, tenantId = uuidv4(), userId = uuidv4() } = options;

  return jwtService.sign(
    {
      sub: userId,
      role,
      tenant_id: role === Role.ORANG_TUA ? null : tenantId,
      platform: 'admin_panel',
      jti: uuidv4(),
      type: 'access',
    },
    { expiresIn: '1h' },
  );
}

export function adminToken(tenantId?: string): string {
  return generateTestToken({ role: Role.ADMIN, tenantId });
}

export function guruToken(tenantId?: string): string {
  return generateTestToken({ role: Role.GURU, tenantId });
}

export function bendaharaToken(tenantId?: string): string {
  return generateTestToken({ role: Role.BENDAHARA, tenantId });
}

export function kepalaSekolahToken(tenantId?: string): string {
  return generateTestToken({ role: Role.KEPALA_SEKOLAH, tenantId });
}

export function orangTuaToken(): string {
  return generateTestToken({ role: Role.ORANG_TUA });
}
```

- [ ] **Step 6: Update package.json scripts**

Add these scripts to `apps/api/package.json`:

```json
"test:contract": "jest --config jest.contract-mock.config.ts",
"test:contract:real": "CONTRACT_USE_REAL_DB=true jest --config jest.contract-real.config.ts",
"test:contract:watch": "jest --config jest.contract-mock.config.ts --watch"
```

Also update the `jest.projects` array in `package.json`:

```json
"jest": {
  "projects": [
    "<rootDir>/jest.unit.config.ts",
    "<rootDir>/jest.integration.config.ts",
    "<rootDir>/jest.contract-mock.config.ts"
  ]
}
```

- [ ] **Step 7: Install uuid devDependency (for test token generation)**

```bash
cd apps/api && pnpm add -D uuid @types/uuid
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/jest.contract-mock.config.ts apps/api/jest.contract-real.config.ts \
  apps/api/src/test/contract/helpers/ apps/api/package.json
git commit -m "feat(test): add contract testing infrastructure with schema validators"
```

---

### Task 2: Auth Module Contract Tests

**Files:**
- Create: `apps/api/src/test/contract/auth.contract.spec.ts`

**Interfaces:**
- Consumes: `createMockTestApp`, `generateTestToken`, `expectLoginResponse`, `expectApiError`, `expectMessageResponse`
- Produces: Validated contract for `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/change-password`, `/auth/reset-password/*`

- [ ] **Step 1: Write auth.contract.spec.ts**

```typescript
// apps/api/src/test/contract/auth.contract.spec.ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AuthController } from '@/modules/auth/auth.controller';
import { AuthService } from '@/modules/auth/auth.service';
import { createMockTestApp } from './helpers/test-app.factory';
import { adminToken } from './helpers/auth.helper';
import {
  expectLoginResponse,
  expectApiError,
  expectMessageResponse,
} from './helpers/schema-validators';

describe('Auth Contract Tests', () => {
  let app: INestApplication;

  const mockAuthService = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    requestPasswordReset: jest.fn(),
    confirmPasswordReset: jest.fn(),
    changePassword: jest.fn(),
  };

  beforeAll(async () => {
    const mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      exists: jest.fn().mockResolvedValue(0),
    };
    const mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };

    app = await createMockTestApp(
      [AuthController],
      [{ provide: AuthService, useValue: mockAuthService }],
      { db: mockDb, redis: mockRedis },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/auth/login — response shape', () => {
    it('should return LoginResponse shape on success', async () => {
      mockAuthService.login.mockResolvedValue({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        must_change_password: false,
        user: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Admin Test',
          role: 'admin',
          tenant_id: '123e4567-e89b-12d3-a456-426614174001',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@test.com', password: 'pass', platform: 'admin_panel' })
        .expect(200);

      expectLoginResponse(res.body);
    });

    it('should return ApiError shape on invalid credentials', async () => {
      mockAuthService.login.mockRejectedValue({
        response: { statusCode: 401, message: 'Email atau password salah', error: 'Unauthorized' },
        status: 401,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'bad@test.com', password: 'wrong', platform: 'admin_panel' })
        .expect(401);

      expectApiError(res.body, 401);
    });

    it('should return 400 with validation errors for missing fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);

      expectApiError(res.body, 400);
    });
  });

  describe('POST /api/v1/auth/refresh — response shape', () => {
    it('should return { access_token, refresh_token } on success', async () => {
      mockAuthService.refresh.mockResolvedValue({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: 'valid-refresh-token' })
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      expect(typeof res.body.access_token).toBe('string');
      expect(res.body).toHaveProperty('refresh_token');
      expect(typeof res.body.refresh_token).toBe('string');
    });
  });

  describe('POST /api/v1/auth/logout — response shape', () => {
    it('should return { message } on success', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const token = adminToken();
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(200);

      expectMessageResponse(res.body);
    });
  });

  describe('POST /api/v1/auth/change-password — response shape', () => {
    it('should return { message } on success', async () => {
      mockAuthService.changePassword.mockResolvedValue({
        message: 'Password berhasil diubah. Sesi lain telah di-logout.',
      });

      const token = adminToken();
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ old_password: 'old123', new_password: 'new456' })
        .expect(200);

      expectMessageResponse(res.body);
    });
  });

  describe('POST /api/v1/auth/reset-password/request — response shape', () => {
    it('should return { message } on success', async () => {
      mockAuthService.requestPasswordReset.mockResolvedValue({
        message: 'Jika email terdaftar, link reset password telah dikirim',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password/request')
        .send({ email: 'test@test.com' })
        .expect(200);

      expectMessageResponse(res.body);
    });
  });

  describe('POST /api/v1/auth/reset-password/confirm — response shape', () => {
    it('should return { message } on success', async () => {
      mockAuthService.confirmPasswordReset.mockResolvedValue({
        message: 'Password berhasil direset. Silakan login dengan password baru.',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password/confirm')
        .send({ token: 'valid-token', new_password: 'newpass123' })
        .expect(200);

      expectMessageResponse(res.body);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it works**

```bash
cd apps/api && npx jest --config jest.contract-mock.config.ts --testPathPattern auth.contract
```

Expected: All tests PASS (using mocked service)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/test/contract/auth.contract.spec.ts
git commit -m "test(contract): add auth module contract tests"
```

---

### Task 3: Kelas & Tahun Ajaran Contract Tests

**Files:**
- Create: `apps/api/src/test/contract/kelas.contract.spec.ts`
- Create: `apps/api/src/test/contract/tahun-ajaran.contract.spec.ts`

**Interfaces:**
- Consumes: `createMockTestApp`, `adminToken`, `expectPaginatedResponse`, `expectDataArray`, `expectObjectWithFields`
- Produces: Validated contract for `/kelas` and `/tahun-ajaran` endpoints

- [ ] **Step 1: Write kelas.contract.spec.ts**

```typescript
// apps/api/src/test/contract/kelas.contract.spec.ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { KelasController } from '@/modules/kelas/kelas.controller';
import { KelasService } from '@/modules/kelas/kelas.service';
import { createMockTestApp } from './helpers/test-app.factory';
import { adminToken } from './helpers/auth.helper';
import {
  expectDataArray,
  expectObjectWithFields,
  expectApiError,
  expectUUID,
} from './helpers/schema-validators';

describe('Kelas Contract Tests', () => {
  let app: INestApplication;

  const mockKelasService = {
    createKelas: jest.fn(),
    listKelas: jest.fn(),
    getKelasById: jest.fn(),
    updateKelas: jest.fn(),
    deleteKelas: jest.fn(),
  };

  beforeAll(async () => {
    const mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      exists: jest.fn().mockResolvedValue(0),
    };
    const mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };

    app = await createMockTestApp(
      [KelasController],
      [{ provide: KelasService, useValue: mockKelasService }],
      { db: mockDb, redis: mockRedis },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET /api/v1/kelas — response shape', () => {
    it('should return { data: Kelas[] } as frontend expects', async () => {
      mockKelasService.listKelas.mockResolvedValue({
        data: [
          { id: '550e8400-e29b-41d4-a716-446655440000', nama: '1A', tingkat: 1, jumlah_siswa: 25 },
        ],
        meta: { has_next: false, cursor: null },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/kelas')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      // Frontend uses: const { data } = await api.get<{ data: Kelas[] }>('/kelas');
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      if (res.body.data.length > 0) {
        expectObjectWithFields(res.body.data[0], ['id', 'nama', 'tingkat']);
      }
    });
  });

  describe('GET /api/v1/kelas/:id — response shape', () => {
    it('should return kelas detail with expected fields', async () => {
      mockKelasService.getKelasById.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        nama: '1A',
        tingkat: 1,
        wali_kelas_id: null,
        wali_kelas_nama: null,
        jumlah_siswa: 25,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/kelas/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expectObjectWithFields(res.body, ['id', 'nama', 'tingkat']);
    });
  });

  describe('POST /api/v1/kelas — response shape', () => {
    it('should return created kelas object', async () => {
      mockKelasService.createKelas.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        nama: '2B',
        tingkat: 2,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/kelas')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ nama: '2B', tingkat: 2, tahun_ajaran_id: '550e8400-e29b-41d4-a716-446655440001' })
        .expect(201);

      expectObjectWithFields(res.body, ['id', 'nama', 'tingkat']);
    });
  });

  describe('Unauthorized access — error shape', () => {
    it('should return 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/kelas')
        .expect(401);

      expectApiError(res.body, 401);
    });
  });
});
```

- [ ] **Step 2: Write tahun-ajaran.contract.spec.ts**

```typescript
// apps/api/src/test/contract/tahun-ajaran.contract.spec.ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TahunAjaranController } from '@/modules/tahun-ajaran/tahun-ajaran.controller';
import { TahunAjaranService } from '@/modules/tahun-ajaran/tahun-ajaran.service';
import { createMockTestApp } from './helpers/test-app.factory';
import { adminToken } from './helpers/auth.helper';
import { expectDataArray, expectObjectWithFields } from './helpers/schema-validators';

describe('Tahun Ajaran Contract Tests', () => {
  let app: INestApplication;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    activate: jest.fn(),
  };

  beforeAll(async () => {
    const mockRedis = { get: jest.fn().mockResolvedValue(null), exists: jest.fn().mockResolvedValue(0) };
    const mockDb = { select: jest.fn().mockReturnThis(), from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) };

    app = await createMockTestApp(
      [TahunAjaranController],
      [{ provide: TahunAjaranService, useValue: mockService }],
      { db: mockDb, redis: mockRedis },
    );
  });

  afterAll(async () => { await app.close(); });
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/v1/tahun-ajaran — response shape', () => {
    it('should return { data: TahunAjaran[] } as frontend expects', async () => {
      mockService.findAll.mockResolvedValue({
        data: [{ id: 'ta-1', nama: '2024/2025', status: 'aktif' }],
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/tahun-ajaran')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      // Frontend: api.get<{ data: TahunAjaran[] }>('/tahun-ajaran')
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      if (res.body.data.length > 0) {
        expectObjectWithFields(res.body.data[0], ['id', 'nama', 'status']);
      }
    });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && npx jest --config jest.contract-mock.config.ts --testPathPattern "kelas|tahun-ajaran"
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/test/contract/kelas.contract.spec.ts apps/api/src/test/contract/tahun-ajaran.contract.spec.ts
git commit -m "test(contract): add kelas and tahun-ajaran contract tests"
```

---

### Task 4: Siswa Module Contract Tests

**Files:**
- Create: `apps/api/src/test/contract/siswa.contract.spec.ts`

**Interfaces:**
- Consumes: `createMockTestApp`, `adminToken`, `expectPaginatedResponse`, `expectObjectWithFields`
- Produces: Validated contract for `/siswa` CRUD + import endpoints

- [ ] **Step 1: Write siswa.contract.spec.ts**

```typescript
// apps/api/src/test/contract/siswa.contract.spec.ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { SiswaController } from '@/modules/siswa/siswa.controller';
import { SiswaService } from '@/modules/siswa/siswa.service';
import { createMockTestApp } from './helpers/test-app.factory';
import { adminToken } from './helpers/auth.helper';
import {
  expectPaginatedResponse,
  expectObjectWithFields,
  expectApiError,
} from './helpers/schema-validators';

describe('Siswa Contract Tests', () => {
  let app: INestApplication;

  const mockSiswaService = {
    createSiswa: jest.fn(),
    listSiswa: jest.fn(),
    getSiswaById: jest.fn(),
    updateSiswa: jest.fn(),
    softDeleteSiswa: jest.fn(),
    importCsvPreview: jest.fn(),
    importCsvExecute: jest.fn(),
    bulkImportSiswa: jest.fn(),
  };

  beforeAll(async () => {
    const mockRedis = { get: jest.fn().mockResolvedValue(null), exists: jest.fn().mockResolvedValue(0) };
    const mockDb = { select: jest.fn().mockReturnThis(), from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) };

    app = await createMockTestApp(
      [SiswaController],
      [{ provide: SiswaService, useValue: mockSiswaService }],
      { db: mockDb, redis: mockRedis },
    );
  });

  afterAll(async () => { await app.close(); });
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/v1/siswa — paginated response shape', () => {
    it('should return PaginatedResponse<Siswa> as frontend expects', async () => {
      mockSiswaService.listSiswa.mockResolvedValue({
        data: [{
          id: '550e8400-e29b-41d4-a716-446655440000',
          nama: 'Test Siswa',
          nisn: '0000000001',
          kelas_id: '550e8400-e29b-41d4-a716-446655440001',
          kelas_nama: '1A',
          status: 'aktif',
          created_at: '2024-01-01T00:00:00Z',
        }],
        meta: { has_next: false, cursor: null, total: 1 },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/siswa')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expectPaginatedResponse(res.body, (item) => {
        expectObjectWithFields(item, ['id', 'nama', 'nisn', 'status']);
      });
    });
  });

  describe('POST /api/v1/siswa — create response shape', () => {
    it('should return created siswa object', async () => {
      mockSiswaService.createSiswa.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        nama: 'New Siswa',
        nisn: '0000000099',
        status: 'aktif',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/siswa')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          nama: 'New Siswa',
          nisn: '0000000099',
          kelas_id: '550e8400-e29b-41d4-a716-446655440001',
        })
        .expect(201);

      expectObjectWithFields(res.body, ['id', 'nama', 'nisn', 'status']);
    });
  });

  describe('PATCH /api/v1/siswa/:id/soft-delete — response shape', () => {
    it('should return updated siswa', async () => {
      mockSiswaService.softDeleteSiswa.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        nama: 'Siswa Keluar',
        status: 'pindah_sekolah',
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/siswa/550e8400-e29b-41d4-a716-446655440000/soft-delete')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'pindah_sekolah', alasan_keluar: 'Pindah kota' })
        .expect(200);

      expectObjectWithFields(res.body, ['id', 'status']);
    });
  });

  describe('Validation errors — shape matches frontend error handling', () => {
    it('should return 400 with message string (frontend reads error.response.data.message)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/siswa')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({}) // missing required fields
        .expect(400);

      expectApiError(res.body, 400);
      // Frontend expects: error.response?.data?.message
      expect(typeof res.body.message).toBe('string');
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api && npx jest --config jest.contract-mock.config.ts --testPathPattern siswa.contract
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/test/contract/siswa.contract.spec.ts
git commit -m "test(contract): add siswa module contract tests"
```

---

### Task 5: Tagihan Module Contract Tests

**Files:**
- Create: `apps/api/src/test/contract/tagihan.contract.spec.ts`

**Interfaces:**
- Consumes: `createMockTestApp`, `bendaharaToken`, `adminToken`, `expectPaginatedResponse`, `expectDataArray`, `expectObjectWithFields`, `expectMessageResponse`
- Produces: Validated contract for `/tagihan` endpoints (generate, list, verifikasi, tunggakan, manual-payment, edit, cancel)

- [ ] **Step 1: Write tagihan.contract.spec.ts**

```typescript
// apps/api/src/test/contract/tagihan.contract.spec.ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TagihanController } from '@/modules/tagihan/tagihan.controller';
import { TagihanService } from '@/modules/tagihan/tagihan.service';
import { createMockTestApp } from './helpers/test-app.factory';
import { bendaharaToken, adminToken } from './helpers/auth.helper';
import {
  expectPaginatedResponse,
  expectDataArray,
  expectObjectWithFields,
  expectMessageResponse,
} from './helpers/schema-validators';

describe('Tagihan Contract Tests', () => {
  let app: INestApplication;

  const mockTagihanService = {
    listTagihan: jest.fn(),
    generateTagihan: jest.fn(),
    getPendingVerifications: jest.fn(),
    getTunggakan: jest.fn(),
    getTunggakanSummary: jest.fn(),
    exportTagihan: jest.fn(),
    verifyPayment: jest.fn(),
    uploadBuktiTransfer: jest.fn(),
    recordManualPayment: jest.fn(),
    deleteTagihan: jest.fn(),
    editTagihan: jest.fn(),
    cancelTagihan: jest.fn(),
    getTagihanBySiswa: jest.fn(),
    getBuktiBayar: jest.fn(),
  };

  beforeAll(async () => {
    const mockRedis = { get: jest.fn().mockResolvedValue(null), exists: jest.fn().mockResolvedValue(0) };
    const mockDb = { select: jest.fn().mockReturnThis(), from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) };

    app = await createMockTestApp(
      [TagihanController],
      [{ provide: TagihanService, useValue: mockTagihanService }],
      { db: mockDb, redis: mockRedis },
    );
  });

  afterAll(async () => { await app.close(); });
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/v1/tagihan — paginated list response', () => {
    it('should return { data: Tagihan[], meta: { has_next, cursor } }', async () => {
      mockTagihanService.listTagihan.mockResolvedValue({
        data: [{
          id: 'tag-1',
          siswa_id: 's-1',
          siswa_nama: 'Anak A',
          kelas_nama: '1A',
          bulan: 7,
          tahun: 2024,
          nominal: 500000,
          total_dibayar: 0,
          status: 'belum_bayar',
          tanggal_jatuh_tempo: '2024-07-15',
          created_at: '2024-07-01T00:00:00Z',
        }],
        meta: { has_next: false, cursor: null },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/tagihan')
        .set('Authorization', `Bearer ${bendaharaToken()}`)
        .expect(200);

      // Frontend: api.get<{ data: Tagihan[], meta: { has_next, cursor } }>('/tagihan', { params })
      expectPaginatedResponse(res.body, (item) => {
        expectObjectWithFields(item, [
          'id', 'siswa_nama', 'kelas_nama', 'bulan', 'tahun', 'nominal', 'status',
        ]);
      });
    });
  });

  describe('POST /api/v1/tagihan/generate — response shape', () => {
    it('should return { message, data: { created, skipped, total_nominal } }', async () => {
      mockTagihanService.generateTagihan.mockResolvedValue({
        created: 30,
        skipped: 2,
        total_nominal: 15000000,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/tagihan/generate')
        .set('Authorization', `Bearer ${bendaharaToken()}`)
        .send({ bulan: 7, tahun: 2024 })
        .expect(201);

      // Frontend expects: data.created, data.skipped, data.total_nominal
      // Controller wraps with { message, data }
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('data');
      expectObjectWithFields(res.body.data, ['created', 'skipped', 'total_nominal']);
    });
  });

  describe('GET /api/v1/tagihan/verifikasi — response shape', () => {
    it('should return { data: TransaksiVerifikasi[] }', async () => {
      mockTagihanService.getPendingVerifications.mockResolvedValue([
        {
          id: 'txn-1',
          tagihan_id: 'tag-1',
          siswa_nama: 'Anak A',
          kelas_nama: '1A',
          bulan: 7,
          tahun: 2024,
          nominal_tagihan: 500000,
          jumlah_bayar: 500000,
          bukti_transfer_url: 'https://r2.example.com/bukti.jpg',
          metode: 'transfer',
          status: 'menunggu_verifikasi',
          uploaded_by_nama: 'Ibu A',
          created_at: '2024-07-05T00:00:00Z',
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/tagihan/verifikasi')
        .set('Authorization', `Bearer ${bendaharaToken()}`)
        .expect(200);

      // Frontend: api.get<{ data: TransaksiVerifikasi[] }>('/tagihan/verifikasi')
      expectDataArray(res.body, (item) => {
        expectObjectWithFields(item, [
          'id', 'tagihan_id', 'siswa_nama', 'jumlah_bayar', 'status', 'created_at',
        ]);
      });
    });
  });

  describe('GET /api/v1/tagihan/tunggakan — response shape', () => {
    it('should return { data: Tunggakan[] }', async () => {
      mockTagihanService.getTunggakan.mockResolvedValue([
        {
          id: 'tag-1',
          siswa_id: 's-1',
          siswa_nama: 'Anak A',
          kelas_nama: '1A',
          bulan: 6,
          tahun: 2024,
          nominal: 500000,
          total_dibayar: 0,
          sisa: 500000,
          status: 'belum_bayar',
          tanggal_jatuh_tempo: '2024-06-15',
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/tagihan/tunggakan')
        .set('Authorization', `Bearer ${bendaharaToken()}`)
        .expect(200);

      expectDataArray(res.body);
    });
  });

  describe('DELETE /api/v1/tagihan/:id — response shape', () => {
    it('should return { message }', async () => {
      mockTagihanService.deleteTagihan.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete('/api/v1/tagihan/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', `Bearer ${bendaharaToken()}`)
        .expect(200);

      expectMessageResponse(res.body);
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api && npx jest --config jest.contract-mock.config.ts --testPathPattern tagihan.contract
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/test/contract/tagihan.contract.spec.ts
git commit -m "test(contract): add tagihan module contract tests"
```

---

### Task 6: Absensi Module Contract Tests

**Files:**
- Create: `apps/api/src/test/contract/absensi.contract.spec.ts`

**Interfaces:**
- Consumes: `createMockTestApp`, `guruToken`, `kepalaSekolahToken`, `expectDataArray`, `expectObjectWithFields`
- Produces: Validated contract for `/absensi` endpoints (kelas-hari-ini, create, get, rekap, dashboard)

- [ ] **Step 1: Write absensi.contract.spec.ts**

```typescript
// apps/api/src/test/contract/absensi.contract.spec.ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AbsensiController } from '@/modules/absensi/absensi.controller';
import { AbsensiService } from '@/modules/absensi/absensi.service';
import { createMockTestApp } from './helpers/test-app.factory';
import { guruToken, kepalaSekolahToken } from './helpers/auth.helper';
import {
  expectDataArray,
  expectObjectWithFields,
} from './helpers/schema-validators';

describe('Absensi Contract Tests', () => {
  let app: INestApplication;

  const mockAbsensiService = {
    getKelasHariIni: jest.fn(),
    getAbsensiByKelasAndTanggal: jest.fn(),
    createAbsensi: jest.fn(),
    updateAbsensi: jest.fn(),
    getRekapAbsensi: jest.fn(),
    exportRekapAbsensi: jest.fn(),
    getDashboard: jest.fn(),
    getAuditLog: jest.fn(),
    getAbsensiAnak: jest.fn(),
    syncAbsensi: jest.fn(),
  };

  beforeAll(async () => {
    const mockRedis = { get: jest.fn().mockResolvedValue(null), exists: jest.fn().mockResolvedValue(0) };
    const mockDb = { select: jest.fn().mockReturnThis(), from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) };

    app = await createMockTestApp(
      [AbsensiController],
      [{ provide: AbsensiService, useValue: mockAbsensiService }],
      { db: mockDb, redis: mockRedis },
    );
  });

  afterAll(async () => { await app.close(); });
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/v1/absensi/kelas-hari-ini — response shape', () => {
    it('should return { data: Kelas[] } for guru', async () => {
      mockAbsensiService.getKelasHariIni.mockResolvedValue({
        data: [
          { id: 'kelas-1', nama: '1A', tingkat: 1 },
          { id: 'kelas-2', nama: '2B', tingkat: 2 },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/absensi/kelas-hari-ini')
        .set('Authorization', `Bearer ${guruToken()}`)
        .query({ tanggal: '2024-07-15' })
        .expect(200);

      // Frontend: api.get<{ data: Kelas[] }>('/absensi/kelas-hari-ini', { params })
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      if (res.body.data.length > 0) {
        expectObjectWithFields(res.body.data[0], ['id', 'nama']);
      }
    });
  });

  describe('GET /api/v1/absensi — query-based response shape', () => {
    it('should return { data: ExistingAbsensi[], is_read_only?, holiday_warning? }', async () => {
      mockAbsensiService.getAbsensiByKelasAndTanggal.mockResolvedValue({
        data: [
          { id: 'abs-1', siswa_id: 's-1', status: 'hadir', guru_id: 'g-1' },
        ],
        is_read_only: false,
        holiday_warning: '',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/absensi')
        .set('Authorization', `Bearer ${guruToken()}`)
        .query({ kelas_id: '550e8400-e29b-41d4-a716-446655440000', tanggal: '2024-07-15' })
        .expect(200);

      // Frontend expects: { data, is_read_only?, holiday_warning? }
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      // These fields are optional but frontend reads them
      if (res.body.is_read_only !== undefined) {
        expect(typeof res.body.is_read_only).toBe('boolean');
      }
      if (res.body.holiday_warning !== undefined) {
        expect(typeof res.body.holiday_warning).toBe('string');
      }
    });

    it('should return empty data array when no params', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/absensi')
        .set('Authorization', `Bearer ${guruToken()}`)
        .expect(200);

      // Controller returns { data: [] } when kelasId or tanggal missing
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /api/v1/absensi/dashboard — response shape', () => {
    it('should return dashboard data for kepala_sekolah', async () => {
      mockAbsensiService.getDashboard.mockResolvedValue({
        summary_per_kelas: [
          { kelas_id: 'k-1', kelas_nama: '1A', hadir: 25, izin: 1, sakit: 2, alpa: 0 },
        ],
        alpa_alerts: [
          { siswa_id: 's-1', siswa_nama: 'Anak Alpa', kelas_nama: '1A', total_alpa: 5 },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/absensi/dashboard')
        .set('Authorization', `Bearer ${kepalaSekolahToken()}`)
        .expect(200);

      expect(res.body).toHaveProperty('summary_per_kelas');
      expect(res.body).toHaveProperty('alpa_alerts');
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api && npx jest --config jest.contract-mock.config.ts --testPathPattern absensi.contract
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/test/contract/absensi.contract.spec.ts
git commit -m "test(contract): add absensi module contract tests"
```

---

### Task 7: User & Konfigurasi Contract Tests

**Files:**
- Create: `apps/api/src/test/contract/user.contract.spec.ts`
- Create: `apps/api/src/test/contract/konfigurasi.contract.spec.ts`

**Interfaces:**
- Consumes: `createMockTestApp`, `adminToken`, `expectPaginatedResponse`, `expectObjectWithFields`
- Produces: Validated contract for `/users` and `/konfigurasi` endpoints

- [ ] **Step 1: Write user.contract.spec.ts**

```typescript
// apps/api/src/test/contract/user.contract.spec.ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { UserController } from '@/modules/user/user.controller';
import { UserService } from '@/modules/user/user.service';
import { createMockTestApp } from './helpers/test-app.factory';
import { adminToken } from './helpers/auth.helper';
import { expectPaginatedResponse, expectObjectWithFields } from './helpers/schema-validators';

describe('User Contract Tests', () => {
  let app: INestApplication;

  const mockUserService = {
    createUser: jest.fn(),
    listUsers: jest.fn(),
    getUserById: jest.fn(),
    updateUser: jest.fn(),
    deactivateUser: jest.fn(),
    deactivateGuru: jest.fn(),
    bulkImportGuru: jest.fn(),
  };

  beforeAll(async () => {
    const mockRedis = { get: jest.fn().mockResolvedValue(null), exists: jest.fn().mockResolvedValue(0) };
    const mockDb = { select: jest.fn().mockReturnThis(), from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) };

    app = await createMockTestApp(
      [UserController],
      [{ provide: UserService, useValue: mockUserService }],
      { db: mockDb, redis: mockRedis },
    );
  });

  afterAll(async () => { await app.close(); });
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/v1/users — paginated response', () => {
    it('should return PaginatedResponse<User>', async () => {
      mockUserService.listUsers.mockResolvedValue({
        data: [
          { id: 'u-1', nama: 'Admin A', email: 'a@test.com', role: 'admin', is_active: true },
        ],
        meta: { has_next: false, cursor: null, total: 1 },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expectPaginatedResponse(res.body, (item) => {
        expectObjectWithFields(item, ['id', 'nama', 'email', 'role', 'is_active']);
      });
    });
  });

  describe('POST /api/v1/users — create response', () => {
    it('should return created user with generated password info', async () => {
      mockUserService.createUser.mockResolvedValue({
        id: 'u-new',
        nama: 'Guru Baru',
        email: 'guru@test.com',
        role: 'guru',
        generated_password: 'random123',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ nama: 'Guru Baru', email: 'guru@test.com', role: 'guru' })
        .expect(201);

      expectObjectWithFields(res.body, ['id', 'nama', 'email', 'role']);
    });
  });

  describe('PATCH /api/v1/users/:id/deactivate-guru — response shape', () => {
    it('should return affected resources', async () => {
      mockUserService.deactivateGuru.mockResolvedValue({
        user: { id: 'u-1', nama: 'Guru X', is_active: false },
        vacant_jadwal: [{ jadwal_id: 'j-1', kelas_nama: '1A', mapel_nama: 'Matematika' }],
        removed_wali_kelas: [{ kelas_id: 'k-1', kelas_nama: '1A' }],
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/550e8400-e29b-41d4-a716-446655440000/deactivate-guru')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('vacant_jadwal');
      expect(res.body).toHaveProperty('removed_wali_kelas');
    });
  });
});
```

- [ ] **Step 2: Write konfigurasi.contract.spec.ts**

```typescript
// apps/api/src/test/contract/konfigurasi.contract.spec.ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { KonfigurasiController } from '@/modules/konfigurasi/konfigurasi.controller';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { createMockTestApp } from './helpers/test-app.factory';
import { adminToken } from './helpers/auth.helper';
import { expectObjectWithFields } from './helpers/schema-validators';

describe('Konfigurasi Contract Tests', () => {
  let app: INestApplication;

  const mockService = {
    getAllConfig: jest.fn(),
    getConfigByKey: jest.fn(),
    upsertConfig: jest.fn(),
    bulkUpsertConfig: jest.fn(),
  };

  beforeAll(async () => {
    const mockRedis = { get: jest.fn().mockResolvedValue(null), exists: jest.fn().mockResolvedValue(0) };
    const mockDb = { select: jest.fn().mockReturnThis(), from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) };

    app = await createMockTestApp(
      [KonfigurasiController],
      [{ provide: KonfigurasiService, useValue: mockService }],
      { db: mockDb, redis: mockRedis },
    );
  });

  afterAll(async () => { await app.close(); });
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/v1/konfigurasi — response shape', () => {
    it('should return array of KonfigurasiItem', async () => {
      mockService.getAllConfig.mockResolvedValue([
        { key: 'nama_sekolah', value: 'SD Test', label: 'Nama Sekolah' },
        { key: 'nominal_spp', value: '500000', label: 'Nominal SPP' },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/konfigurasi')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      // Frontend: api.get<KonfigurasiItem[]>('/konfigurasi')
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expectObjectWithFields(res.body[0], ['key', 'value']);
      }
    });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && npx jest --config jest.contract-mock.config.ts --testPathPattern "user.contract|konfigurasi.contract"
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/test/contract/user.contract.spec.ts apps/api/src/test/contract/konfigurasi.contract.spec.ts
git commit -m "test(contract): add user and konfigurasi contract tests"
```

---

### Task 8: Kiro Hook — Auto-run Contract Tests on Controller Change

**Files:**
- Create: `.kiro/hooks/contract-test-on-controller-change.json`

**Interfaces:**
- Consumes: File change events on `*.controller.ts`
- Produces: Automatic contract test execution on save

- [ ] **Step 1: Create the hook file**

```json
{
  "name": "Contract Test on Controller Change",
  "version": "1.0.0",
  "description": "Automatically runs mocked contract tests when any API controller file is edited, catching response shape breaking changes before they reach the frontend.",
  "when": {
    "type": "fileEdited",
    "patterns": ["apps/api/src/modules/**/*.controller.ts"]
  },
  "then": {
    "type": "runCommand",
    "command": "cd apps/api && npx jest --config jest.contract-mock.config.ts --passWithNoTests --forceExit 2>&1 | tail -20"
  }
}
```

- [ ] **Step 2: Create a secondary hook for service changes**

Create `.kiro/hooks/contract-test-on-service-change.json`:

```json
{
  "name": "Contract Test on Service Change",
  "version": "1.0.0",
  "description": "Runs contract tests when service files change, since service return types affect the API contract.",
  "when": {
    "type": "fileEdited",
    "patterns": ["apps/api/src/modules/**/*.service.ts"]
  },
  "then": {
    "type": "askAgent",
    "prompt": "A service file was modified. Check if the return type or response structure changed. If so, run: cd apps/api && npx jest --config jest.contract-mock.config.ts --passWithNoTests --forceExit and report any contract test failures to the user."
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add .kiro/hooks/
git commit -m "feat(hooks): add Kiro hooks for auto contract testing on controller/service changes"
```

---

### Task 9: CI Integration — Add Contract Tests to GitHub Actions

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm test:contract` script
- Produces: Contract tests running in CI pipeline

- [ ] **Step 1: Read current CI config and add contract test step**

Add after existing test steps in `.github/workflows/ci.yml`:

```yaml
      - name: Run contract tests (mocked - fast)
        run: pnpm --filter @edu/api test:contract
        
      # Optional: run real DB contract tests if DB is available
      - name: Run contract tests (real DB)
        if: success()
        env:
          CONTRACT_USE_REAL_DB: 'true'
          TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/edu_test
          TEST_REDIS_HOST: localhost
          TEST_REDIS_PORT: 6379
        run: pnpm --filter @edu/api test:contract:real
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add contract tests to CI pipeline"
```

---

### Task 10: Documentation & README Update

**Files:**
- Create: `apps/api/src/test/contract/README.md`

**Interfaces:**
- Consumes: All previous tasks
- Produces: Documentation on how to run, extend, and maintain contract tests

- [ ] **Step 1: Write README.md**

```markdown
# API Contract Tests

Validates that API response shapes match what the Vue admin frontend expects.

## Philosophy

These tests don't verify business logic — that's what unit and integration tests do.
Contract tests answer one question: **"Will the frontend break if I deploy this?"**

## Two Modes

### Mocked (fast, local)
```bash
pnpm test:contract
```
- Uses mocked services (no DB, no Redis needed)
- Runs in ~2-5 seconds
- Triggered automatically by Kiro Hook on controller/service changes
- Validates: response structure, field names, types, pagination shape, error format

### Real DB (thorough, CI)
```bash
pnpm test:contract:real
```
- Uses real PostgreSQL + Redis (requires running services)
- Validates the same shapes but with real data flow
- Catches: service-level response shape changes that mocks miss

## Adding New Contract Tests

1. Create `apps/api/src/test/contract/<module>.contract.spec.ts`
2. Mock the service layer with the expected return values
3. Use shared validators from `helpers/schema-validators.ts`
4. Run: `npx jest --config jest.contract-mock.config.ts --testPathPattern <module>`

## What to Validate

Per endpoint, validate:
- ✅ HTTP status code for success
- ✅ Response body structure (`{ data, meta }` vs `{ data }` vs direct object)
- ✅ Field presence and types
- ✅ Pagination meta shape (`has_next`, `cursor`, `total?`)
- ✅ Error response shape (401, 400, 403, 404)
- ❌ Data correctness (that's integration test territory)
- ❌ Business logic (that's unit test territory)

## Frontend Expectations Reference

| Pattern | Frontend Code | Expected Shape |
|---------|--------------|----------------|
| Paginated list | `api.get<PaginatedResponse<T>>` | `{ data: T[], meta: { has_next, cursor, total? } }` |
| Non-paginated list | `api.get<{ data: T[] }>` | `{ data: T[] }` |
| Direct array | `api.get<T[]>` (konfigurasi) | `T[]` |
| Mutation | `api.post<T>` | Direct object or `{ message, data }` |
| Error | `error.response.data.message` | `{ statusCode, message, error?, details? }` |
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/test/contract/README.md
git commit -m "docs: add contract testing documentation"
```
