// Feature: sistem-pengembangan-v2, Property 20: Request dengan sid tidak cocok selalu ditolak dengan SESSION_INVALIDATED

import { ExecutionContext, HttpException, UnauthorizedException } from '@nestjs/common';
import fc from 'fast-check';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { RedisService } from '../../../modules/redis/redis.service';

/**
 * Property 20: Request dengan `sid` tidak cocok selalu ditolak dengan SESSION_INVALIDATED
 * **Validates: Requirements 12.3, 12.5**
 *
 * Requirements:
 * - 12.3: JWT_Guard MUST validate that claim `sid` in token matches Session_Store for userId
 * - 12.5: IF claim `sid` does NOT match Session_Store → reject with HTTP 401 SESSION_INVALIDATED
 */

// Mock @nestjs/passport so guard doesn't need a real Passport context
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

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Encode a payload as a fake Bearer JWT (no real signing — guard only decodes, Passport verifies) */
function buildFakeToken(payload: object): string {
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `eyJhbGciOiJIUzI1NiJ9.${payloadBase64}.fakesignature`;
}

/** Create a mock ExecutionContext for the guard */
function buildContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

/** Build a mock DB chain that returns the provided results for select queries */
function createMockDbChain(results: object[] = []) {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue(results);
  return chain;
}

// ─── Arbitraries ────────────────────────────────────────────────────────────

/** Generate a UUID-like string (not RFC-compliant, but sufficient for session IDs in tests) */
const uuidArb = fc.uuid();

/** Staff roles that are subject to single-device session validation (Req 12.8) */
const staffRoleArb = fc.constantFrom('admin', 'kepala_sekolah', 'guru', 'bendahara');

/** A sid value that is guaranteed different from the stored one (mismatch scenario) */
function mismatchedSidArb(storedSid: string) {
  // Generate a UUID that differs from storedSid
  return uuidArb.filter((sid) => sid !== storedSid);
}

// ─── Property 20 ────────────────────────────────────────────────────────────

