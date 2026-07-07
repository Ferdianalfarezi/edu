import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../../modules/redis/redis.service';
import { PhoneRateLimitGuard } from './phone-rate-limit.guard';
import { GeneralRateLimitGuard } from './general-rate-limit.guard';
import { UploadRateLimitGuard } from './upload-rate-limit.guard';
import { BillingRateLimitGuard } from './billing-rate-limit.guard';

function createMockExecutionContext(overrides: {
  body?: Record<string, unknown>;
  user?: { sub?: string; tenant_id?: string } | null;
  ip?: string;
  headers?: Record<string, string>;
}): ExecutionContext {
  const request = {
    body: overrides.body || {},
    user: overrides.user ?? null,
    ip: overrides.ip || '127.0.0.1',
    headers: overrides.headers || {},
    socket: { remoteAddress: overrides.ip || '127.0.0.1' },
  };

  const response = {
    setHeader: jest.fn(),
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function createMockRedisService(incrementMock?: jest.Mock): RedisService {
  return {
    increment: incrementMock || jest.fn().mockResolvedValue(1),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    blacklistToken: jest.fn(),
    isTokenBlacklisted: jest.fn(),
    acquireLock: jest.fn(),
    releaseLock: jest.fn(),
    getClient: jest.fn(),
    onModuleDestroy: jest.fn(),
  } as unknown as RedisService;
}

describe('PhoneRateLimitGuard', () => {
  let guard: PhoneRateLimitGuard;
  let incrementMock: jest.Mock;

  beforeEach(() => {
    incrementMock = jest.fn().mockResolvedValue(1);
    const redis = createMockRedisService(incrementMock);
    guard = new PhoneRateLimitGuard(redis);
  });

  it('should allow request when phone attempt count is within limit', async () => {
    incrementMock.mockResolvedValue(3);
    const ctx = createMockExecutionContext({
      body: { phone: '081234567890' },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(incrementMock).toHaveBeenCalledWith('rate:phone-login:081234567890', 3600);
  });

  it('should allow request at exactly the limit (5th attempt)', async () => {
    incrementMock.mockResolvedValue(5);
    const ctx = createMockExecutionContext({
      body: { phone: '081234567890' },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should throw 429 when attempts exceed limit', async () => {
    incrementMock.mockResolvedValue(6);
    const ctx = createMockExecutionContext({
      body: { phone: '081234567890' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);

    try {
      await guard.canActivate(ctx);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = httpError.getResponse() as Record<string, unknown>;
      expect(body.retryAfter).toBe(3600);
      expect(body.message).toContain('login');
    }
  });

  it('should skip rate limiting if no phone in body (non-phone login)', async () => {
    const ctx = createMockExecutionContext({
      body: { email: 'guru@sekolah.id', password: 'pass123' },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(incrementMock).not.toHaveBeenCalled();
  });

  it('should return same 429 for any phone after limit (anti-enumeration)', async () => {
    // Both existing and non-existing phones get same response after limit
    incrementMock.mockResolvedValue(10);
    const ctx1 = createMockExecutionContext({
      body: { phone: '081111111111' },
    });
    const ctx2 = createMockExecutionContext({
      body: { phone: '089999999999' },
    });

    let error1: HttpException | null = null;
    let error2: HttpException | null = null;

    try {
      await guard.canActivate(ctx1);
    } catch (e) {
      error1 = e as HttpException;
    }
    try {
      await guard.canActivate(ctx2);
    } catch (e) {
      error2 = e as HttpException;
    }

    // Both get identical 429 response
    expect(error1).not.toBeNull();
    expect(error2).not.toBeNull();
    expect(error1!.getStatus()).toBe(error2!.getStatus());
    expect((error1!.getResponse() as Record<string, unknown>).message).toBe(
      (error2!.getResponse() as Record<string, unknown>).message,
    );
  });

  it('should fail-open when Redis is unreachable', async () => {
    incrementMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const ctx = createMockExecutionContext({
      body: { phone: '081234567890' },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });
});

describe('GeneralRateLimitGuard', () => {
  let guard: GeneralRateLimitGuard;
  let incrementMock: jest.Mock;

  beforeEach(() => {
    incrementMock = jest.fn().mockResolvedValue(1);
    const redis = createMockRedisService(incrementMock);
    guard = new GeneralRateLimitGuard(redis);
  });

  it('should apply 100 req/min limit for authenticated users', async () => {
    incrementMock.mockResolvedValue(50);
    const ctx = createMockExecutionContext({
      user: { sub: 'user-123' },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(incrementMock).toHaveBeenCalledWith('rate:api:user:user-123', 60);
  });

  it('should throw 429 when authenticated user exceeds 100 req/min', async () => {
    incrementMock.mockResolvedValue(101);
    const ctx = createMockExecutionContext({
      user: { sub: 'user-123' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(ctx);
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('should apply 30 req/min limit for unauthenticated requests (by IP)', async () => {
    incrementMock.mockResolvedValue(15);
    const ctx = createMockExecutionContext({
      user: null,
      ip: '192.168.1.100',
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(incrementMock).toHaveBeenCalledWith('rate:api:ip:192.168.1.100', 60);
  });

  it('should throw 429 when unauthenticated IP exceeds 30 req/min', async () => {
    incrementMock.mockResolvedValue(31);
    const ctx = createMockExecutionContext({
      user: null,
      ip: '10.0.0.1',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  it('should use x-forwarded-for header for IP when available', async () => {
    incrementMock.mockResolvedValue(1);
    const ctx = createMockExecutionContext({
      user: null,
      ip: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18' },
    });

    await guard.canActivate(ctx);
    expect(incrementMock).toHaveBeenCalledWith('rate:api:ip:203.0.113.50', 60);
  });

  it('should fail-open when Redis is unreachable', async () => {
    incrementMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const ctx = createMockExecutionContext({
      user: { sub: 'user-456' },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });
});

describe('UploadRateLimitGuard', () => {
  let guard: UploadRateLimitGuard;
  let incrementMock: jest.Mock;

  beforeEach(() => {
    incrementMock = jest.fn().mockResolvedValue(1);
    const redis = createMockRedisService(incrementMock);
    guard = new UploadRateLimitGuard(redis);
  });

  it('should allow upload within limit (10 per 5 min)', async () => {
    incrementMock.mockResolvedValue(5);
    const ctx = createMockExecutionContext({
      user: { sub: 'user-789' },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(incrementMock).toHaveBeenCalledWith('rate:upload:user:user-789', 300);
  });

  it('should throw 429 when upload exceeds 10 per 5 min', async () => {
    incrementMock.mockResolvedValue(11);
    const ctx = createMockExecutionContext({
      user: { sub: 'user-789' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  it('should skip rate limiting if user is not authenticated', async () => {
    const ctx = createMockExecutionContext({ user: null });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(incrementMock).not.toHaveBeenCalled();
  });

  it('should fail-open when Redis is unreachable', async () => {
    incrementMock.mockRejectedValue(new Error('Connection timeout'));
    const ctx = createMockExecutionContext({
      user: { sub: 'user-789' },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });
});

describe('BillingRateLimitGuard', () => {
  let guard: BillingRateLimitGuard;
  let incrementMock: jest.Mock;

  beforeEach(() => {
    incrementMock = jest.fn().mockResolvedValue(1);
    const redis = createMockRedisService(incrementMock);
    guard = new BillingRateLimitGuard(redis);
  });

  it('should allow billing generation within limit (2 per min)', async () => {
    incrementMock.mockResolvedValue(1);
    const ctx = createMockExecutionContext({
      user: { sub: 'user-456', tenant_id: 'tenant-abc' },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(incrementMock).toHaveBeenCalledWith('rate:billing:tenant:tenant-abc', 60);
  });

  it('should throw 429 when billing exceeds 2 per min', async () => {
    incrementMock.mockResolvedValue(3);
    const ctx = createMockExecutionContext({
      user: { sub: 'user-456', tenant_id: 'tenant-abc' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(ctx);
    } catch (error) {
      const body = (error as HttpException).getResponse() as Record<string, unknown>;
      expect(body.message).toContain('billing');
    }
  });

  it('should skip rate limiting if no tenant_id (e.g., super_admin)', async () => {
    const ctx = createMockExecutionContext({
      user: { sub: 'super-admin-1' },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(incrementMock).not.toHaveBeenCalled();
  });

  it('should fail-open when Redis is unreachable', async () => {
    incrementMock.mockRejectedValue(new Error('Redis cluster error'));
    const ctx = createMockExecutionContext({
      user: { sub: 'user-456', tenant_id: 'tenant-abc' },
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should set Retry-After header when limit exceeded', async () => {
    incrementMock.mockResolvedValue(3);
    const ctx = createMockExecutionContext({
      user: { sub: 'user-456', tenant_id: 'tenant-abc' },
    });

    const response = ctx.switchToHttp().getResponse();

    try {
      await guard.canActivate(ctx);
    } catch (error) {
      expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '60');
    }
  });
});
