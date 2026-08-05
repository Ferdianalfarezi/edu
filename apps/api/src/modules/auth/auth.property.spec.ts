/**
 * Property-based tests for JWT error code handling.
 *
 * Feature: sistem-pengembangan-v2
 *
 * Property 17: Access token expired → TOKEN_EXPIRED
 * Property 18: Refresh token expired → REFRESH_TOKEN_EXPIRED
 *
 * Validates: Requirements 11.4, 11.5
 */

import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RedisService } from '@/modules/redis/redis.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { AuthService } from './auth.service';
import { QUEUE_NAMES } from '@/modules/queue';

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** Build a TokenExpiredError-shaped object (mimics what passport-jwt emits). */
function makeTokenExpiredInfo(expiredAt: Date): object {
  return {
    name: 'TokenExpiredError',
    message: 'jwt expired',
    expiredAt,
  };
}

/**
 * Extract the structured response body from an UnauthorizedException.
 * NestJS wraps the thrown object in `exception.getResponse()`.
 */
function getResponseBody(err: unknown): unknown {
  if (err instanceof UnauthorizedException) {
    return err.getResponse();
  }
  return null;
}

// ─── Generators ──────────────────────────────────────────────────────────────

/**
 * Arbitrary: any Date that represents an expiry timestamp.
 * Covers past, very recent, far past, and edge dates (epoch, year 9999).
 */
const arbExpiredAt: fc.Arbitrary<Date> = fc.oneof(
  // Past dates — normal expiry
  fc.date({ min: new Date(0), max: new Date() }),
  // Far past (epoch-ish)
  fc.constant(new Date(0)),
  // Just now
  fc.constant(new Date(Date.now() - 1)),
  // 30 days ago
  fc.constant(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
);

/**
 * Arbitrary: any valid-looking refresh token string.
 * The AuthService will call jwtService.verify() which we mock, so the
 * content doesn't matter — we only need non-empty strings.
 */
const arbRefreshTokenString: fc.Arbitrary<string> = fc.oneof(
  fc.base64String({ minLength: 20, maxLength: 200 }),
  fc.hexaString({ minLength: 20, maxLength: 200 }),
  // Realistic JWT-like format (3 base64 segments)
  fc
    .tuple(
      fc.base64String({ minLength: 10, maxLength: 50 }),
      fc.base64String({ minLength: 10, maxLength: 80 }),
      fc.base64String({ minLength: 10, maxLength: 80 }),
    )
    .map(([h, p, s]) => `${h}.${p}.${s}`),
);

// ─── Module factory helpers ───────────────────────────────────────────────────

function makeMockRedis() {
  return {
    isTokenBlacklisted: jest.fn().mockResolvedValue(false),
    blacklistToken: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    delSession: jest.fn().mockResolvedValue(undefined),
    setSession: jest.fn().mockResolvedValue(undefined),
    getSession: jest.fn().mockResolvedValue(null),
  };
}

function makeMockDb() {
  return {
    select: jest.fn(),
    selectDistinctOn: jest.fn(),
    update: jest.fn(),
  };
}

// ─── Property 17: Access token expired → TOKEN_EXPIRED ───────────────────────
// Feature: sistem-pengembangan-v2, Property 17: Access token expired -> TOKEN_EXPIRED

describe('Property 17: Access token expired → TOKEN_EXPIRED (Req 11.4)', () => {
  let guard: JwtAuthGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: RedisService, useValue: makeMockRedis() },
        { provide: DRIZZLE, useValue: makeMockDb() },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('always throws UnauthorizedException with code TOKEN_EXPIRED for any expiredAt date', () => {
    fc.assert(
      fc.property(arbExpiredAt, (expiredAt) => {
        const info = makeTokenExpiredInfo(expiredAt);
        let caught: unknown;

        try {
          guard.handleRequest(null, null, info);
        } catch (err) {
          caught = err;
        }

        // Must throw
        if (!(caught instanceof UnauthorizedException)) {
          return false;
        }

        // Response body must have code: 'TOKEN_EXPIRED'
        const body = getResponseBody(caught) as Record<string, unknown>;
        return body?.code === 'TOKEN_EXPIRED';
      }),
      { numRuns: 100, verbose: false },
    );
  });

  it('TOKEN_EXPIRED response always carries the required message string', () => {
    fc.assert(
      fc.property(arbExpiredAt, (expiredAt) => {
        const info = makeTokenExpiredInfo(expiredAt);
        let caught: unknown;

        try {
          guard.handleRequest(null, null, info);
        } catch (err) {
          caught = err;
        }

        if (!(caught instanceof UnauthorizedException)) return false;

        const body = getResponseBody(caught) as Record<string, unknown>;
        return typeof body?.message === 'string' && (body.message as string).length > 0;
      }),
      { numRuns: 100, verbose: false },
    );
  });

  it('TOKEN_EXPIRED is thrown regardless of extra fields on the info object', () => {
    // Arbitrary extra fields merged onto the TokenExpiredError info
    const arbExtraFields = fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.oneof(fc.string(), fc.integer(), fc.boolean()),
    );

    fc.assert(
      fc.property(arbExpiredAt, arbExtraFields, (expiredAt, extraFields) => {
        const info = { ...makeTokenExpiredInfo(expiredAt), ...extraFields };
        let caught: unknown;

        try {
          guard.handleRequest(null, null, info);
        } catch (err) {
          caught = err;
        }

        if (!(caught instanceof UnauthorizedException)) return false;
        const body = getResponseBody(caught) as Record<string, unknown>;
        return body?.code === 'TOKEN_EXPIRED';
      }),
      { numRuns: 100, verbose: false },
    );
  });
});

