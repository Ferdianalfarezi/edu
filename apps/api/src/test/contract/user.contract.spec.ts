import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { UserController } from '@/modules/user/user.controller';
import { UserService } from '@/modules/user/user.service';
import { createMockTestApp, MockProviders } from './helpers/test-app.factory';
import { adminToken, guruToken } from './helpers/auth.helper';
import { expectApiError, expectObjectWithFields, expectUUID } from './helpers/schema-validators';

/**
 * Validates 400 validation error shape from NestJS ValidationPipe.
 */
function expectValidationError(body: any) {
  expect(body).toHaveProperty('statusCode', 400);
  expect(body).toHaveProperty('message');
  if (Array.isArray(body.message)) {
    expect(body.message.length).toBeGreaterThan(0);
    body.message.forEach((msg: any) => expect(typeof msg).toBe('string'));
  } else {
    expect(typeof body.message).toBe('string');
  }
}

describe('User Contract Tests', () => {
  let app: INestApplication;
  let mockUserService: Record<string, jest.Mock>;

  const mockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
  };

  const mockRedis = {
    exists: jest.fn().mockResolvedValue(0),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    mockUserService = {
      createUser: jest.fn(),
      listUsers: jest.fn(),
      getUserById: jest.fn(),
      updateUser: jest.fn(),
      deactivateUser: jest.fn(),
      deactivateGuru: jest.fn(),
      bulkImportGuru: jest.fn(),
    };

    const mocks: MockProviders = {
      db: mockDb,
      redis: mockRedis,
      serviceOverrides: [{ provide: UserService, useValue: mockUserService }],
    };

    app = await createMockTestApp([UserController], [UserService], mocks);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── GET /api/v1/users ──────────────────────────────────────────

  describe('GET /api/v1/users', () => {
    it('should return paginated user list shape', async () => {
      mockUserService.listUsers.mockResolvedValue({
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            nama: 'Admin User',
            email: 'admin@school.com',
            phone: null,
            role: 'admin',
            isActive: true,
            mustChangePassword: false,
            createdAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const user = res.body.data[0];
      expectObjectWithFields(user, ['id', 'nama', 'email', 'role', 'isActive']);
      expect(typeof user.id).toBe('string');
      expect(typeof user.nama).toBe('string');
      expect(typeof user.role).toBe('string');
      expect(typeof user.isActive).toBe('boolean');
    });

    it('should accept role and search query params', async () => {
      mockUserService.listUsers.mockResolvedValue({
        data: [],
        nextCursor: null,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/users?role=guru&search=john')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/users').expect(401);

      expectApiError(res.body, 401);
    });

    it('should return 403 when non-admin role accesses', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${guruToken()}`)
        .expect(403);

      expectApiError(res.body, 403);
    });
  });

  // ─── POST /api/v1/users ─────────────────────────────────────────

  describe('POST /api/v1/users', () => {
    it('should return created user shape on success', async () => {
      mockUserService.createUser.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440002',
        nama: 'New Guru',
        email: 'guru@school.com',
        phone: null,
        role: 'guru',
        isActive: true,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          nama: 'New Guru',
          email: 'guru@school.com',
          role: 'guru',
        })
        .expect(201);

      expectObjectWithFields(res.body, ['id', 'nama', 'email', 'role', 'isActive']);
      expectUUID(res.body.id);
      expect(res.body.nama).toBe('New Guru');
      expect(res.body.email).toBe('guru@school.com');
      expect(res.body.role).toBe('guru');
      expect(res.body.isActive).toBe(true);
      expect(res.body.mustChangePassword).toBe(true);
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400);

      expectValidationError(res.body);
    });

    it('should return 400 when email format is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          nama: 'Test User',
          email: 'not-an-email',
          role: 'guru',
        })
        .expect(400);

      expectValidationError(res.body);
    });

    it('should return 400 when role is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          nama: 'Test User',
          email: 'test@school.com',
          role: 'invalid_role',
        })
        .expect(400);

      expectValidationError(res.body);
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .send({
          nama: 'Test User',
          email: 'test@school.com',
          role: 'guru',
        })
        .expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── PATCH /api/v1/users/:id/deactivate ─────────────────────────

  describe('PATCH /api/v1/users/:id/deactivate', () => {
    it('should return deactivated user shape on success', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440001';
      mockUserService.deactivateUser.mockResolvedValue({
        id: userId,
        nama: 'Deactivated User',
        isActive: false,
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${userId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expectObjectWithFields(res.body, ['id', 'nama', 'isActive']);
      expect(res.body.isActive).toBe(false);
    });

    it('should return 401 when no auth token is provided', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440001';
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${userId}/deactivate`)
        .expect(401);

      expectApiError(res.body, 401);
    });

    it('should return 400 when id is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/not-a-uuid/deactivate')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
    });
  });

  // ─── PATCH /api/v1/users/:id/deactivate-guru ────────────────────

  describe('PATCH /api/v1/users/:id/deactivate-guru', () => {
    it('should return deactivated guru with vacant jadwal and removed wali kelas', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440001';
      mockUserService.deactivateGuru.mockResolvedValue({
        deactivatedUser: {
          id: userId,
          nama: 'Guru Ahmad',
          email: 'ahmad@school.com',
          isActive: false,
        },
        vacantJadwalSlots: [
          {
            id: '770e8400-e29b-41d4-a716-446655440001',
            kelasId: '880e8400-e29b-41d4-a716-446655440001',
            mataPelajaranId: '990e8400-e29b-41d4-a716-446655440001',
            hari: 'senin',
            jamMulai: '08:00',
            jamSelesai: '09:30',
            semester: 1,
            tahunAjaranId: 'aa0e8400-e29b-41d4-a716-446655440001',
          },
        ],
        removedWaliKelas: [
          {
            kelasId: '880e8400-e29b-41d4-a716-446655440001',
            kelasNama: 'Kelas 1A',
            tahunAjaranId: 'aa0e8400-e29b-41d4-a716-446655440001',
          },
        ],
        message:
          '1 slot jadwal kosong, silakan assign guru pengganti. 1 kelas kehilangan wali kelas.',
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${userId}/deactivate-guru`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      // Validate top-level shape
      expectObjectWithFields(res.body, [
        'deactivatedUser',
        'vacantJadwalSlots',
        'removedWaliKelas',
        'message',
      ]);

      // Validate deactivatedUser shape
      expectObjectWithFields(res.body.deactivatedUser, ['id', 'nama', 'email', 'isActive']);
      expect(res.body.deactivatedUser.isActive).toBe(false);

      // Validate vacantJadwalSlots array
      expect(Array.isArray(res.body.vacantJadwalSlots)).toBe(true);
      if (res.body.vacantJadwalSlots.length > 0) {
        const slot = res.body.vacantJadwalSlots[0];
        expectObjectWithFields(slot, [
          'id',
          'kelasId',
          'mataPelajaranId',
          'hari',
          'jamMulai',
          'jamSelesai',
          'semester',
          'tahunAjaranId',
        ]);
      }

      // Validate removedWaliKelas array
      expect(Array.isArray(res.body.removedWaliKelas)).toBe(true);
      if (res.body.removedWaliKelas.length > 0) {
        const removed = res.body.removedWaliKelas[0];
        expectObjectWithFields(removed, ['kelasId', 'kelasNama', 'tahunAjaranId']);
      }

      // Validate message
      expect(typeof res.body.message).toBe('string');
    });

    it('should return 401 when no auth token is provided', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440001';
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${userId}/deactivate-guru`)
        .expect(401);

      expectApiError(res.body, 401);
    });

    it('should return 400 when id is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/not-a-uuid/deactivate-guru')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
    });
  });
});
