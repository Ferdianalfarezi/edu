import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';
import * as fc from 'fast-check';
import { AuthService } from '../auth.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { RedisService } from '@/modules/redis/redis.service';
import { QUEUE_NAMES } from '@/modules/queue';
import { Role } from '@edu/shared';
import type { RequestUser } from '../interfaces';

// ---------------------------------------------------------------------------
// Property 21: Logout menghapus sesi dari Session_Store
// Feature: sistem-pengembangan-v2, Property 21: Logout menghapus sesi dari Session_Store
// **Validates: Requirements 12.6**
// ---------------------------------------------------------------------------

describe('Property 21: Logout menghapus sesi dari Session_Store', () => {
  let service: AuthService;
  let mockRedisService: jest.Mocked<Partial<RedisService>>;

  function createMockDbChain(results: any[] = []) {
    const chain: any = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockResolvedValue(results);
    return chain;
  }

  beforeEach(async () => {
    mockRedisService = {
      isTokenBlacklisted: jest.fn().mockResolvedValue(false),
      blacklistToken: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delSession: jest.fn().mockResolvedValue(undefined),
    };

    const mockDb = { select: jest.fn(), update: jest.fn() };
    mockDb.select.mockReturnValue(createMockDbChain([]));

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
            get: jest.fn((key: string) =>
              key === 'JWT_ACCESS_SECRET' ? 'test-access-secret' : 'test-refresh-secret',
            ),
          },
        },
        { provide: RedisService, useValue: mockRedisService },
        {
          provide: getQueueToken(QUEUE_NAMES.EMAIL),
          useValue: { add: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Arbitrary: non-orang_tua roles ─────────────────────────────────────

  // All roles that participate in single-device login (Req 12.8, 12.9)
  const nonOrangTuaRoleArb = fc.constantFrom(
    Role.ADMIN,
    Role.KEPALA_SEKOLAH,
    Role.GURU,
    Role.BENDAHARA,
    Role.SUPER_ADMIN,
  );

  // Valid UUID v4 pattern used for user IDs
  const userIdArb = fc.uuid();

  // Build a RequestUser for any non-orang_tua role
  const nonOrangTuaRequestUserArb: fc.Arbitrary<RequestUser> = fc
    .tuple(userIdArb, nonOrangTuaRoleArb)
    .map(([id, role]) => ({
      id,
      role,
      tenant_id: 'tenant-uuid-test',
      platform: 'admin_panel' as const,
      jti: `jti-${id}`,
    }));

  // ─── Property: delSession is always called with correct key for non-orang_tua ─

  it('calls delSession with the correct userId for every non-orang_tua role on every call', async () => {
    await fc.assert(
      fc.asyncProperty(nonOrangTuaRequestUserArb, async (currentUser) => {
        // Reset mock call history for this iteration
        (mockRedisService.delSession as jest.Mock).mockClear();

        await service.logout(currentUser);

        // PROPERTY: delSession MUST be called exactly once
        expect(mockRedisService.delSession).toHaveBeenCalledTimes(1);

        // PROPERTY: delSession MUST be called with the exact userId
        expect(mockRedisService.delSession).toHaveBeenCalledWith(currentUser.id);
      }),
      { numRuns: 100 },
    );
  });

  it('session key session:{userId} is deleted — del is never called with a wrong key variant', async () => {
    await fc.assert(
      fc.asyncProperty(nonOrangTuaRequestUserArb, async (currentUser) => {
        (mockRedisService.delSession as jest.Mock).mockClear();

        await service.logout(currentUser);

        const [calledWith] = (mockRedisService.delSession as jest.Mock).mock.calls[0];

        // PROPERTY: the argument must equal exactly the userId — not a prefixed key
        // (delSession internally builds `session:{userId}` — the service should pass
        // just the userId, not a pre-built Redis key string)
        expect(calledWith).toBe(currentUser.id);
        expect(calledWith).not.toContain('session:');
      }),
      { numRuns: 100 },
    );
  });

  it('logout does NOT call delSession for orang_tua (multi-device exemption, Req 12.9)', async () => {
    const orangTuaUser: RequestUser = {
      id: 'parent-uuid-test',
      role: Role.ORANG_TUA,
      tenant_id: null,
      platform: 'mobile',
      jti: 'jti-parent-test',
    };

    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        (mockRedisService.delSession as jest.Mock).mockClear();

        const parentUser: RequestUser = { ...orangTuaUser, id: userId };
        await service.logout(parentUser);

        // PROPERTY: delSession must NEVER be called for orang_tua
        expect(mockRedisService.delSession).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it('delSession is called before logout returns (not fire-and-forget)', async () => {
    await fc.assert(
      fc.asyncProperty(nonOrangTuaRequestUserArb, async (currentUser) => {
        let resolvedBeforeReturn = false;

        (mockRedisService.delSession as jest.Mock).mockImplementation(async () => {
          resolvedBeforeReturn = true;
        });

        await service.logout(currentUser);

        // PROPERTY: the session deletion must have completed (awaited) by the time
        // logout returns — ensures it is not fire-and-forget
        expect(resolvedBeforeReturn).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
