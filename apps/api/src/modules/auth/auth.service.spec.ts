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

// Mock bcrypt
jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService', () => {
  let service: AuthService;
  let mockDb: any;
  let mockJwtService: any;
  let mockRedisService: any;
  let mockConfigService: any;
  let mockEmailQueue: any;

  // Reusable mock data
  const staffUser = {
    id: 'user-uuid-1',
    tenantId: 'tenant-uuid-1',
    nama: 'Admin User',
    email: 'admin@school.com',
    phone: null,
    passwordHash: '$2b$10$hashedpassword',
    role: 'admin',
    isActive: true,
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    tokensInvalidatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const guruUser = {
    ...staffUser,
    id: 'guru-uuid-1',
    nama: 'Guru One',
    email: 'guru@school.com',
    role: 'guru',
  };

  const parentUser = {
    id: 'parent-uuid-1',
    tenantId: null,
    nama: 'Ibu Sari',
    email: null,
    phone: '081234567890',
    passwordHash: null,
    role: 'orang_tua',
    isActive: true,
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    tokensInvalidatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Mock db chainable query builder
  function createMockDbChain(results: any[] = []) {
    const chain: any = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.selectDistinctOn = jest.fn().mockReturnValue(chain);
    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    chain.innerJoin = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockResolvedValue(results);
    // For selectDistinctOn, the result comes from the last chain (no .limit)
    chain.then = jest.fn((resolve) => resolve(results));
    // Make it thenable so await works
    chain[Symbol.iterator] = undefined;
    return chain;
  }

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      selectDistinctOn: jest.fn(),
      update: jest.fn(),
    };

    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-token'),
      verify: jest.fn(),
    };

    mockRedisService = {
      isTokenBlacklisted: jest.fn().mockResolvedValue(false),
      blacklistToken: jest.fn().mockResolvedValue(undefined),
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

  describe('Staff Login (email + password)', () => {
    it('should authenticate staff with valid email and password', async () => {
      const selectChain = createMockDbChain([staffUser]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'admin@school.com',
        password: 'correct-password',
        platform: 'admin_panel',
      });

      expect(result.access_token).toBe('mock-token');
      expect(result.refresh_token).toBe('mock-token');
      expect(result.user.id).toBe('user-uuid-1');
      expect(result.user.role).toBe(Role.ADMIN);
      expect(result.user.tenant_id).toBe('tenant-uuid-1');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const selectChain = createMockDbChain([staffUser]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({
          email: 'admin@school.com',
          password: 'wrong-password',
          platform: 'admin_panel',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent email (anti-enumeration)', async () => {
      const selectChain = createMockDbChain([]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(
        service.login({
          email: 'nonexistent@school.com',
          password: 'any-password',
          platform: 'admin_panel',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should lock account after 5 failed attempts', async () => {
      const userWith4Failures = { ...staffUser, failedLoginAttempts: 4 };
      const selectChain = createMockDbChain([userWith4Failures]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({
          email: 'admin@school.com',
          password: 'wrong-password',
          platform: 'admin_panel',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        }),
      );
    });

    it('should reject login for locked account', async () => {
      const lockedUser = {
        ...staffUser,
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      };
      const selectChain = createMockDbChain([lockedUser]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(
        service.login({
          email: 'admin@school.com',
          password: 'correct-password',
          platform: 'admin_panel',
        }),
      ).rejects.toThrow('Akun terkunci');
    });

    it('should allow login after lockout expires', async () => {
      const unlockedUser = {
        ...staffUser,
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() - 1000),
      };
      const selectChain = createMockDbChain([unlockedUser]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'admin@school.com',
        password: 'correct-password',
        platform: 'admin_panel',
      });

      expect(result.access_token).toBeDefined();
    });

    it('should reject orang_tua trying to login with email', async () => {
      const parentWithEmail = { ...parentUser, email: 'parent@test.com' };
      const selectChain = createMockDbChain([parentWithEmail]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(
        service.login({
          email: 'parent@test.com',
          password: 'password',
          platform: 'admin_panel',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should generate 24h access token for admin_panel staff', async () => {
      const selectChain = createMockDbChain([staffUser]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login({
        email: 'admin@school.com',
        password: 'correct-password',
        platform: 'admin_panel',
      });

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ expiresIn: '24h' }),
      );
    });

    it('should generate 90d access token for mobile guru', async () => {
      const selectChain = createMockDbChain([guruUser]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login({
        email: 'guru@school.com',
        password: 'correct-password',
        platform: 'mobile',
      });

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ expiresIn: '90d' }),
      );
    });

    it('should reject non-guru staff login on mobile platform', async () => {
      const bendaharaUser = { ...staffUser, role: 'bendahara' };
      const selectChain = createMockDbChain([bendaharaUser]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({
          email: 'admin@school.com',
          password: 'correct-password',
          platform: 'mobile',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reset failed login attempts on successful login', async () => {
      const userWithFailures = { ...staffUser, failedLoginAttempts: 3 };
      const selectChain = createMockDbChain([userWithFailures]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login({
        email: 'admin@school.com',
        password: 'correct-password',
        platform: 'admin_panel',
      });

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      );
    });
  });

  describe('Parent Login (phone only)', () => {
    it('should authenticate parent with valid phone number', async () => {
      const selectChain = createMockDbChain([parentUser]);
      mockDb.select.mockReturnValue(selectChain);

      const tenantResults = [
        { tenantId: 'tenant-1', tenantNama: 'SD Maju' },
        { tenantId: 'tenant-2', tenantNama: 'SMP Bersama' },
      ];
      const distinctChain = createMockDbChain(tenantResults);
      mockDb.selectDistinctOn.mockReturnValue(distinctChain);

      const result = await service.login({
        phone: '081234567890',
        platform: 'mobile',
      });

      expect(result.access_token).toBe('mock-token');
      expect(result.user.role).toBe(Role.ORANG_TUA);
      expect(result.user.tenant_id).toBeNull();
      expect(result.user.tenants).toHaveLength(2);
      expect(result.user.tenants![0].id).toBe('tenant-1');
    });

    it('should throw UnauthorizedException for unregistered phone (anti-enumeration)', async () => {
      const selectChain = createMockDbChain([]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(
        service.login({
          phone: '081111111111',
          platform: 'mobile',
        }),
      ).rejects.toThrow('Nomor tidak terdaftar');
    });

    it('should reject parent login on admin_panel platform', async () => {
      await expect(
        service.login({
          phone: '081234567890',
          platform: 'admin_panel',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should generate 365d access token for parent', async () => {
      const selectChain = createMockDbChain([parentUser]);
      mockDb.select.mockReturnValue(selectChain);

      const tenantResults = [{ tenantId: 'tenant-1', tenantNama: 'SD Maju' }];
      const distinctChain = createMockDbChain(tenantResults);
      mockDb.selectDistinctOn.mockReturnValue(distinctChain);

      await service.login({
        phone: '081234567890',
        platform: 'mobile',
      });

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          secret: 'test-access-secret',
          expiresIn: '365d',
        }),
      );
    });

    it('should include tenants[] in JWT for cross-tenant parent', async () => {
      const selectChain = createMockDbChain([parentUser]);
      mockDb.select.mockReturnValue(selectChain);

      const tenantResults = [
        { tenantId: 'tenant-1', tenantNama: 'SD Maju' },
        { tenantId: 'tenant-2', tenantNama: 'SMP Bersama' },
      ];
      const distinctChain = createMockDbChain(tenantResults);
      mockDb.selectDistinctOn.mockReturnValue(distinctChain);

      await service.login({
        phone: '081234567890',
        platform: 'mobile',
      });

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'parent-uuid-1',
          role: Role.ORANG_TUA,
          tenant_id: null,
          tenants: ['tenant-1', 'tenant-2'],
          platform: 'mobile',
        }),
        expect.any(Object),
      );
    });

    it('should allow parent login even with no active children (empty tenants)', async () => {
      const selectChain = createMockDbChain([parentUser]);
      mockDb.select.mockReturnValue(selectChain);

      const distinctChain = createMockDbChain([]);
      mockDb.selectDistinctOn.mockReturnValue(distinctChain);

      const result = await service.login({
        phone: '081234567890',
        platform: 'mobile',
      });

      expect(result.user.tenants).toEqual([]);
    });
  });

  describe('Token Refresh', () => {
    const validRefreshPayload = {
      sub: 'user-uuid-1',
      role: Role.ADMIN,
      tenant_id: 'tenant-uuid-1',
      platform: 'admin_panel' as const,
      jti: 'refresh-jti-123',
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000) - 3600, // issued 1 hour ago
      exp: Math.floor(Date.now() / 1000) + 6 * 24 * 3600, // expires in 6 days
    };

    it('should issue new token pair with valid refresh token', async () => {
      mockJwtService.verify!.mockReturnValue(validRefreshPayload);

      // Mock user lookup for tokens_invalidated_at check
      const selectChain = createMockDbChain([{ tokensInvalidatedAt: null, isActive: true }]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.refresh({ refresh_token: 'valid-refresh-token' });

      expect(result.access_token).toBe('mock-token');
      expect(result.refresh_token).toBe('mock-token');
    });

    it('should blacklist old refresh token JTI on successful refresh', async () => {
      mockJwtService.verify!.mockReturnValue(validRefreshPayload);

      const selectChain = createMockDbChain([{ tokensInvalidatedAt: null, isActive: true }]);
      mockDb.select.mockReturnValue(selectChain);

      await service.refresh({ refresh_token: 'valid-refresh-token' });

      expect(mockRedisService.blacklistToken).toHaveBeenCalledWith(
        'refresh-jti-123',
        expect.any(Number),
      );
      // TTL should be remaining lifetime (> 0)
      const ttlArg = (mockRedisService.blacklistToken as jest.Mock).mock.calls[0][1];
      expect(ttlArg).toBeGreaterThan(0);
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      mockJwtService.verify!.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(service.refresh({ refresh_token: 'invalid-token' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for expired refresh token', async () => {
      mockJwtService.verify!.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refresh({ refresh_token: 'expired-token' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if token is not a refresh token', async () => {
      // Access token without type='refresh'
      const accessPayload = { ...validRefreshPayload, type: undefined };
      mockJwtService.verify!.mockReturnValue(accessPayload);

      await expect(service.refresh({ refresh_token: 'access-token-as-refresh' })).rejects.toThrow(
        'Token bukan refresh token',
      );
    });

    it('should throw UnauthorizedException for blacklisted refresh token', async () => {
      mockJwtService.verify!.mockReturnValue(validRefreshPayload);
      mockRedisService.isTokenBlacklisted!.mockResolvedValue(true);

      await expect(service.refresh({ refresh_token: 'blacklisted-refresh-token' })).rejects.toThrow(
        'Refresh token sudah tidak berlaku',
      );
    });

    it('should throw UnauthorizedException if user is deactivated', async () => {
      mockJwtService.verify!.mockReturnValue(validRefreshPayload);
      mockRedisService.isTokenBlacklisted!.mockResolvedValue(false);

      const selectChain = createMockDbChain([{ tokensInvalidatedAt: null, isActive: false }]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(service.refresh({ refresh_token: 'valid-refresh-token' })).rejects.toThrow(
        'Akun tidak aktif',
      );
    });

    it('should throw UnauthorizedException if tokens were globally invalidated after token issuance', async () => {
      mockJwtService.verify!.mockReturnValue(validRefreshPayload);
      mockRedisService.isTokenBlacklisted!.mockResolvedValue(false);

      // tokens_invalidated_at is AFTER the token was issued
      const invalidatedAt = new Date(validRefreshPayload.iat * 1000 + 60000); // 1 min after issuance
      const selectChain = createMockDbChain([
        { tokensInvalidatedAt: invalidatedAt, isActive: true },
      ]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(service.refresh({ refresh_token: 'valid-refresh-token' })).rejects.toThrow(
        'Semua sesi telah di-invalidasi',
      );
    });

    it('should allow refresh if tokens_invalidated_at is before token issuance', async () => {
      mockJwtService.verify!.mockReturnValue(validRefreshPayload);
      mockRedisService.isTokenBlacklisted!.mockResolvedValue(false);

      // tokens_invalidated_at is BEFORE the token was issued (user logged in after invalidation)
      const invalidatedAt = new Date(validRefreshPayload.iat * 1000 - 60000); // 1 min before issuance
      const selectChain = createMockDbChain([
        { tokensInvalidatedAt: invalidatedAt, isActive: true },
      ]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.refresh({ refresh_token: 'valid-refresh-token' });

      expect(result.access_token).toBe('mock-token');
    });
  });

  describe('Logout', () => {
    const mockRequestUser = {
      id: 'user-uuid-1',
      role: Role.ADMIN,
      tenant_id: 'tenant-uuid-1',
      platform: 'admin_panel' as const,
      jti: 'access-jti-456',
    };

    it('should blacklist the access token on logout', async () => {
      await service.logout(mockRequestUser);

      expect(mockRedisService.blacklistToken).toHaveBeenCalledWith(
        'access-jti-456',
        365 * 24 * 60 * 60, // max TTL
      );
    });

    it('should also blacklist refresh token if provided', async () => {
      const refreshPayload = {
        jti: 'refresh-jti-789',
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
      };
      mockJwtService.verify!.mockReturnValue(refreshPayload);

      await service.logout(mockRequestUser, 'valid-refresh-token');

      // Should blacklist both access and refresh tokens
      expect(mockRedisService.blacklistToken).toHaveBeenCalledTimes(2);
      expect(mockRedisService.blacklistToken).toHaveBeenCalledWith(
        'access-jti-456',
        365 * 24 * 60 * 60,
      );
      expect(mockRedisService.blacklistToken).toHaveBeenCalledWith(
        'refresh-jti-789',
        expect.any(Number),
      );
    });

    it('should still blacklist access token even if refresh token is invalid', async () => {
      mockJwtService.verify!.mockImplementation(() => {
        throw new Error('invalid');
      });

      await service.logout(mockRequestUser, 'invalid-refresh-token');

      // Access token should still be blacklisted
      expect(mockRedisService.blacklistToken).toHaveBeenCalledWith(
        'access-jti-456',
        365 * 24 * 60 * 60,
      );
    });
  });

  describe('Invalidate All User Tokens', () => {
    it('should set tokens_invalidated_at for the user', async () => {
      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      await service.invalidateAllUserTokens('user-uuid-1');

      expect(mockDb.update).toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          tokensInvalidatedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('Invalidate All Tenant Tokens', () => {
    it('should set tokens_invalidated_at for all users in a tenant', async () => {
      const updateChain: any = {};
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      updateChain.where = jest.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue(updateChain);

      await service.invalidateAllTenantTokens('tenant-uuid-1');

      expect(mockDb.update).toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          tokensInvalidatedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('Edge Cases', () => {
    it('should throw UnauthorizedException when neither email nor phone provided', async () => {
      await expect(service.login({ platform: 'admin_panel' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when email provided without password', async () => {
      await expect(
        service.login({ email: 'admin@school.com', platform: 'admin_panel' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
