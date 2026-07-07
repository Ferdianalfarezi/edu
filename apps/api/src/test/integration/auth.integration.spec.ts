/**
 * Integration tests for authentication flows.
 * Tests the full login → token → refresh → logout cycle against real PostgreSQL and Redis.
 *
 * Validates Requirements:
 * - 19.1–19.11 (Authentication & Security)
 * - 20.1–20.9 (Password Reset/Change)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import Redis from 'ioredis';
import { getQueueToken } from '@nestjs/bull';

import { AuthService } from '@/modules/auth/auth.service';
import { AuthController } from '@/modules/auth/auth.controller';
import { JwtStrategy } from '@/modules/auth/strategies';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RedisService } from '@/modules/redis/redis.service';
import { REDIS_CLIENT } from '@/modules/redis/redis.module';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { QUEUE_NAMES } from '@/modules/queue';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/edu_test';
const TEST_REDIS_HOST = process.env.TEST_REDIS_HOST || 'localhost';
const TEST_REDIS_PORT = parseInt(process.env.TEST_REDIS_PORT || '6379', 10);

const JWT_ACCESS_SECRET = 'test-access-secret-key-for-integration';
const JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-integration';

describe('Auth Integration Tests', () => {
  let app: INestApplication;
  let db: NodePgDatabase;
  let pool: Pool;
  let redis: Redis;
  let jwtService: JwtService;

  // Test data IDs
  let tenantId: string;
  let tenant2Id: string;
  let adminUserId: string;
  let guruUserId: string;
  let parentUserId: string;
  let kelasId: string;
  let kelas2Id: string;
  let tahunAjaranId: string;
  let tahunAjaran2Id: string;
  let siswaId: string;
  let siswa2Id: string;

  const adminEmail = 'admin@testschool.com';
  const adminPassword = 'SecurePass123';
  const guruEmail = 'guru@testschool.com';
  const guruPassword = 'TeacherPass456';
  const parentPhone = '081234567890';

  // Mock email queue (we don't want real emails)
  const mockEmailQueue = {
    add: jest.fn().mockResolvedValue({}),
  };

  beforeAll(async () => {
    // Set up real PostgreSQL connection
    pool = new Pool({ connectionString: TEST_DB_URL, max: 5 });
    db = drizzle(pool);

    // Set up real Redis connection
    redis = new Redis({ host: TEST_REDIS_HOST, port: TEST_REDIS_PORT, maxRetriesPerRequest: 3 });

    // Create the NestJS testing module with real DB and Redis
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_ACCESS_SECRET,
              JWT_REFRESH_SECRET,
              JWT_ACCESS_EXPIRATION: '24h',
              JWT_REFRESH_EXPIRATION: '7d',
              REDIS_HOST: TEST_REDIS_HOST,
              REDIS_PORT: TEST_REDIS_PORT,
              FRONTEND_URL: 'http://localhost:3000',
            }),
          ],
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: JWT_ACCESS_SECRET,
          signOptions: { expiresIn: '24h' },
        }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        RedisService,
        { provide: DRIZZLE, useValue: db },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: mockEmailQueue },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Seed test data
    await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
    await pool.end();
    await redis.quit();
  });

  afterEach(async () => {
    // Clear Redis blacklist entries between tests
    const keys = await redis.keys('blacklist:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    mockEmailQueue.add.mockClear();
  });

  // ─── Seed Helpers ──────────────────────────────────────────────

  async function seedTestData() {
    const client = await pool.connect();
    try {
      // Create tenants
      const tenantResult = await client.query(
        `INSERT INTO "tenant" (nama, alamat, is_active) VALUES ($1, $2, true) RETURNING id`,
        ['Sekolah A', 'Jl. Test 1'],
      );
      tenantId = tenantResult.rows[0].id;

      const tenant2Result = await client.query(
        `INSERT INTO "tenant" (nama, alamat, is_active) VALUES ($1, $2, true) RETURNING id`,
        ['Sekolah B', 'Jl. Test 2'],
      );
      tenant2Id = tenant2Result.rows[0].id;

      // Create admin user (email+password)
      const adminHash = await bcrypt.hash(adminPassword, 10);
      const adminResult = await client.query(
        `INSERT INTO "user" (tenant_id, nama, email, password_hash, role, is_active, failed_login_attempts)
         VALUES ($1, $2, $3, $4, $5, true, 0) RETURNING id`,
        [tenantId, 'Admin Test', adminEmail, adminHash, 'admin'],
      );
      adminUserId = adminResult.rows[0].id;

      // Create guru user (email+password, can access both platforms)
      const guruHash = await bcrypt.hash(guruPassword, 10);
      const guruResult = await client.query(
        `INSERT INTO "user" (tenant_id, nama, email, password_hash, role, is_active, failed_login_attempts)
         VALUES ($1, $2, $3, $4, $5, true, 0) RETURNING id`,
        [tenantId, 'Guru Test', guruEmail, guruHash, 'guru'],
      );
      guruUserId = guruResult.rows[0].id;

      // Create parent user (phone-only, no tenant_id per ADR-002)
      const parentResult = await client.query(
        `INSERT INTO "user" (tenant_id, nama, phone, role, is_active, failed_login_attempts)
         VALUES (NULL, $1, $2, $3, true, 0) RETURNING id`,
        ['Ibu Test', parentPhone, 'orang_tua'],
      );
      parentUserId = parentResult.rows[0].id;

      // Create tahun_ajaran for both tenants
      const taResult = await client.query(
        `INSERT INTO "tahun_ajaran" (tenant_id, nama, tanggal_mulai, tanggal_selesai, status)
         VALUES ($1, '2024/2025', '2024-07-15', '2025-06-13', 'aktif') RETURNING id`,
        [tenantId],
      );
      tahunAjaranId = taResult.rows[0].id;

      const ta2Result = await client.query(
        `INSERT INTO "tahun_ajaran" (tenant_id, nama, tanggal_mulai, tanggal_selesai, status)
         VALUES ($1, '2024/2025', '2024-07-15', '2025-06-13', 'aktif') RETURNING id`,
        [tenant2Id],
      );
      tahunAjaran2Id = ta2Result.rows[0].id;

      // Create kelas in each tenant
      const kelasResult = await client.query(
        `INSERT INTO "kelas" (tenant_id, tahun_ajaran_id, nama, tingkat)
         VALUES ($1, $2, '1A', 1) RETURNING id`,
        [tenantId, tahunAjaranId],
      );
      kelasId = kelasResult.rows[0].id;

      const kelas2Result = await client.query(
        `INSERT INTO "kelas" (tenant_id, tahun_ajaran_id, nama, tingkat)
         VALUES ($1, $2, '1B', 1) RETURNING id`,
        [tenant2Id, tahunAjaran2Id],
      );
      kelas2Id = kelas2Result.rows[0].id;

      // Create siswa in tenant1 linked to parent
      const siswaResult = await client.query(
        `INSERT INTO "siswa" (tenant_id, kelas_id, nama, nisn, orang_tua_id, status)
         VALUES ($1, $2, 'Anak Satu', '0000000001', $3, 'aktif') RETURNING id`,
        [tenantId, kelasId, parentUserId],
      );
      siswaId = siswaResult.rows[0].id;

      // Create siswa in tenant2 linked to same parent (cross-tenant)
      const siswa2Result = await client.query(
        `INSERT INTO "siswa" (tenant_id, kelas_id, nama, nisn, orang_tua_id, status)
         VALUES ($1, $2, 'Anak Dua', '0000000002', $3, 'aktif') RETURNING id`,
        [tenant2Id, kelas2Id, parentUserId],
      );
      siswa2Id = siswa2Result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async function cleanupTestData() {
    const client = await pool.connect();
    try {
      await client.query(`DELETE FROM "siswa" WHERE id IN ($1, $2)`, [siswaId, siswa2Id]);
      await client.query(`DELETE FROM "kelas" WHERE id IN ($1, $2)`, [kelasId, kelas2Id]);
      await client.query(`DELETE FROM "tahun_ajaran" WHERE id IN ($1, $2)`, [
        tahunAjaranId,
        tahunAjaran2Id,
      ]);
      await client.query(`DELETE FROM "user" WHERE id IN ($1, $2, $3)`, [
        adminUserId,
        guruUserId,
        parentUserId,
      ]);
      await client.query(`DELETE FROM "tenant" WHERE id IN ($1, $2)`, [tenantId, tenant2Id]);
    } finally {
      client.release();
    }
  }

  // ─── Test: Login with valid credentials ────────────────────────
  // Validates: Requirement 19.1 (staff login returns access_token + user data)

  describe('POST /api/v1/auth/login - valid credentials', () => {
    it('should return access_token, refresh_token, and user data for valid staff login', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: adminEmail,
          password: adminPassword,
          platform: 'admin_panel',
        })
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      expect(res.body).toHaveProperty('refresh_token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.id).toBe(adminUserId);
      expect(res.body.user.name).toBe('Admin Test');
      expect(res.body.user.role).toBe('admin');
      expect(res.body.user.tenant_id).toBe(tenantId);
      expect(res.body.must_change_password).toBe(false);
    });

    it('should return 90-day token for guru on mobile platform', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: guruEmail,
          password: guruPassword,
          platform: 'mobile',
        })
        .expect(200);

      expect(res.body.user.role).toBe('guru');

      // Decode the access token to verify TTL
      const decoded = jwtService.decode(res.body.access_token) as any;
      const ttlDays = (decoded.exp - decoded.iat) / (60 * 60 * 24);
      expect(ttlDays).toBe(90);
    });
  });

  // ─── Test: Login with invalid password ─────────────────────────
  // Validates: Requirement 19.4

  describe('POST /api/v1/auth/login - invalid password', () => {
    it('should return 401 with anti-enumeration message', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: adminEmail,
          password: 'WrongPassword',
          platform: 'admin_panel',
        })
        .expect(401);

      expect(res.body.message).toBe('Email atau password salah');
    });

    it('should return 401 for non-existent email (same message)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nobody@example.com',
          password: 'SomePassword',
          platform: 'admin_panel',
        })
        .expect(401);

      expect(res.body.message).toBe('Email atau password salah');
    });
  });

  // ─── Test: Account lockout after 5 failures ────────────────────
  // Validates: Requirement 19.5

  describe('POST /api/v1/auth/login - account lockout', () => {
    let lockoutUserId: string;
    const lockoutEmail = 'lockout@testschool.com';
    const lockoutPassword = 'LockoutPass123';

    beforeAll(async () => {
      // Create a dedicated user for lockout testing
      const hash = await bcrypt.hash(lockoutPassword, 10);
      const client = await pool.connect();
      try {
        const result = await client.query(
          `INSERT INTO "user" (tenant_id, nama, email, password_hash, role, is_active, failed_login_attempts)
           VALUES ($1, $2, $3, $4, $5, true, 0) RETURNING id`,
          [tenantId, 'Lockout User', lockoutEmail, hash, 'admin'],
        );
        lockoutUserId = result.rows[0].id;
      } finally {
        client.release();
      }
    });

    afterAll(async () => {
      const client = await pool.connect();
      try {
        await client.query(`DELETE FROM "user" WHERE id = $1`, [lockoutUserId]);
      } finally {
        client.release();
      }
    });

    it('should lock account after 5 consecutive failed attempts and return 401', async () => {
      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            email: lockoutEmail,
            password: 'WrongPassword',
            platform: 'admin_panel',
          })
          .expect(401);
      }

      // 6th attempt (even with correct password) should fail with lockout message
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: lockoutEmail,
          password: lockoutPassword,
          platform: 'admin_panel',
        })
        .expect(401);

      expect(res.body.message).toBe('Akun terkunci. Silakan coba lagi dalam 15 menit');
    });

    it('should verify failed_login_attempts is 5 in database', async () => {
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT failed_login_attempts, locked_until FROM "user" WHERE id = $1`,
          [lockoutUserId],
        );
        expect(result.rows[0].failed_login_attempts).toBe(5);
        expect(result.rows[0].locked_until).not.toBeNull();
        // locked_until should be ~15 minutes from now
        const lockUntil = new Date(result.rows[0].locked_until);
        const now = new Date();
        const diffMinutes = (lockUntil.getTime() - now.getTime()) / (1000 * 60);
        expect(diffMinutes).toBeGreaterThan(13); // at least 13 minutes left
        expect(diffMinutes).toBeLessThanOrEqual(15);
      } finally {
        client.release();
      }
    });
  });

  // ─── Test: Token refresh ───────────────────────────────────────
  // Validates: Requirement 19.8

  describe('POST /api/v1/auth/refresh - token refresh cycle', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Login to get a refresh token
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: adminEmail,
          password: adminPassword,
          platform: 'admin_panel',
        })
        .expect(200);

      refreshToken = res.body.refresh_token;
    });

    it('should return new access_token and refresh_token on valid refresh', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      expect(res.body).toHaveProperty('refresh_token');
      // The new tokens should be different from the old ones
      expect(res.body.refresh_token).not.toBe(refreshToken);
    });

    it('should reject reuse of a previously consumed refresh token', async () => {
      // First refresh succeeds
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(200);

      // Second use of same refresh token should fail (blacklisted)
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(401);

      expect(res.body.message).toBe('Refresh token sudah tidak berlaku');
    });
  });

  // ─── Test: Refresh with invalid token ──────────────────────────
  // Validates: Requirement 19.7, 19.8

  describe('POST /api/v1/auth/refresh - invalid tokens', () => {
    it('should return 401 for completely invalid refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: 'not-a-valid-token' })
        .expect(401);

      expect(res.body.message).toBe('Refresh token tidak valid atau sudah kadaluarsa');
    });

    it('should return 401 for expired refresh token', async () => {
      // Generate a token that's already expired
      const expiredToken = jwtService.sign(
        {
          sub: adminUserId,
          role: 'admin',
          tenant_id: tenantId,
          platform: 'admin_panel',
          jti: 'expired-jti-123',
          type: 'refresh',
        },
        {
          secret: JWT_REFRESH_SECRET,
          expiresIn: '-1s', // already expired
        },
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: expiredToken })
        .expect(401);

      expect(res.body.message).toBe('Refresh token tidak valid atau sudah kadaluarsa');
    });

    it('should return 401 when using an access token as refresh token', async () => {
      // Login to get an access token
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: adminEmail, password: adminPassword, platform: 'admin_panel' })
        .expect(200);

      // Try to use the access token as a refresh token
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: loginRes.body.access_token })
        .expect(401);

      expect(res.body.message).toBe('Token bukan refresh token');
    });
  });

  // ─── Test: Parent login with phone (cross-tenant) ──────────────
  // Validates: Requirement 19.2, 19.3, 21.9, 23.5

  describe('POST /api/v1/auth/login - parent phone login', () => {
    it('should return success with tenant_id=null and tenants array for parent', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          phone: parentPhone,
          platform: 'mobile',
        })
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      expect(res.body).toHaveProperty('refresh_token');
      expect(res.body.user.id).toBe(parentUserId);
      expect(res.body.user.role).toBe('orang_tua');
      expect(res.body.user.tenant_id).toBeNull();
      expect(res.body.user.tenants).toBeDefined();
      expect(res.body.user.tenants).toHaveLength(2);

      // Should contain both tenants (cross-tenant access)
      const tenantIds = res.body.user.tenants.map((t: any) => t.id);
      expect(tenantIds).toContain(tenantId);
      expect(tenantIds).toContain(tenant2Id);
    });

    it('should return 1-year access token for parent', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ phone: parentPhone, platform: 'mobile' })
        .expect(200);

      const decoded = jwtService.decode(res.body.access_token) as any;
      const ttlDays = (decoded.exp - decoded.iat) / (60 * 60 * 24);
      expect(ttlDays).toBe(365);
    });

    it('should return 401 for unregistered phone number', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ phone: '089999999999', platform: 'mobile' })
        .expect(401);

      expect(res.body.message).toBe('Nomor tidak terdaftar, hubungi admin sekolah');
    });

    it('should reject parent login on admin_panel platform', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ phone: parentPhone, platform: 'admin_panel' })
        .expect(401);

      expect(res.body.message).toBe('Nomor tidak terdaftar, hubungi admin sekolah');
    });
  });

  // ─── Test: Cross-tenant parent access ──────────────────────────
  // Validates: Requirement 23.5

  describe('Cross-tenant parent access', () => {
    it('should include tenants from multiple schools in JWT payload', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ phone: parentPhone, platform: 'mobile' })
        .expect(200);

      // Decode the access token to verify tenants in payload
      const decoded = jwtService.decode(res.body.access_token) as any;
      expect(decoded.tenants).toBeDefined();
      expect(decoded.tenants).toHaveLength(2);
      expect(decoded.tenants).toContain(tenantId);
      expect(decoded.tenants).toContain(tenant2Id);
      expect(decoded.tenant_id).toBeNull();
    });
  });

  // ─── Test: Change password → old refresh token invalidated ─────
  // Validates: Requirement 20.4, 20.8, 20.9

  describe('POST /api/v1/auth/change-password - token invalidation', () => {
    let changePwdUserId: string;
    const changePwdEmail = 'changepwd@testschool.com';
    const changePwdOldPassword = 'OldPassword123';
    const changePwdNewPassword = 'NewPassword456';

    beforeAll(async () => {
      const hash = await bcrypt.hash(changePwdOldPassword, 10);
      const client = await pool.connect();
      try {
        const result = await client.query(
          `INSERT INTO "user" (tenant_id, nama, email, password_hash, role, is_active, failed_login_attempts)
           VALUES ($1, $2, $3, $4, $5, true, 0) RETURNING id`,
          [tenantId, 'ChangePwd User', changePwdEmail, hash, 'guru'],
        );
        changePwdUserId = result.rows[0].id;
      } finally {
        client.release();
      }
    });

    afterAll(async () => {
      const client = await pool.connect();
      try {
        await client.query(`DELETE FROM "user" WHERE id = $1`, [changePwdUserId]);
      } finally {
        client.release();
      }
    });

    it('should invalidate old refresh tokens after password change', async () => {
      // Step 1: Login and get tokens
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: changePwdEmail, password: changePwdOldPassword, platform: 'admin_panel' })
        .expect(200);

      const oldAccessToken = loginRes.body.access_token;
      const oldRefreshToken = loginRes.body.refresh_token;

      // Step 2: Change password using the access token
      const changeRes = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${oldAccessToken}`)
        .send({ old_password: changePwdOldPassword, new_password: changePwdNewPassword })
        .expect(200);

      expect(changeRes.body.message).toBe('Password berhasil diubah. Sesi lain telah di-logout.');

      // Step 3: Old refresh token should now be rejected
      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: oldRefreshToken })
        .expect(401);

      expect(refreshRes.body.message).toBe('Semua sesi telah di-invalidasi, silakan login ulang');

      // Step 4: Can login with new password
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: changePwdEmail, password: changePwdNewPassword, platform: 'admin_panel' })
        .expect(200);

      // Step 5: Cannot login with old password
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: changePwdEmail, password: changePwdOldPassword, platform: 'admin_panel' })
        .expect(401);
    });
  });

  // ─── Test: Logout → token blacklisted ──────────────────────────
  // Validates: Requirement 19.8 (token invalidation on logout)

  describe('POST /api/v1/auth/logout - token blacklisting', () => {
    it('should blacklist the access token after logout', async () => {
      // Login
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: guruEmail, password: guruPassword, platform: 'admin_panel' })
        .expect(200);

      const accessToken = loginRes.body.access_token;
      const refreshToken = loginRes.body.refresh_token;

      // Logout (passing refresh token too)
      const logoutRes = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refresh_token: refreshToken })
        .expect(200);

      expect(logoutRes.body.message).toBe('Berhasil logout');

      // The access token should now be blacklisted
      // Any authenticated endpoint should reject it
      const decoded = jwtService.decode(accessToken) as any;
      const isBlacklisted = await redis.exists(`blacklist:${decoded.jti}`);
      expect(isBlacklisted).toBe(1);

      // Refresh token should also be blacklisted
      const decodedRefresh = jwtService.decode(refreshToken) as any;
      const isRefreshBlacklisted = await redis.exists(`blacklist:${decodedRefresh.jti}`);
      expect(isRefreshBlacklisted).toBe(1);
    });

    it('should reject refresh with blacklisted refresh token after logout', async () => {
      // Login
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: guruEmail, password: guruPassword, platform: 'admin_panel' })
        .expect(200);

      const accessToken = loginRes.body.access_token;
      const refreshToken = loginRes.body.refresh_token;

      // Logout
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refresh_token: refreshToken })
        .expect(200);

      // Try to refresh — should fail
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(401);

      expect(res.body.message).toBe('Refresh token sudah tidak berlaku');
    });
  });
});