// ─── Property 18: Refresh token expired → REFRESH_TOKEN_EXPIRED ──────────────
// Feature: sistem-pengembangan-v2, Property 18: Refresh token expired -> REFRESH_TOKEN_EXPIRED

describe('Property 18: Refresh token expired → REFRESH_TOKEN_EXPIRED (Req 11.5)', () => {
  let service: AuthService;
  let mockJwtService: { sign: jest.Mock; verify: jest.Mock };

  beforeEach(async () => {
    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-token'),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DRIZZLE, useValue: makeMockDb() },
        { provide: JwtService, useValue: mockJwtService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const cfg: Record<string, string> = {
                JWT_ACCESS_SECRET: 'test-access-secret',
                JWT_REFRESH_SECRET: 'test-refresh-secret',
              };
              return cfg[key] ?? '';
            }),
          },
        },
        { provide: RedisService, useValue: makeMockRedis() },
        { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('always throws UnauthorizedException with code REFRESH_TOKEN_EXPIRED for any token string when refresh token is expired', async () => {
    await fc.assert(
      fc.asyncProperty(arbRefreshTokenString, async (tokenString) => {
        // Make jwtService.verify throw TokenExpiredError for every call
        const expiredError = new Error('jwt expired');
        expiredError.name = 'TokenExpiredError';
        mockJwtService.verify.mockImplementation(() => {
          throw expiredError;
        });

        let caught: unknown;
        try {
          await service.refresh({ refresh_token: tokenString });
        } catch (err) {
          caught = err;
        }

        // Must throw UnauthorizedException
        if (!(caught instanceof UnauthorizedException)) return false;

        // Response body must have code: 'REFRESH_TOKEN_EXPIRED'
        const body = getResponseBody(caught) as Record<string, unknown>;
        return body?.code === 'REFRESH_TOKEN_EXPIRED';
      }),
      { numRuns: 100, verbose: false },
    );
  });

  it('REFRESH_TOKEN_EXPIRED response always carries the required message string', async () => {
    await fc.assert(
      fc.asyncProperty(arbRefreshTokenString, async (tokenString) => {
        const expiredError = new Error('jwt expired');
        expiredError.name = 'TokenExpiredError';
        mockJwtService.verify.mockImplementation(() => {
          throw expiredError;
        });

        let caught: unknown;
        try {
          await service.refresh({ refresh_token: tokenString });
        } catch (err) {
          caught = err;
        }

        if (!(caught instanceof UnauthorizedException)) return false;
        const body = getResponseBody(caught) as Record<string, unknown>;
        return typeof body?.message === 'string' && (body.message as string).length > 0;
      }),
      { numRuns: 100, verbose: false },
    );
  });

  it('non-expired token errors do NOT produce REFRESH_TOKEN_EXPIRED (error code isolation)', async () => {
    // Any other error name should NOT produce REFRESH_TOKEN_EXPIRED
    const arbOtherErrorName = fc
      .string({ minLength: 1 })
      .filter((name) => name !== 'TokenExpiredError');

    await fc.assert(
      fc.asyncProperty(arbRefreshTokenString, arbOtherErrorName, async (tokenString, errorName) => {
        const otherError = new Error('invalid signature');
        otherError.name = errorName;
        mockJwtService.verify.mockImplementation(() => {
          throw otherError;
        });

        let caught: unknown;
        try {
          await service.refresh({ refresh_token: tokenString });
        } catch (err) {
          caught = err;
        }

        if (!(caught instanceof UnauthorizedException)) return false;

        const body = getResponseBody(caught) as Record<string, unknown>;
        // Must NOT be REFRESH_TOKEN_EXPIRED for non-expiry errors
        return body?.code !== 'REFRESH_TOKEN_EXPIRED';
      }),
      { numRuns: 100, verbose: false },
    );
  });
});
