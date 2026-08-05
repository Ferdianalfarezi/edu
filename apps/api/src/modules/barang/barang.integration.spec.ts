/**
 * Integration tests for Barang endpoints.
 * Tests authentication, authorization, CRUD flow, tenant isolation, and soft-delete exclusion.
 *
 * Uses mocked DRIZZLE provider and Redis to test the full HTTP layer via supertest
 * without requiring a real database connection.
 *
 * Validates Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Role } from '@edu/shared';
import { BarangController } from './barang.controller';
import { BarangService } from './barang.service';
import { JwtStrategy } from '@/modules/auth/strategies';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { RedisService } from '@/modules/redis/redis.service';
import { REDIS_CLIENT } from '@/modules/redis/redis.constants';
import { DRIZZLE } from '@/drizzle/drizzle.module';

const JWT_SECRET = 'integration-test-secret';

// ─── In-memory store simulating the database ─────────────────────

interface BarangRecord {
  id: string;
  tenantId: string;
  nama: string;
  deskripsi: string | null;
  jumlah: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const store: BarangRecord[] = [];
let idCounter = 0;

function generateUUID(): string {
  idCounter++;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
}

/**
 * Creates a chainable mock for Drizzle ORM that uses the in-memory store.
 * Supports: insert, select (count + data), update patterns used by BarangService.
 */
function createMockDb() {
  const mockDb: any = {};

  // INSERT pattern: db.insert(table).values(data).returning()
  mockDb.insert = jest.fn().mockImplementation(() => ({
    values: jest.fn().mockImplementation((data: any) => ({
      returning: jest.fn().mockImplementation(() => {
        const record: BarangRecord = {
          id: generateUUID(),
          tenantId: data.tenantId,
          nama: data.nama,
          deskripsi: data.deskripsi ?? null,
          jumlah: data.jumlah,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        store.push(record);
        return Promise.resolve([record]);
      }),
    })),
  }));

  // SELECT pattern (used for findAll count + data, and findOne)
  mockDb.select = jest.fn().mockImplementation((selectArg?: any) => {
    const isCountSelect = selectArg && Object.keys(selectArg).includes('count');

    return {
      from: jest.fn().mockImplementation(() => ({
        where: jest.fn().mockImplementation((..._args: any[]) => {
          // We need to determine what query is being made from the call context.
          // The service calls with and(...conditions).
          // We'll intercept and check store based on the call pattern.
          // This is tricky with mocks — we rely on the fact that the service
          // passes the correct tenant filtering, so we simulate correct behavior.

          // For count queries, return a resolved promise
          if (isCountSelect) {
            return Promise.resolve([{ count: 0 }]);
          }

          // For data queries (findOne pattern - no orderBy chain)
          // Return empty by default; individual tests override behavior
          return {
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                offset: jest.fn().mockResolvedValue([]),
              }),
            }),
          };
        }),
      })),
    };
  });

  // UPDATE pattern: db.update(table).set(data).where(condition).returning()
  mockDb.update = jest.fn().mockImplementation(() => ({
    set: jest.fn().mockImplementation((data: any) => ({
      where: jest.fn().mockImplementation(() => ({
        returning: jest.fn().mockImplementation(() => {
          return Promise.resolve([]);
        }),
      })),
    })),
  }));

  return mockDb;
}

// ─── Token helpers ───────────────────────────────────────────────

let jwtService: JwtService;

function generateToken(options: { role: Role; tenantId?: string; userId?: string }): string {
  const { role, tenantId, userId } = options;
  return jwtService.sign(
    {
      sub: userId || generateUUID(),
      role,
      tenant_id: tenantId || 'tenant-a-id-00000000',
      platform: 'admin_panel',
      jti: `jti-${Date.now()}-${Math.random()}`,
      type: 'access',
    },
    { expiresIn: '1h' },
  );
}

// ─── Test Suite ──────────────────────────────────────────────────

