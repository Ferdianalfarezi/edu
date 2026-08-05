import { ExecutionContext, HttpException, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RedisService } from '../../modules/redis/redis.service';

// We need to mock the AuthGuard parent class behavior
jest.mock('@nestjs/passport', () => ({
  AuthGuard: () => {
    class MockAuthGuard {
      canActivate(_context: ExecutionContext): Promise<boolean> {
        return Promise.resolve(true);
      }
    }
    return MockAuthGuard;
  },
}));

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let redisService: jest.Mocked<RedisService>;
  let mockDb: any;
  let mockContext: ExecutionContext;
  let mockRequest: any;

  // Helper to create a mock DB chain for select queries
  function createMockDbChain(results: any[] = []) {
    const chain: any = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockResolvedValue(results);
    return chain;
  }

  // Helper to build a fake Bearer token from a payload object
  function buildFakeToken(payload: object): string {
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    return `eyJhbGciOiJIUzI1NiJ9.${payloadBase64}.signature`;
  }

  beforeEach(() => {
    redisService = {
      isTokenBlacklisted: jest.fn(),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockDb = {
      select: jest.fn(),
    };

    guard = new JwtAuthGuard(redisService, mockDb);

    // Create a valid JWT-like token payload for the authorization header
    const payload = { sub: 'user-123', role: 'admin', iat: Math.floor(Date.now() / 1000) - 60 };
    const fakeToken = buildFakeToken(payload);

    mockRequest = {
      user: {
        id: 'user-123',
        role: 'admin',
        tenant_id: 'tenant-456',
        platform: 'admin_panel',
        jti: 'token-jti-789',
      },
      headers: {
        authorization: `Bearer ${fakeToken}`,
      },
    };

    mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as any;
  });

  it('should allow access when token is valid and not blacklisted', async () => {
    redisService.isTokenBlacklisted.mockResolvedValue(false);

    // User has no tokens_invalidated_at
    const selectChain = createMockDbChain([{ tokensInvalidatedAt: null }]);
    mockDb.select.mockReturnValue(selectChain);

    const result = await guard.canActivate(mockContext);

    expect(result).toBe(true);
    expect(redisService.isTokenBlacklisted).toHaveBeenCalledWith('token-jti-789');
  });

  it('should reject access when token is blacklisted', async () => {
    redisService.isTokenBlacklisted.mockResolvedValue(true);

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(mockContext)).rejects.toThrow('Token has been revoked');
  });

  it('should reject access when user has no jti', async () => {
    mockRequest.user = {
      id: 'user-123',
      role: 'admin',
      tenant_id: 'tenant-456',
      platform: 'admin_panel',
      jti: undefined,
    };

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject access when no user on request', async () => {
    mockRequest.user = undefined;

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject access when tokens_invalidated_at is after token issuance', async () => {
    redisService.isTokenBlacklisted.mockResolvedValue(false);

    // The token was issued 60 seconds ago, but invalidation happened 30 seconds ago
    const tokensInvalidatedAt = new Date(Date.now() - 30 * 1000);
    const selectChain = createMockDbChain([{ tokensInvalidatedAt }]);
    mockDb.select.mockReturnValue(selectChain);

    await expect(guard.canActivate(mockContext)).rejects.toThrow('Semua sesi telah di-invalidasi');
  });

  it('should allow access when tokens_invalidated_at is before token issuance', async () => {
    redisService.isTokenBlacklisted.mockResolvedValue(false);

    // The token was issued 60 seconds ago, but invalidation happened 120 seconds ago (before issuance)
    const tokensInvalidatedAt = new Date(Date.now() - 120 * 1000);
    const selectChain = createMockDbChain([{ tokensInvalidatedAt }]);
    mockDb.select.mockReturnValue(selectChain);

    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });

  it('should allow access when no authorization header (guard still passes if token not extractable)', async () => {
    redisService.isTokenBlacklisted.mockResolvedValue(false);
    mockRequest.headers = {};

    // No token to decode, so tokens_invalidated_at check is skipped
    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });

  // ─── handleRequest — TOKEN_EXPIRED (Req 11.4) ──────────────────────────────

  describe('handleRequest', () => {
    it('should throw TOKEN_EXPIRED UnauthorizedException when info.name is TokenExpiredError', () => {
      const info = { name: 'TokenExpiredError' };
      expect(() => guard.handleRequest(null, null, info)).toThrow(UnauthorizedException);
      try {
        guard.handleRequest(null, null, info);
      } catch (err: any) {
        expect(err.response).toEqual({
          code: 'TOKEN_EXPIRED',
          message: 'Token akses kedaluwarsa. Silakan perbarui sesi Anda.',
        });
      }
    });

    it('should rethrow err when err is provided and user is falsy', () => {
      const originalError = new UnauthorizedException('some error');
      expect(() => guard.handleRequest(originalError, null, null)).toThrow(originalError);
    });

    it('should throw UnauthorizedException("Unauthorized") when no user and no err', () => {
      expect(() => guard.handleRequest(null, null, null)).toThrow(UnauthorizedException);
    });

    it('should return user when no error and user is present', () => {
      const fakeUser = { id: 'user-1', role: 'admin' };
      const result = guard.handleRequest(null, fakeUser, null);
      expect(result).toBe(fakeUser);
    });
  });

  // ─── sid validation (Req 12.3, 12.5, 12.7) ────────────────────────────────

  describe('sid validation', () => {
    const SESSION_ID = 'sess-uuid-abc123';

    function buildRequestWithSid(role: string, sid: string | undefined): void {
      const tokenPayload = {
        sub: 'user-123',
        role,
        iat: Math.floor(Date.now() / 1000) - 60,
        ...(sid ? { sid } : {}),
      };
      const fakeToken = buildFakeToken(tokenPayload);
      mockRequest.user = {
        id: 'user-123',
        role,
        tenant_id: 'tenant-456',
        platform: 'admin_panel',
        jti: 'jti-1',
      };
      mockRequest.headers = { authorization: `Bearer ${fakeToken}` };
    }

    beforeEach(() => {
      redisService.isTokenBlacklisted.mockResolvedValue(false);
      // Default: no tokensInvalidatedAt
      const selectChain = createMockDbChain([{ tokensInvalidatedAt: null }]);
      mockDb.select.mockReturnValue(selectChain);
    });

    it('should allow access when sid in token matches Session_Store', async () => {
      buildRequestWithSid('admin', SESSION_ID);
      // First get: tokensInvalidatedAt cache miss (returns null → goes to DB)
      // Second get: session lookup
      redisService.get
        .mockResolvedValueOnce(null) // user_invalidated cache miss
        .mockResolvedValueOnce(SESSION_ID); // session:{userId} returns matching sid

      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
      expect(redisService.get).toHaveBeenCalledWith('session:user-123');
    });

    it('should throw SESSION_INVALIDATED when sid does not match Session_Store', async () => {
      buildRequestWithSid('admin', SESSION_ID);
      redisService.get
        .mockResolvedValueOnce(null) // user_invalidated cache miss
        .mockResolvedValueOnce('different-session-id'); // stored sid is different

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
      try {
        await guard.canActivate(mockContext);
      } catch (err: any) {
        expect(err.response).toEqual({
          code: 'SESSION_INVALIDATED',
          message: 'Sesi tidak valid karena login dari perangkat lain.',
        });
      }
    });

    it('should throw SESSION_INVALIDATED when Session_Store has no entry (session expired/deleted)', async () => {
      buildRequestWithSid('admin', SESSION_ID);
      redisService.get
        .mockResolvedValueOnce(null) // user_invalidated cache miss
        .mockResolvedValueOnce(null); // no session stored

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
      try {
        await guard.canActivate(mockContext);
      } catch (err: any) {
        expect(err.response?.code).toBe('SESSION_INVALIDATED');
      }
    });

    it('should throw HTTP 503 SERVICE_UNAVAILABLE when Redis throws during session lookup (fail-closed)', async () => {
      buildRequestWithSid('admin', SESSION_ID);

      let thrownError: any;
      redisService.get
        .mockResolvedValueOnce(null) // user_invalidated cache miss
        .mockRejectedValueOnce(new Error('Redis connection refused')); // session lookup fails

      try {
        await guard.canActivate(mockContext);
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(HttpException);
      expect(thrownError.getStatus()).toBe(503);
      expect(thrownError.getResponse()).toEqual({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Layanan sementara tidak tersedia',
      });
    });

    it('should skip sid validation for orang_tua role (Req 12.9)', async () => {
      buildRequestWithSid('orang_tua', SESSION_ID);
      redisService.get
        .mockResolvedValueOnce(null) // user_invalidated cache miss
        .mockResolvedValueOnce(''); // should not be called for session

      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
      // session:userId should NOT be called for orang_tua
      expect(redisService.get).not.toHaveBeenCalledWith('session:user-123');
    });

    it('should skip sid validation when token has no sid claim', async () => {
      buildRequestWithSid('admin', undefined); // no sid in token
      redisService.get.mockResolvedValueOnce(null); // only user_invalidated cache miss

      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
      expect(redisService.get).not.toHaveBeenCalledWith('session:user-123');
    });

    it('should apply fail-closed for kepala_sekolah role as well', async () => {
      buildRequestWithSid('kepala_sekolah', SESSION_ID);
      redisService.get
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Redis timeout'));

      await expect(guard.canActivate(mockContext)).rejects.toThrow(HttpException);
    });
  });
});
