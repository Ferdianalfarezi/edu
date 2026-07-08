import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { RedisService } from '@/modules/redis/redis.service';
import { QUEUE_NAMES } from '@/modules/queue';
import { Role } from '@edu/shared';

jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

/**
 * Edge-case tests for auth module.
 * Complements auth.service.spec.ts with coverage for:
 * - Platform access validation matrix (all role+platform combos)
 * - Cross-tenant parent resolution (multi-tenant, inactive children)
 * - Token generation details (refresh TTLs, JTI uniqueness)
 * - Account lockout boundary conditions
 * - Inactive user handling
 *
 * Validates: Requirements 19.1–19.11
 */
describe('AuthService - Edge Cases', () => {
  let service: AuthService;
  let mockDb: any;
  let mockJwtService: jest.Mocked<Partial<JwtService>>;
  let mockRedisService: jest.Mocked<Partial<RedisService>>;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;
  let mockEmailQueue: any;

  // Track all sign calls to verify JTI uniqueness
  let signCalls: Array<{ payload: any; options: any }>;

  function createMockDbChain(results: any[] = []) {
    const chain: any = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.selectDistinctOn = jest.fn().mockReturnValue(chain);
    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    chain.innerJoin = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockResolvedValue(results);
    chain.then = jest.fn((resolve) => resolve(results));
    return chain;
  }

  function createMockUser(overrides: Partial<any> = {}) {
    return {
      id: 'user-uuid-1',
      tenantId: 'tenant-uuid-1',
      nama: 'Test User',
      email: 'test@school.com',
      phone: null,
      passwordHash: '$2b$10$hashedpassword',
      role: 'admin',
      isActive: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    signCalls = [];

    mockDb = {
      select: jest.fn(),
      selectDistinctOn: jest.fn(),
      update: jest.fn(),
    };

    mockJwtService = {
      sign: jest.fn().mockImplementation((payload, options) => {
        signCalls.push({ payload, options });
        return `mock-token-${signCalls.length}`;
      }),
    };

    mockRedisService = {
      isTokenBlacklisted: jest.fn().mockResolvedValue(false),
      del: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          JWT_ACCESS_SECRET: 'test-access-secret',
          JWT_REFRESH_SECRET: 'test-refresh-secret',
        };
        return config[key] || '';
      }),
    };

    mockEmailQueue = {
      add: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: mockEmailQueue },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Platform Access Validation Matrix ───────────────────────────

  describe('Platform Access Matrix (Req 19.1, 19.10, 19.11)', () => {
    const setupSuccessfulLogin = (role: string) => {
      const testUser = createMockUser({ role });
      const selectChain = createMockDbChain([testUser]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
    };

    it('should allow admin on admin_panel', async () => {
      setupSuccessfulLogin('admin');
      const result = await service.login({
        email: 'test@school.com',
        password: 'pass',
        platform: 'admin_panel',
      });
      expect(result.access_token).toBeDefined();
    });

    it('should allow kepala_sekolah on admin_panel', async () => {
      setupSuccessfulLogin('kepala_sekolah');
      const result = await service.login({
        email: 'test@school.com',
        password: 'pass',
        platform: 'admin_panel',
      });
      expect(result.access_token).toBeDefined();
    });

    it('should allow bendahara on admin_panel', async () => {
      setupSuccessfulLogin('bendahara');
      const result = await service.login({
        email: 'test@school.com',
        password: 'pass',
        platform: 'admin_panel',
      });
      expect(result.access_token).toBeDefined();
    });

    it('should allow guru on admin_panel', async () => {
      setupSuccessfulLogin('guru');
      const result = await service.login({
        email: 'test@school.com',
        password: 'pass',
        platform: 'admin_panel',
      });
      expect(result.access_token).toBeDefined();
    });

    it('should allow guru on mobile (dual-platform access)', async () => {
      setupSuccessfulLogin('guru');
      const result = await service.login({
        email: 'test@school.com',
        password: 'pass',
        platform: 'mobile',
      });
      expect(result.access_token).toBeDefined();
    });

    it('should reject admin on mobile platform', async () => {
      setupSuccessfulLogin('admin');
      await expect(
        service.login({
          email: 'test@school.com',
          password: 'pass',
          platform: 'mobile',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject kepala_sekolah on mobile platform', async () => {
      setupSuccessfulLogin('kepala_sekolah');
      await expect(
        service.login({
          email: 'test@school.com',
          password: 'pass',
          platform: 'mobile',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject bendahara on mobile platform', async () => {
      setupSuccessfulLogin('bendahara');
      await expect(
        service.login({
          email: 'test@school.com',
          password: 'pass',
          platform: 'mobile',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject super_admin on mobile platform', async () => {
      setupSuccessfulLogin('super_admin');
      await expect(
        service.login({
          email: 'test@school.com',
          password: 'pass',
          platform: 'mobile',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── Cross-Tenant Parent Resolution ──────────────────────────────

  describe('Cross-Tenant Parent Resolution (Req 19.2, 19.11, 23.5)', () => {
    const parentUser = createMockUser({
      id: 'parent-uuid-1',
      tenantId: null,
      email: null,
      phone: '081234567890',
      passwordHash: null,
      role: 'orang_tua',
    });

    it('should resolve multiple tenants from active children in different schools', async () => {
      const selectChain = createMockDbChain([parentUser]);
      mockDb.select.mockReturnValue(selectChain);

      const tenantResults = [
        { tenantId: 'tenant-1', tenantNama: 'SD Maju' },
        { tenantId: 'tenant-2', tenantNama: 'SMP Bersama' },
        { tenantId: 'tenant-3', tenantNama: 'SMA Harapan' },
      ];
      const distinctChain = createMockDbChain(tenantResults);
      mockDb.selectDistinctOn.mockReturnValue(distinctChain);

      const result = await service.login({
        phone: '081234567890',
        platform: 'mobile',
      });

      expect(result.user.tenants).toHaveLength(3);
      expect(result.user.tenants!.map((t) => t.id)).toEqual(['tenant-1', 'tenant-2', 'tenant-3']);
    });

    it('should include tenants[] array in JWT payload for multi-tenant parent', async () => {
      const selectChain = createMockDbChain([parentUser]);
      mockDb.select.mockReturnValue(selectChain);

      const tenantResults = [
        { tenantId: 'tenant-1', tenantNama: 'SD Maju' },
        { tenantId: 'tenant-2', tenantNama: 'SMP Bersama' },
      ];
      const distinctChain = createMockDbChain(tenantResults);
      mockDb.selectDistinctOn.mockReturnValue(distinctChain);

      await service.login({ phone: '081234567890', platform: 'mobile' });

      // Access token payload should include tenants array
      const accessTokenPayload = signCalls[0].payload;
      expect(accessTokenPayload.tenants).toEqual(['tenant-1', 'tenant-2']);
      expect(accessTokenPayload.tenant_id).toBeNull();
    });

    it('should return empty tenants when parent has no active children (all removed)', async () => {
      const selectChain = createMockDbChain([parentUser]);
      mockDb.select.mockReturnValue(selectChain);

      // No active children found
      const distinctChain = createMockDbChain([]);
      mockDb.selectDistinctOn.mockReturnValue(distinctChain);

      const result = await service.login({
        phone: '081234567890',
        platform: 'mobile',
      });

      expect(result.user.tenants).toEqual([]);
      // JWT still issued with empty tenants array
      const accessTokenPayload = signCalls[0].payload;
      expect(accessTokenPayload.tenants).toEqual([]);
    });

    it('should still authenticate parent even when resolveParentTenants returns empty', async () => {
      const selectChain = createMockDbChain([parentUser]);
      mockDb.select.mockReturnValue(selectChain);

      const distinctChain = createMockDbChain([]);
      mockDb.selectDistinctOn.mockReturnValue(distinctChain);

      // Should NOT throw — parent can still login even with no schools
      const result = await service.login({
        phone: '081234567890',
        platform: 'mobile',
      });

      expect(result.access_token).toBeDefined();
      expect(result.user.id).toBe('parent-uuid-1');
    });
  });

  // ─── Token Generation Details ────────────────────────────────────

  describe('Token Generation - JTI and Refresh TTL (Req 19.8)', () => {
    const setupLogin = (role: string, platform: 'admin_panel' | 'mobile') => {
      if (role === 'orang_tua') {
        const parent = createMockUser({
          tenantId: null,
          phone: '081234567890',
          email: null,
          passwordHash: null,
          role: 'orang_tua',
        });
        const selectChain = createMockDbChain([parent]);
        mockDb.select.mockReturnValue(selectChain);
        const distinctChain = createMockDbChain([{ tenantId: 'tenant-1', tenantNama: 'School' }]);
        mockDb.selectDistinctOn.mockReturnValue(distinctChain);
      } else {
        const staffUser = createMockUser({ role });
        const selectChain = createMockDbChain([staffUser]);
        mockDb.select.mockReturnValue(selectChain);
        const updateChain: any = {};
        updateChain.set = jest.fn().mockReturnValue(updateChain);
        updateChain.where = jest.fn().mockResolvedValue(undefined);
        mockDb.update.mockReturnValue(updateChain);
        (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
      }
    };

    it('should generate unique JTI for access and refresh tokens', async () => {
      setupLogin('admin', 'admin_panel');

      await service.login({
        email: 'test@school.com',
        password: 'pass',
        platform: 'admin_panel',
      });

      // Two sign calls: access + refresh
      expect(signCalls).toHaveLength(2);
      const accessJti = signCalls[0].payload.jti;
      const refreshJti = signCalls[1].payload.jti;

      expect(accessJti).toBeDefined();
      expect(refreshJti).toBeDefined();
      expect(accessJti).not.toBe(refreshJti);
    });

    it('should use refresh secret for refresh token', async () => {
      setupLogin('admin', 'admin_panel');

      await service.login({
        email: 'test@school.com',
        password: 'pass',
        platform: 'admin_panel',
      });

      const refreshOptions = signCalls[1].options;
      expect(refreshOptions.secret).toBe('test-refresh-secret');
    });

    it('should set 7d refresh token TTL for admin_panel staff', async () => {
      setupLogin('admin', 'admin_panel');

      await service.login({
        email: 'test@school.com',
        password: 'pass',
        platform: 'admin_panel',
      });

      const refreshOptions = signCalls[1].options;
      expect(refreshOptions.expiresIn).toBe('7d');
    });

    it('should set 180d refresh token TTL for mobile guru', async () => {
      setupLogin('guru', 'mobile');

      await service.login({
        email: 'test@school.com',
        password: 'pass',
        platform: 'mobile',
      });

      const refreshOptions = signCalls[1].options;
      expect(refreshOptions.expiresIn).toBe('180d');
    });

    it('should set 365d refresh token TTL for parent', async () => {
      setupLogin('orang_tua', 'mobile');

      await service.login({ phone: '081234567890', platform: 'mobile' });

      const refreshOptions = signCalls[1].options;
      expect(refreshOptions.expiresIn).toBe('365d');
    });

    it('should include platform in JWT payload', async () => {
      setupLogin('guru', 'mobile');

      await service.login({
        email: 'test@school.com',
        password: 'pass',
        platform: 'mobile',
      });

      const accessPayload = signCalls[0].payload;
      expect(accessPayload.platform).toBe('mobile');
    });

    it('should mark refresh token with type: refresh', async () => {
      setupLogin('admin', 'admin_panel');

      await service.login({
        email: 'test@school.com',
        password: 'pass',
        platform: 'admin_panel',
      });

      const refreshPayload = signCalls[1].payload;
      expect(refreshPayload.type).toBe('refresh');
      // Access token should NOT have type: refresh
      const accessPayload = signCalls[0].payload;
      expect(accessPayload.type).toBeUndefined();
    });
  });

  // ─── Account Lockout Boundary Conditions ─────────────────────────

  describe('Account Lockout Boundaries (Req 19.5)', () => {
    it('should NOT lock account at exactly 4 failed attempts (boundary below threshold)', async () => {
      const userWith3Failures = createMockUser({ failedLoginAttempts: 3 });
      const selectChain = createMockDbChain([userWith3Failures]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({
          email: 'test@school.com',
          password: 'wrong',
          platform: 'admin_panel',
        }),
      ).rejects.toThrow(UnauthorizedException);

      // Should increment to 4, but NOT set lockedUntil
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ failedLoginAttempts: 4 }),
      );
      expect(updateChain.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ lockedUntil: expect.any(Date) }),
      );
    });

    it('should lock account at exactly 5 failed attempts (boundary at threshold)', async () => {
      const userWith4Failures = createMockUser({ failedLoginAttempts: 4 });
      const selectChain = createMockDbChain([userWith4Failures]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({
          email: 'test@school.com',
          password: 'wrong',
          platform: 'admin_panel',
        }),
      ).rejects.toThrow(UnauthorizedException);

      // Should increment to 5 AND set lockedUntil
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        }),
      );
    });

    it('lockout duration should be approximately 15 minutes from now', async () => {
      const userWith4Failures = createMockUser({ failedLoginAttempts: 4 });
      const selectChain = createMockDbChain([userWith4Failures]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);

      const beforeTime = Date.now();
      await expect(
        service.login({
          email: 'test@school.com',
          password: 'wrong',
          platform: 'admin_panel',
        }),
      ).rejects.toThrow(UnauthorizedException);
      const afterTime = Date.now();

      const setArg = updateChain.set.mock.calls[0][0];
      const lockUntil = new Date(setArg.lockedUntil).getTime();
      const fifteenMinMs = 15 * 60 * 1000;

      // Lockout should be ~15min from now (allow 1s tolerance)
      expect(lockUntil).toBeGreaterThanOrEqual(beforeTime + fifteenMinMs - 1000);
      expect(lockUntil).toBeLessThanOrEqual(afterTime + fifteenMinMs + 1000);
    });

    it('should reset lockout AND failedLoginAttempts on successful login after partial failures', async () => {
      const userWith2Failures = createMockUser({ failedLoginAttempts: 2 });
      const selectChain = createMockDbChain([userWith2Failures]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login({
        email: 'test@school.com',
        password: 'correct',
        platform: 'admin_panel',
      });

      // Should reset both fields
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      );
    });

    it('should reject login for locked account even with correct password', async () => {
      const lockedUser = createMockUser({
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });
      const selectChain = createMockDbChain([lockedUser]);
      mockDb.select.mockReturnValue(selectChain);

      // Password would be correct, but lockout takes precedence
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({
          email: 'test@school.com',
          password: 'correct',
          platform: 'admin_panel',
        }),
      ).rejects.toThrow('Akun terkunci');

      // bcrypt should NOT have been called (lockout checked before password)
      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    });

    it('should allow login exactly when lockout expires (boundary)', async () => {
      // Lockout expired 1ms ago
      const expiredLockUser = createMockUser({
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() - 1),
      });
      const selectChain = createMockDbChain([expiredLockUser]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'test@school.com',
        password: 'correct',
        platform: 'admin_panel',
      });

      expect(result.access_token).toBeDefined();
    });
  });

  // ─── Inactive User Handling ──────────────────────────────────────

  describe('Inactive User Handling', () => {
    it('should reject login for inactive staff user', async () => {
      // The DB query filters by isActive: true, so inactive users won't be found
      const selectChain = createMockDbChain([]); // empty result = not found
      mockDb.select.mockReturnValue(selectChain);

      await expect(
        service.login({
          email: 'deactivated@school.com',
          password: 'pass',
          platform: 'admin_panel',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject login for inactive parent user', async () => {
      const selectChain = createMockDbChain([]); // inactive parent not found
      mockDb.select.mockReturnValue(selectChain);

      await expect(service.login({ phone: '081234567890', platform: 'mobile' })).rejects.toThrow(
        'Nomor tidak terdaftar',
      );
    });
  });

  // ─── resolveParentTenants Direct Testing ─────────────────────────

  describe('resolveParentTenants (ADR-002 compliance)', () => {
    it('should return distinct tenants from active children', async () => {
      const tenantResults = [
        { tenantId: 'tenant-1', tenantNama: 'SD Maju' },
        { tenantId: 'tenant-2', tenantNama: 'SMP Bersama' },
      ];
      const distinctChain = createMockDbChain(tenantResults);
      mockDb.selectDistinctOn.mockReturnValue(distinctChain);

      const tenants = await service.resolveParentTenants('parent-uuid-1');

      expect(tenants).toEqual([
        { id: 'tenant-1', nama: 'SD Maju' },
        { id: 'tenant-2', nama: 'SMP Bersama' },
      ]);
    });

    it('should return empty array when parent has no active children', async () => {
      const distinctChain = createMockDbChain([]);
      mockDb.selectDistinctOn.mockReturnValue(distinctChain);

      const tenants = await service.resolveParentTenants('parent-uuid-no-kids');

      expect(tenants).toEqual([]);
    });

    it('should return single tenant when parent has children in one school only', async () => {
      const tenantResults = [{ tenantId: 'tenant-1', tenantNama: 'SD Maju' }];
      const distinctChain = createMockDbChain(tenantResults);
      mockDb.selectDistinctOn.mockReturnValue(distinctChain);

      const tenants = await service.resolveParentTenants('parent-uuid-1');

      expect(tenants).toHaveLength(1);
      expect(tenants[0]).toEqual({ id: 'tenant-1', nama: 'SD Maju' });
    });
  });

  // ─── Password Hash Handling ──────────────────────────────────────

  describe('Password Hash Edge Cases (Req 19.6)', () => {
    it('should reject staff login when passwordHash is null (corrupted data)', async () => {
      const noHashUser = createMockUser({ passwordHash: null });
      const selectChain = createMockDbChain([noHashUser]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(
        service.login({
          email: 'test@school.com',
          password: 'pass',
          platform: 'admin_panel',
        }),
      ).rejects.toThrow(UnauthorizedException);

      // bcrypt should not be called when hash is null
      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    });
  });
});