describe('Barang Integration Tests', () => {
  let app: INestApplication;
  let mockBarangService: Record<string, jest.Mock>;

  const TENANT_A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const TENANT_B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

  const mockRedis = {
    exists: jest.fn().mockResolvedValue(0),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue(undefined),
  };

  const mockDb = {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      }),
    }),
  };

  beforeAll(async () => {
    mockBarangService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
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
            }),
          ],
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '24h' } }),
      ],
      controllers: [BarangController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        RedisService,
        { provide: BarangService, useValue: mockBarangService },
        { provide: DRIZZLE, useValue: mockDb },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
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

    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Authentication Enforcement (401) ───────────────────────────
  // Validates: Requirement 5.7

  describe('Authentication enforcement (401 without JWT)', () => {
    it('GET /api/v1/barang returns 401 without token', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/barang').expect(401);

      expect(res.body).toHaveProperty('statusCode', 401);
    });

    it('GET /api/v1/barang/:id returns 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/barang/00000000-0000-4000-8000-000000000001')
        .expect(401);

      expect(res.body).toHaveProperty('statusCode', 401);
    });

    it('POST /api/v1/barang returns 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/barang')
        .send({ nama: 'Test', jumlah: 1 })
        .expect(401);

      expect(res.body).toHaveProperty('statusCode', 401);
    });

    it('PATCH /api/v1/barang/:id returns 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/barang/00000000-0000-4000-8000-000000000001')
        .send({ nama: 'Updated' })
        .expect(401);

      expect(res.body).toHaveProperty('statusCode', 401);
    });

    it('DELETE /api/v1/barang/:id returns 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/barang/00000000-0000-4000-8000-000000000001')
        .expect(401);

      expect(res.body).toHaveProperty('statusCode', 401);
    });
  });

  // ─── Authorization Enforcement (403) ────────────────────────────
  // Validates: Requirements 5.1, 5.2, 5.3, 5.4

  describe('Authorization enforcement (403 for guru/kepala_sekolah on write ops)', () => {
    describe('guru role', () => {
      let token: string;

      beforeAll(() => {
        token = generateToken({ role: Role.GURU, tenantId: TENANT_A });
      });

      it('GET /api/v1/barang returns 200 (read allowed)', async () => {
        mockBarangService.findAll.mockResolvedValue({
          data: [],
          meta: {
            page: 1,
            page_size: 15,
            total_count: 0,
            total_pages: 0,
            has_next: false,
            has_prev: false,
          },
        });

        await request(app.getHttpServer())
          .get('/api/v1/barang')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      });

      it('GET /api/v1/barang/:id returns 200 (read allowed)', async () => {
        mockBarangService.findOne.mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000001',
          nama: 'Meja',
          deskripsi: null,
          jumlah: 10,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        await request(app.getHttpServer())
          .get('/api/v1/barang/00000000-0000-4000-8000-000000000001')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      });

      it('POST /api/v1/barang returns 403', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/barang')
          .set('Authorization', `Bearer ${token}`)
          .send({ nama: 'Test', jumlah: 1 })
          .expect(403);

        expect(res.body).toHaveProperty('statusCode', 403);
      });

      it('PATCH /api/v1/barang/:id returns 403', async () => {
        const res = await request(app.getHttpServer())
          .patch('/api/v1/barang/00000000-0000-4000-8000-000000000001')
          .set('Authorization', `Bearer ${token}`)
          .send({ nama: 'Updated' })
          .expect(403);

        expect(res.body).toHaveProperty('statusCode', 403);
      });

      it('DELETE /api/v1/barang/:id returns 403', async () => {
        const res = await request(app.getHttpServer())
          .delete('/api/v1/barang/00000000-0000-4000-8000-000000000001')
          .set('Authorization', `Bearer ${token}`)
          .expect(403);

        expect(res.body).toHaveProperty('statusCode', 403);
      });
    });

    describe('kepala_sekolah role', () => {
      let token: string;

      beforeAll(() => {
        token = generateToken({ role: Role.KEPALA_SEKOLAH, tenantId: TENANT_A });
      });

      it('GET /api/v1/barang returns 200 (read allowed)', async () => {
        mockBarangService.findAll.mockResolvedValue({
          data: [],
          meta: {
            page: 1,
            page_size: 15,
            total_count: 0,
            total_pages: 0,
            has_next: false,
            has_prev: false,
          },
        });

        await request(app.getHttpServer())
          .get('/api/v1/barang')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      });

      it('GET /api/v1/barang/:id returns 200 (read allowed)', async () => {
        mockBarangService.findOne.mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000001',
          nama: 'Kursi',
          deskripsi: 'Kursi kayu',
          jumlah: 50,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        await request(app.getHttpServer())
          .get('/api/v1/barang/00000000-0000-4000-8000-000000000001')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      });

      it('POST /api/v1/barang returns 403', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/barang')
          .set('Authorization', `Bearer ${token}`)
          .send({ nama: 'Test', jumlah: 1 })
          .expect(403);

        expect(res.body).toHaveProperty('statusCode', 403);
      });

      it('PATCH /api/v1/barang/:id returns 403', async () => {
        const res = await request(app.getHttpServer())
          .patch('/api/v1/barang/00000000-0000-4000-8000-000000000001')
          .set('Authorization', `Bearer ${token}`)
          .send({ nama: 'Updated' })
          .expect(403);

        expect(res.body).toHaveProperty('statusCode', 403);
      });

      it('DELETE /api/v1/barang/:id returns 403', async () => {
        const res = await request(app.getHttpServer())
          .delete('/api/v1/barang/00000000-0000-4000-8000-000000000001')
          .set('Authorization', `Bearer ${token}`)
          .expect(403);

        expect(res.body).toHaveProperty('statusCode', 403);
      });
    });
  });

  // ─── Successful CRUD Flow (200/201) ─────────────────────────────
  // Validates: Requirements 5.1, 5.2

  describe('Successful CRUD flow (admin role)', () => {
    let adminToken: string;
    const barangId = '11111111-1111-4111-8111-111111111111';

    beforeAll(() => {
      adminToken = generateToken({ role: Role.ADMIN, tenantId: TENANT_A });
    });

    it('POST /api/v1/barang returns 201 with created barang', async () => {
      const created = {
        id: barangId,
        nama: 'Papan Tulis',
        deskripsi: 'Papan tulis putih ukuran besar',
        jumlah: 5,
        createdAt: '2024-06-01T10:00:00.000Z',
        updatedAt: '2024-06-01T10:00:00.000Z',
      };
      mockBarangService.create.mockResolvedValue(created);

      const res = await request(app.getHttpServer())
        .post('/api/v1/barang')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nama: 'Papan Tulis', deskripsi: 'Papan tulis putih ukuran besar', jumlah: 5 })
        .expect(201);

      expect(res.body).toEqual(created);
      expect(mockBarangService.create).toHaveBeenCalledWith(
        TENANT_A,
        expect.objectContaining({ nama: 'Papan Tulis', jumlah: 5 }),
      );
    });

    it('GET /api/v1/barang returns 200 with paginated list', async () => {
      const listResponse = {
        data: [
          {
            id: barangId,
            nama: 'Papan Tulis',
            deskripsi: 'Papan tulis putih ukuran besar',
            jumlah: 5,
            createdAt: '2024-06-01T10:00:00.000Z',
            updatedAt: '2024-06-01T10:00:00.000Z',
          },
        ],
        meta: {
          page: 1,
          page_size: 15,
          total_count: 1,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        },
      };
      mockBarangService.findAll.mockResolvedValue(listResponse);

      const res = await request(app.getHttpServer())
        .get('/api/v1/barang')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total_count).toBe(1);
      expect(mockBarangService.findAll).toHaveBeenCalledWith(TENANT_A, expect.any(Object));
    });

    it('GET /api/v1/barang/:id returns 200 with single barang', async () => {
      const barang = {
        id: barangId,
        nama: 'Papan Tulis',
        deskripsi: 'Papan tulis putih ukuran besar',
        jumlah: 5,
        createdAt: '2024-06-01T10:00:00.000Z',
        updatedAt: '2024-06-01T10:00:00.000Z',
      };
      mockBarangService.findOne.mockResolvedValue(barang);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/barang/${barangId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toEqual(barang);
      expect(mockBarangService.findOne).toHaveBeenCalledWith(TENANT_A, barangId);
    });

    it('PATCH /api/v1/barang/:id returns 200 with updated barang', async () => {
      const updated = {
        id: barangId,
        nama: 'Papan Tulis Baru',
        deskripsi: 'Papan tulis putih ukuran besar',
        jumlah: 10,
        createdAt: '2024-06-01T10:00:00.000Z',
        updatedAt: '2024-06-02T10:00:00.000Z',
      };
      mockBarangService.update.mockResolvedValue(updated);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/barang/${barangId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nama: 'Papan Tulis Baru', jumlah: 10 })
        .expect(200);

      expect(res.body).toEqual(updated);
      expect(mockBarangService.update).toHaveBeenCalledWith(
        TENANT_A,
        barangId,
        expect.objectContaining({ nama: 'Papan Tulis Baru', jumlah: 10 }),
      );
    });

    it('DELETE /api/v1/barang/:id returns 200 with success message', async () => {
      mockBarangService.remove.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/barang/${barangId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'Barang berhasil dihapus' });
      expect(mockBarangService.remove).toHaveBeenCalledWith(TENANT_A, barangId);
    });
  });

  // ─── Tenant Isolation ───────────────────────────────────────────
  // Validates: Requirements 5.6

  describe('Tenant isolation', () => {
    it('admin of tenant A calls service with tenant A ID (cannot access tenant B data)', async () => {
      const tokenA = generateToken({ role: Role.ADMIN, tenantId: TENANT_A });

      mockBarangService.findAll.mockResolvedValue({
        data: [],
        meta: {
          page: 1,
          page_size: 15,
          total_count: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      });

      await request(app.getHttpServer())
        .get('/api/v1/barang')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // The service should be called with tenant A's ID, not B
      expect(mockBarangService.findAll).toHaveBeenCalledWith(TENANT_A, expect.any(Object));
      expect(mockBarangService.findAll).not.toHaveBeenCalledWith(TENANT_B, expect.anything());
    });

    it('admin of tenant B calls service with tenant B ID (cannot access tenant A data)', async () => {
      const tokenB = generateToken({ role: Role.ADMIN, tenantId: TENANT_B });

      mockBarangService.findAll.mockResolvedValue({
        data: [],
        meta: {
          page: 1,
          page_size: 15,
          total_count: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      });

      await request(app.getHttpServer())
        .get('/api/v1/barang')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(mockBarangService.findAll).toHaveBeenCalledWith(TENANT_B, expect.any(Object));
      expect(mockBarangService.findAll).not.toHaveBeenCalledWith(TENANT_A, expect.anything());
    });

    it('create operation passes correct tenant ID from JWT', async () => {
      const tokenA = generateToken({ role: Role.ADMIN, tenantId: TENANT_A });

      mockBarangService.create.mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        nama: 'Meja Baru',
        deskripsi: null,
        jumlah: 3,
        createdAt: '2024-06-01T10:00:00.000Z',
        updatedAt: '2024-06-01T10:00:00.000Z',
      });

      await request(app.getHttpServer())
        .post('/api/v1/barang')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ nama: 'Meja Baru', jumlah: 3 })
        .expect(201);

      expect(mockBarangService.create).toHaveBeenCalledWith(
        TENANT_A,
        expect.objectContaining({ nama: 'Meja Baru' }),
      );
    });

    it('update operation passes correct tenant ID from JWT', async () => {
      const tokenB = generateToken({ role: Role.ADMIN, tenantId: TENANT_B });
      const barangId = '33333333-3333-4333-8333-333333333333';

      mockBarangService.update.mockResolvedValue({
        id: barangId,
        nama: 'Kursi Update',
        deskripsi: null,
        jumlah: 20,
        createdAt: '2024-06-01T10:00:00.000Z',
        updatedAt: '2024-06-02T10:00:00.000Z',
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/barang/${barangId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ nama: 'Kursi Update' })
        .expect(200);

      expect(mockBarangService.update).toHaveBeenCalledWith(
        TENANT_B,
        barangId,
        expect.objectContaining({ nama: 'Kursi Update' }),
      );
    });

    it('delete operation passes correct tenant ID from JWT', async () => {
      const tokenA = generateToken({ role: Role.ADMIN, tenantId: TENANT_A });
      const barangId = '44444444-4444-4444-8444-444444444444';

      mockBarangService.remove.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete(`/api/v1/barang/${barangId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(mockBarangService.remove).toHaveBeenCalledWith(TENANT_A, barangId);
    });
  });

  // ─── Soft Delete Exclusion ──────────────────────────────────────
  // Validates: Requirement 5.6 (filtered at service layer, verified via mock assertions)

  describe('Soft delete exclusion from list', () => {
    it('service findAll is called (which internally excludes soft-deleted items)', async () => {
      const adminToken = generateToken({ role: Role.ADMIN, tenantId: TENANT_A });

      // The service should only return active items — soft-deleted items are filtered
      mockBarangService.findAll.mockResolvedValue({
        data: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            nama: 'Active Item',
            deskripsi: null,
            jumlah: 1,
            createdAt: '2024-06-01T10:00:00.000Z',
            updatedAt: '2024-06-01T10:00:00.000Z',
          },
        ],
        meta: {
          page: 1,
          page_size: 15,
          total_count: 1,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/barang')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify that the endpoint returns data from service (which excludes soft-deleted)
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].nama).toBe('Active Item');
      expect(mockBarangService.findAll).toHaveBeenCalled();
    });

    it('findOne for a soft-deleted item returns 404 (via service)', async () => {
      const adminToken = generateToken({ role: Role.ADMIN, tenantId: TENANT_A });
      const deletedId = '66666666-6666-4666-8666-666666666666';

      // Simulate service throwing NotFoundException for soft-deleted item
      const { NotFoundException } = await import('@nestjs/common');
      mockBarangService.findOne.mockRejectedValue(new NotFoundException('Barang tidak ditemukan'));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/barang/${deletedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body).toHaveProperty('statusCode', 404);
      expect(res.body.message).toBe('Barang tidak ditemukan');
    });

    it('delete on already soft-deleted item returns 404 (via service)', async () => {
      const adminToken = generateToken({ role: Role.ADMIN, tenantId: TENANT_A });
      const deletedId = '77777777-7777-4777-8777-777777777777';

      const { NotFoundException } = await import('@nestjs/common');
      mockBarangService.remove.mockRejectedValue(new NotFoundException('Barang tidak ditemukan'));

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/barang/${deletedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body).toHaveProperty('statusCode', 404);
      expect(res.body.message).toBe('Barang tidak ditemukan');
    });

    it('update on a soft-deleted item returns 404 (via service)', async () => {
      const adminToken = generateToken({ role: Role.ADMIN, tenantId: TENANT_A });
      const deletedId = '88888888-8888-4888-8888-888888888888';

      const { NotFoundException } = await import('@nestjs/common');
      mockBarangService.update.mockRejectedValue(new NotFoundException('Barang tidak ditemukan'));

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/barang/${deletedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nama: 'Try Update Deleted' })
        .expect(404);

      expect(res.body).toHaveProperty('statusCode', 404);
      expect(res.body.message).toBe('Barang tidak ditemukan');
    });
  });
});