describe('Property 20: Request dengan sid tidak cocok selalu ditolak dengan SESSION_INVALIDATED', () => {
  let guard: JwtAuthGuard;
  let redisService: jest.Mocked<RedisService>;
  let mockDb: ReturnType<typeof createMockDbChain>;

  beforeEach(() => {
    redisService = {
      isTokenBlacklisted: jest.fn().mockResolvedValue(false),
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RedisService>;

    mockDb = createMockDbChain([{ tokensInvalidatedAt: null }]);
    guard = new JwtAuthGuard(redisService, mockDb as never);
  });

  // ── Sub-property 20a: Any mismatched sid → SESSION_INVALIDATED ─────────────

  it('20a: untuk sembarang role staff dan sid yang tidak cocok, guard SELALU melempar 401 SESSION_INVALIDATED', async () => {
    await fc.assert(
      fc.asyncProperty(
        staffRoleArb,
        uuidArb, // stored session id
        uuidArb, // token sid (may or may not match — filtered below)
        fc.uuid(), // userId
        async (role, storedSid, tokenSid, userId) => {
          // This property only applies to the MISMATCH case
          fc.pre(tokenSid !== storedSid);

          const tokenPayload = {
            sub: userId,
            role,
            iat: Math.floor(Date.now() / 1000) - 30,
            sid: tokenSid,
          };

          const request = {
            user: {
              id: userId,
              role,
              tenant_id: 'tenant-abc',
              platform: 'admin_panel',
              jti: 'jti-test',
            },
            headers: {
              authorization: `Bearer ${buildFakeToken(tokenPayload)}`,
            },
          };

          // Setup Redis:
          // First call: user_invalidated cache miss → go to DB (returns null)
          // Second call: session:{userId} → returns storedSid (different from tokenSid)
          redisService.get
            .mockResolvedValueOnce(null) // user_invalidated cache miss
            .mockResolvedValueOnce(storedSid); // session lookup: returns stored (mismatched) sid

          const mockDbChain = createMockDbChain([{ tokensInvalidatedAt: null }]);
          (guard as unknown as Record<string, unknown>)['db'] = mockDbChain;

          let thrownError: unknown;
          try {
            await guard.canActivate(buildContext(request));
          } catch (err) {
            thrownError = err;
          }

          // Must have thrown
          if (!thrownError) return false;

          // Must be UnauthorizedException (HTTP 401)
          if (!(thrownError instanceof UnauthorizedException)) return false;

          // Must carry SESSION_INVALIDATED code
          const response = (thrownError as UnauthorizedException).getResponse() as Record<
            string,
            unknown
          >;
          return response.code === 'SESSION_INVALIDATED';
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Sub-property 20b: Null stored session (expired/deleted) → SESSION_INVALIDATED ──

  it('20b: jika Session_Store tidak memiliki entri untuk userId (null), guard SELALU melempar 401 SESSION_INVALIDATED untuk sembarang sid dalam token', async () => {
    await fc.assert(
      fc.asyncProperty(
        staffRoleArb,
        uuidArb, // any token sid
        fc.uuid(), // userId
        async (role, tokenSid, userId) => {
          const tokenPayload = {
            sub: userId,
            role,
            iat: Math.floor(Date.now() / 1000) - 30,
            sid: tokenSid,
          };

          const request = {
            user: {
              id: userId,
              role,
              tenant_id: 'tenant-abc',
              platform: 'admin_panel',
              jti: 'jti-test',
            },
            headers: {
              authorization: `Bearer ${buildFakeToken(tokenPayload)}`,
            },
          };

          // Session_Store has no entry (expired or deleted → null)
          redisService.get
            .mockResolvedValueOnce(null) // user_invalidated cache miss
            .mockResolvedValueOnce(null); // session:{userId} = null (no active session)

          const mockDbChain = createMockDbChain([{ tokensInvalidatedAt: null }]);
          (guard as unknown as Record<string, unknown>)['db'] = mockDbChain;

          let thrownError: unknown;
          try {
            await guard.canActivate(buildContext(request));
          } catch (err) {
            thrownError = err;
          }

          if (!thrownError) return false;
          if (!(thrownError instanceof UnauthorizedException)) return false;

          const response = (thrownError as UnauthorizedException).getResponse() as Record<
            string,
            unknown
          >;
          return response.code === 'SESSION_INVALIDATED';
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Sub-property 20c: Matching sid → guard PASSES ──────────────────────────

  it('20c: jika sid dalam token COCOK dengan Session_Store, guard HARUS mengizinkan request (tidak melempar SESSION_INVALIDATED)', async () => {
    await fc.assert(
      fc.asyncProperty(
        staffRoleArb,
        uuidArb, // session id (same in both token and store)
        fc.uuid(), // userId
        async (role, sessionId, userId) => {
          const tokenPayload = {
            sub: userId,
            role,
            iat: Math.floor(Date.now() / 1000) - 30,
            sid: sessionId,
          };

          const request = {
            user: {
              id: userId,
              role,
              tenant_id: 'tenant-abc',
              platform: 'admin_panel',
              jti: 'jti-test',
            },
            headers: {
              authorization: `Bearer ${buildFakeToken(tokenPayload)}`,
            },
          };

          // Session_Store returns matching session id
          redisService.get
            .mockResolvedValueOnce(null) // user_invalidated cache miss
            .mockResolvedValueOnce(sessionId); // session:{userId} = matching sessionId

          const mockDbChain = createMockDbChain([{ tokensInvalidatedAt: null }]);
          (guard as unknown as Record<string, unknown>)['db'] = mockDbChain;

          let result: boolean | undefined;
          let thrownError: unknown;
          try {
            result = await guard.canActivate(buildContext(request));
          } catch (err) {
            thrownError = err;
          }

          // Must NOT have thrown SESSION_INVALIDATED
          if (thrownError instanceof UnauthorizedException) {
            const response = (thrownError as UnauthorizedException).getResponse() as Record<
              string,
              unknown
            >;
            if (response.code === 'SESSION_INVALIDATED') return false;
          }

          return result === true;
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Sub-property 20d: orang_tua is exempt from sid validation (Req 12.9) ──

  it('20d: role orang_tua TIDAK dikenai validasi sid — request harus lolos meskipun Session_Store berbeda atau kosong', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb, // token sid
        fc.option(uuidArb, { nil: null }), // stored session (may differ or be null)
        fc.uuid(), // userId
        async (tokenSid, storedSid, userId) => {
          const tokenPayload = {
            sub: userId,
            role: 'orang_tua',
            iat: Math.floor(Date.now() / 1000) - 30,
            sid: tokenSid,
          };

          const request = {
            user: {
              id: userId,
              role: 'orang_tua',
              tenant_id: null,
              platform: 'mobile',
              jti: 'jti-test',
            },
            headers: {
              authorization: `Bearer ${buildFakeToken(tokenPayload)}`,
            },
          };

          // user_invalidated cache miss only — session lookup should NOT be called
          redisService.get.mockResolvedValueOnce(null).mockResolvedValue(storedSid ?? null);

          const mockDbChain = createMockDbChain([{ tokensInvalidatedAt: null }]);
          (guard as unknown as Record<string, unknown>)['db'] = mockDbChain;

          let result: boolean | undefined;
          let thrownError: unknown;
          try {
            result = await guard.canActivate(buildContext(request));
          } catch (err) {
            thrownError = err;
          }

          // Must NOT have thrown SESSION_INVALIDATED for orang_tua
          if (thrownError instanceof UnauthorizedException) {
            const response = (thrownError as UnauthorizedException).getResponse() as Record<
              string,
              unknown
            >;
            if (response.code === 'SESSION_INVALIDATED') return false;
          }

          // Also confirm session key was never queried
          const sessionKeyQueried = (redisService.get.mock.calls as string[][]).some((args) =>
            args[0]?.startsWith('session:'),
          );
          if (sessionKeyQueried) return false;

          return result === true;
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Sub-property 20e: Redis failure → 503 fail-closed (Req 12.7) ──────────

  it('20e: jika Redis tidak bisa dijangkau saat validasi sid untuk role staff, guard HARUS melempar HTTP 503 SERVICE_UNAVAILABLE (fail-closed)', async () => {
    await fc.assert(
      fc.asyncProperty(
        staffRoleArb,
        uuidArb, // any token sid
        fc.uuid(), // userId
        async (role, tokenSid, userId) => {
          const tokenPayload = {
            sub: userId,
            role,
            iat: Math.floor(Date.now() / 1000) - 30,
            sid: tokenSid,
          };

          const request = {
            user: {
              id: userId,
              role,
              tenant_id: 'tenant-abc',
              platform: 'admin_panel',
              jti: 'jti-test',
            },
            headers: {
              authorization: `Bearer ${buildFakeToken(tokenPayload)}`,
            },
          };

          // user_invalidated cache miss, then Redis throws on session lookup
          redisService.get
            .mockResolvedValueOnce(null) // user_invalidated cache miss
            .mockRejectedValueOnce(new Error('Redis ECONNREFUSED')); // session lookup fails

          const mockDbChain = createMockDbChain([{ tokensInvalidatedAt: null }]);
          (guard as unknown as Record<string, unknown>)['db'] = mockDbChain;

          let thrownError: unknown;
          try {
            await guard.canActivate(buildContext(request));
          } catch (err) {
            thrownError = err;
          }

          if (!thrownError) return false;

          // Must be an HttpException with status 503
          if (!(thrownError instanceof HttpException)) return false;
          if ((thrownError as HttpException).getStatus() !== 503) return false;

          const response = (thrownError as HttpException).getResponse() as Record<string, unknown>;
          return response.code === 'SERVICE_UNAVAILABLE';
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Sub-property 20f: No sid in token → validation skipped, guard passes ──

  it('20f: jika token tidak memiliki claim sid, validasi sid dilewati dan request diizinkan', async () => {
    await fc.assert(
      fc.asyncProperty(
        staffRoleArb,
        fc.uuid(), // userId
        async (role, userId) => {
          // Token payload WITHOUT sid claim
          const tokenPayload = {
            sub: userId,
            role,
            iat: Math.floor(Date.now() / 1000) - 30,
            // no sid field
          };

          const request = {
            user: {
              id: userId,
              role,
              tenant_id: 'tenant-abc',
              platform: 'admin_panel',
              jti: 'jti-test',
            },
            headers: {
              authorization: `Bearer ${buildFakeToken(tokenPayload)}`,
            },
          };

          // Only user_invalidated cache miss — session lookup should NOT occur
          redisService.get.mockResolvedValueOnce(null);

          const mockDbChain = createMockDbChain([{ tokensInvalidatedAt: null }]);
          (guard as unknown as Record<string, unknown>)['db'] = mockDbChain;

          let result: boolean | undefined;
          let thrownError: unknown;
          try {
            result = await guard.canActivate(buildContext(request));
          } catch (err) {
            thrownError = err;
          }

          if (thrownError instanceof UnauthorizedException) {
            const response = (thrownError as UnauthorizedException).getResponse() as Record<
              string,
              unknown
            >;
            if (response.code === 'SESSION_INVALIDATED') return false;
          }

          // Session key must not have been queried
          const sessionKeyQueried = (redisService.get.mock.calls as string[][]).some((args) =>
            args[0]?.startsWith('session:'),
          );
          if (sessionKeyQueried) return false;

          return result === true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
