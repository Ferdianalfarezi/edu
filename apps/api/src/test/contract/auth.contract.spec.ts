import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AuthController } from '@/modules/auth/auth.controller';
import { AuthService } from '@/modules/auth/auth.service';
import { createMockTestApp, MockProviders } from './helpers/test-app.factory';
import { adminToken } from './helpers/auth.helper';
import {
  expectLoginResponse,
  expectMessageResponse,
  expectApiError,
} from './helpers/schema-validators';

/**
 * NestJS ValidationPipe returns message as string[] when there are multiple
 * validation errors. This validates the 400 validation error shape.
 */
function expectValidationError(body: any) {
  expect(body).toHaveProperty('statusCode', 400);
  expect(body).toHaveProperty('message');
  // message can be string or string[] depending on the number of errors
  if (Array.isArray(body.message)) {
    expect(body.message.length).toBeGreaterThan(0);
    body.message.forEach((msg: any) => expect(typeof msg).toBe('string'));
  } else {
    expect(typeof body.message).toBe('string');
  }
  if (body.error !== undefined) {
    expect(typeof body.error).toBe('string');
  }
}

describe('Auth Contract Tests', () => {
  let app: INestApplication;
  let mockAuthService: Record<string, jest.Mock>;

  // Mock DB: returns empty array for any select query (no tokens_invalidated_at check fails)
  const mockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
  };

  // Mock Redis: exists returns 0 (not blacklisted), quit is a no-op
  const mockRedis = {
    exists: jest.fn().mockResolvedValue(0),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    mockAuthService = {
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      requestPasswordReset: jest.fn(),
      confirmPasswordReset: jest.fn(),
      changePassword: jest.fn(),
    };

    const mocks: MockProviders = {
      db: mockDb,
      redis: mockRedis,
      serviceOverrides: [{ provide: AuthService, useValue: mockAuthService }],
    };

    app = await createMockTestApp([AuthController], [AuthService], mocks);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── POST /api/v1/auth/login ────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('should return LoginResponse shape on success', async () => {
      mockAuthService.login.mockResolvedValue({
        access_token: 'eyJhbGciOiJIUzI1NiJ9.test.sig',
        refresh_token: 'eyJhbGciOiJIUzI1NiJ9.refresh.sig',
        must_change_password: false,
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Admin User',
          role: 'admin',
          tenant_id: '660e8400-e29b-41d4-a716-446655440000',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@school.com',
          password: 'password123',
          platform: 'admin_panel',
        })
        .expect(200);

      expectLoginResponse(res.body);
    });

    it('should return 400 validation error when platform is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@school.com',
          password: 'password123',
        })
        .expect(400);

      expectValidationError(res.body);
    });

    it('should return 400 validation error when platform has invalid value', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@school.com',
          password: 'password123',
          platform: 'invalid_platform',
        })
        .expect(400);

      expectValidationError(res.body);
    });

    it('should return 401 shape when credentials are invalid', async () => {
      mockAuthService.login.mockRejectedValue(
        new (await import('@nestjs/common')).UnauthorizedException('Email atau password salah'),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'wrong@school.com',
          password: 'wrongpassword',
          platform: 'admin_panel',
        })
        .expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── POST /api/v1/auth/refresh ──────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('should return token pair shape on success', async () => {
      mockAuthService.refresh.mockResolvedValue({
        access_token: 'eyJhbGciOiJIUzI1NiJ9.new-access.sig',
        refresh_token: 'eyJhbGciOiJIUzI1NiJ9.new-refresh.sig',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: 'eyJhbGciOiJIUzI1NiJ9.old-refresh.sig' })
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      expect(typeof res.body.access_token).toBe('string');
      expect(res.body).toHaveProperty('refresh_token');
      expect(typeof res.body.refresh_token).toBe('string');
    });

    it('should return 400 when refresh_token is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);

      expectValidationError(res.body);
    });
  });

  // ─── POST /api/v1/auth/logout ───────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('should return message shape on success (requires auth)', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(200);

      expectMessageResponse(res.body);
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({})
        .expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── POST /api/v1/auth/change-password ──────────────────────────

  describe('POST /api/v1/auth/change-password', () => {
    it('should return message shape on success (requires auth)', async () => {
      mockAuthService.changePassword.mockResolvedValue({
        message: 'Password berhasil diubah. Sesi lain telah di-logout.',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ old_password: 'OldPass123', new_password: 'NewPass456' })
        .expect(200);

      expectMessageResponse(res.body);
    });

    it('should return 400 when body is missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400);

      expectValidationError(res.body);
    });

    it('should return 400 when new_password is too short', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ old_password: 'OldPass123', new_password: '12345' })
        .expect(400);

      expectValidationError(res.body);
    });

    it('should return 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .send({ old_password: 'OldPass123', new_password: 'NewPass456' })
        .expect(401);

      expectApiError(res.body, 401);
    });
  });

  // ─── POST /api/v1/auth/reset-password/request ───────────────────

  describe('POST /api/v1/auth/reset-password/request', () => {
    it('should return message shape on success', async () => {
      mockAuthService.requestPasswordReset.mockResolvedValue({
        message: 'Jika email terdaftar, link reset password telah dikirim',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password/request')
        .send({ email: 'user@school.com' })
        .expect(200);

      expectMessageResponse(res.body);
    });

    it('should return 400 when email is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password/request')
        .send({})
        .expect(400);

      expectValidationError(res.body);
    });

    it('should return 400 when email format is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password/request')
        .send({ email: 'not-an-email' })
        .expect(400);

      expectValidationError(res.body);
    });
  });

  // ─── POST /api/v1/auth/reset-password/confirm ──────────────────

  describe('POST /api/v1/auth/reset-password/confirm', () => {
    it('should return message shape on success', async () => {
      mockAuthService.confirmPasswordReset.mockResolvedValue({
        message: 'Password berhasil diubah. Silakan login dengan password baru.',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password/confirm')
        .send({ token: 'abc123def456', new_password: 'NewSecure789' })
        .expect(200);

      expectMessageResponse(res.body);
    });

    it('should return 400 when token is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password/confirm')
        .send({ new_password: 'NewSecure789' })
        .expect(400);

      expectValidationError(res.body);
    });

    it('should return 400 when new_password is too short', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password/confirm')
        .send({ token: 'abc123def456', new_password: '123' })
        .expect(400);

      expectValidationError(res.body);
    });

    it('should return 400 when body is empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password/confirm')
        .send({})
        .expect(400);

      expectValidationError(res.body);
    });
  });
});
