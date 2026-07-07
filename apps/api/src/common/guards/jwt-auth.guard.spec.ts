import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
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

  beforeEach(() => {
    redisService = {
      isTokenBlacklisted: jest.fn(),
    } as any;

    mockDb = {
      select: jest.fn(),
    };

    guard = new JwtAuthGuard(redisService, mockDb);

    // Create a valid JWT-like token payload for the authorization header
    const payload = { sub: 'user-123', role: 'admin', iat: Math.floor(Date.now() / 1000) - 60 };
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const fakeToken = `eyJhbGciOiJIUzI1NiJ9.${payloadBase64}.signature`;

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
});
