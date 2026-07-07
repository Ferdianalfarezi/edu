import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { RedisService } from '@/modules/redis/redis.service';
import { QUEUE_NAMES } from '@/modules/queue';

jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService - Password Reset & Change', () => {
  let service: AuthService;
  let mockDb: any;
  let mockRedisService: any;
  let mockEmailQueue: any;

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

  function createMockUpdateChain() {
    const chain: any = {};
    chain.set = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockResolvedValue(undefined);
    return chain;
  }

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      selectDistinctOn: jest.fn(),
      update: jest.fn(),
    };

    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
      isTokenBlacklisted: jest.fn().mockResolvedValue(false),
      blacklistToken: jest.fn().mockResolvedValue(undefined),
    };

    mockEmailQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DRIZZLE, useValue: mockDb },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-token'), verify: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: string) => {
              const config: Record<string, string> = {
                JWT_ACCESS_SECRET: 'test-access-secret',
                JWT_REFRESH_SECRET: 'test-refresh-secret',
                FRONTEND_URL: 'http://localhost:3000',
              };
              return config[key] || defaultVal || '';
            }),
          },
        },
        { provide: RedisService, useValue: mockRedisService },
        { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: mockEmailQueue },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── requestPasswordReset ─────────────────────────────────────

  describe('requestPasswordReset', () => {
    it('should return success and enqueue email when email exists', async () => {
      const selectChain = createMockDbChain([staffUser]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.requestPasswordReset({ email: 'admin@school.com' });

      expect(result.message).toContain('link reset password telah dikirim');
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining('reset_password:'),
        expect.stringContaining(staffUser.id),
        1800, // 30 minutes
      );
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'send-password-reset',
        expect.objectContaining({
          to: 'admin@school.com',
          name: 'Admin User',
          resetUrl: expect.stringContaining('http://localhost:3000/reset-password?token='),
        }),
      );
    });

    it('should return same success message for non-existent email (anti-enumeration)', async () => {
      const selectChain = createMockDbChain([]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.requestPasswordReset({ email: 'nonexist@school.com' });

      expect(result.message).toContain('link reset password telah dikirim');
      // Should NOT enqueue email or store token
      expect(mockRedisService.set).not.toHaveBeenCalled();
      expect(mockEmailQueue.add).not.toHaveBeenCalled();
    });

    it('should return success and NOT send email for orang_tua role (anti-enumeration)', async () => {
      const parentUser = { ...staffUser, role: 'orang_tua', email: 'parent@email.com' };
      const selectChain = createMockDbChain([parentUser]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.requestPasswordReset({ email: 'parent@email.com' });

      expect(result.message).toContain('link reset password telah dikirim');
      expect(mockRedisService.set).not.toHaveBeenCalled();
      expect(mockEmailQueue.add).not.toHaveBeenCalled();
    });

    it('should store SHA-256 hash of token in Redis, not the raw token', async () => {
      const selectChain = createMockDbChain([staffUser]);
      mockDb.select.mockReturnValue(selectChain);

      await service.requestPasswordReset({ email: 'admin@school.com' });

      const setCall = mockRedisService.set!.mock.calls[0];
      const redisKey = setCall[0] as string;
      // Key should be reset_password:<sha256_hash> — the hash is 64 chars hex
      expect(redisKey).toMatch(/^reset_password:[a-f0-9]{64}$/);
    });
  });

  // ─── confirmPasswordReset ─────────────────────────────────────

  describe('confirmPasswordReset', () => {
    it('should reset password when token is valid', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      // Mock Redis: token exists
      mockRedisService.get!.mockResolvedValue(
        JSON.stringify({ userId: staffUser.id, email: staffUser.email }),
      );

      // Mock DB update
      const updateChain = createMockUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      // Mock DB select for confirmation email
      const selectChain = createMockDbChain([{ email: staffUser.email, nama: staffUser.nama }]);
      mockDb.select.mockReturnValue(selectChain);

      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhash');

      const result = await service.confirmPasswordReset({
        token: rawToken,
        new_password: 'newpassword123',
      });

      expect(result.message).toContain('Password berhasil diubah');
      // Verify password was hashed
      expect(mockedBcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
      // Verify DB update was called with new hash and tokens_invalidated_at
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          passwordHash: '$2b$10$newhash',
          tokensInvalidatedAt: expect.any(Date),
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      );
      // Verify token was deleted from Redis
      expect(mockRedisService.del).toHaveBeenCalledWith(`reset_password:${tokenHash}`);
      // Verify confirmation email was enqueued
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'send-password-changed-confirmation',
        expect.objectContaining({
          to: staffUser.email,
          name: staffUser.nama,
        }),
      );
    });

    it('should throw BadRequestException for expired/invalid token', async () => {
      mockRedisService.get!.mockResolvedValue(null);

      await expect(
        service.confirmPasswordReset({
          token: 'invalid-token',
          new_password: 'newpassword123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with helpful message for expired token', async () => {
      mockRedisService.get!.mockResolvedValue(null);

      await expect(
        service.confirmPasswordReset({
          token: 'expired-token',
          new_password: 'newpassword123',
        }),
      ).rejects.toThrow('Token reset password tidak valid atau sudah kadaluarsa');
    });
  });

  // ─── changePassword ───────────────────────────────────────────

  describe('changePassword', () => {
    const currentUser = {
      id: 'user-uuid-1',
      role: 'admin' as any,
      tenant_id: 'tenant-uuid-1',
      platform: 'admin_panel' as const,
      jti: 'jti-123',
    };

    it('should change password when old password is correct', async () => {
      const selectChain = createMockDbChain([staffUser]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain = createMockUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhash');

      const result = await service.changePassword(currentUser, {
        old_password: 'oldpassword',
        new_password: 'newpassword123',
      });

      expect(result.message).toContain('Password berhasil diubah');
      expect(mockedBcrypt.compare).toHaveBeenCalledWith('oldpassword', staffUser.passwordHash);
      expect(mockedBcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
      // Verify all tokens invalidated
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          passwordHash: '$2b$10$newhash',
          tokensInvalidatedAt: expect.any(Date),
          mustChangePassword: false,
        }),
      );
    });

    it('should throw BadRequestException when old password is wrong', async () => {
      const selectChain = createMockDbChain([staffUser]);
      mockDb.select.mockReturnValue(selectChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword(currentUser, {
          old_password: 'wrongpassword',
          new_password: 'newpassword123',
        }),
      ).rejects.toThrow('Password lama tidak benar');
    });

    it('should throw BadRequestException for user without password (orang_tua)', async () => {
      const userWithoutPassword = { ...staffUser, passwordHash: null };
      const selectChain = createMockDbChain([userWithoutPassword]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(
        service.changePassword(currentUser, {
          old_password: 'anything',
          new_password: 'newpassword123',
        }),
      ).rejects.toThrow('Akun ini tidak mendukung perubahan password');
    });

    it('should throw BadRequestException when user not found', async () => {
      const selectChain = createMockDbChain([]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(
        service.changePassword(currentUser, {
          old_password: 'anything',
          new_password: 'newpassword123',
        }),
      ).rejects.toThrow('Akun ini tidak mendukung perubahan password');
    });

    it('should invalidate all tokens (other sessions) on password change', async () => {
      const selectChain = createMockDbChain([staffUser]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain = createMockUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhash');

      await service.changePassword(currentUser, {
        old_password: 'oldpassword',
        new_password: 'newpassword123',
      });

      // tokensInvalidatedAt is set — this means ALL previously issued tokens
      // (including the current one) will be rejected by JwtAuthGuard on next request.
      // The client should re-login after changing password.
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          tokensInvalidatedAt: expect.any(Date),
        }),
      );
    });
  });
});
