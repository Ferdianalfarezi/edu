import { Test, TestingModule } from '@nestjs/testing';
import { CallHandler, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { of, lastValueFrom, throwError } from 'rxjs';
import { Role } from '@edu/shared';
import { TenantInterceptor, TENANT_CLIENT_KEY } from './tenant.interceptor';
import { DrizzleService } from '../../drizzle/drizzle.service';
import { RequestUser } from '../../modules/auth/interfaces';

describe('TenantInterceptor', () => {
  let interceptor: TenantInterceptor;
  let mockClient: {
    query: jest.Mock;
    release: jest.Mock;
  };
  let mockPool: { connect: jest.Mock };
  let mockDrizzleService: Partial<DrizzleService>;

  beforeEach(async () => {
    mockClient = {
      query: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    mockDrizzleService = {
      getPool: jest.fn().mockReturnValue(mockPool),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantInterceptor, { provide: DrizzleService, useValue: mockDrizzleService }],
    }).compile();

    interceptor = module.get<TenantInterceptor>(TenantInterceptor);
  });

  function createMockContext(user?: RequestUser): ExecutionContext {
    const request: Record<string, unknown> = {};
    if (user) {
      request['user'] = user;
    }

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  }

  function createMockCallHandler(response: unknown = 'ok'): CallHandler {
    return {
      handle: () => of(response),
    };
  }

  function createErrorCallHandler(error: Error): CallHandler {
    return {
      handle: () => throwError(() => error),
    };
  }

  const staffUser: RequestUser = {
    id: '11111111-1111-1111-1111-111111111111',
    role: Role.ADMIN,
    tenant_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    platform: 'admin_panel',
    jti: 'test-jti',
  };

  const guruUser: RequestUser = {
    id: '22222222-2222-2222-2222-222222222222',
    role: Role.GURU,
    tenant_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    platform: 'mobile',
    jti: 'test-jti-2',
  };

  const superAdminUser: RequestUser = {
    id: '33333333-3333-3333-3333-333333333333',
    role: Role.SUPER_ADMIN,
    tenant_id: null,
    platform: 'admin_panel',
    jti: 'test-jti-3',
  };

  const orangTuaUser: RequestUser = {
    id: '44444444-4444-4444-4444-444444444444',
    role: Role.ORANG_TUA,
    tenant_id: null,
    tenants: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'ffffffff-ffff-ffff-ffff-ffffffffffff'],
    platform: 'mobile',
    jti: 'test-jti-4',
  };

  describe('skip scenarios', () => {
    it('should skip when no user is on the request (unauthenticated)', async () => {
      const context = createMockContext(undefined);
      const handler = createMockCallHandler('response');

      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('response');
      expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('should skip for super_admin role', async () => {
      const context = createMockContext(superAdminUser);
      const handler = createMockCallHandler('super-response');

      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('super-response');
      expect(mockPool.connect).not.toHaveBeenCalled();
    });
  });

  describe('staff roles (admin, guru, bendahara, kepala_sekolah)', () => {
    it('should set app.tenant_id for staff user', async () => {
      const context = createMockContext(staffUser);
      const handler = createMockCallHandler('staff-response');

      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('staff-response');
      expect(mockPool.connect).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'`,
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should set app.tenant_id for guru user', async () => {
      const context = createMockContext(guruUser);
      const handler = createMockCallHandler('guru-response');

      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('guru-response');
      expect(mockClient.query).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'`,
      );
    });

    it('should throw ForbiddenException when staff has no tenant_id', () => {
      const noTenantStaff: RequestUser = {
        ...staffUser,
        tenant_id: null,
      };
      const context = createMockContext(noTenantStaff);
      const handler = createMockCallHandler();

      expect(() => interceptor.intercept(context, handler)).toThrow(ForbiddenException);
      expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('should rollback and release on handler error', async () => {
      const context = createMockContext(staffUser);
      const handler = createErrorCallHandler(new Error('Something failed'));

      await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
        'Something failed',
      );

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should store the client on the request as TENANT_CLIENT_KEY', async () => {
      const request: Record<string, unknown> = { user: staffUser };
      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => ({}),
        }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
      } as unknown as ExecutionContext;
      const handler = createMockCallHandler();

      await lastValueFrom(interceptor.intercept(context, handler));

      expect(request[TENANT_CLIENT_KEY]).toBe(mockClient);
    });
  });

  describe('orang_tua role (cross-tenant)', () => {
    it('should set app.tenant_ids for orang_tua with multiple tenants', async () => {
      const context = createMockContext(orangTuaUser);
      const handler = createMockCallHandler('parent-response');

      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('parent-response');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_ids = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee,ffffffff-ffff-ffff-ffff-ffffffffffff'`,
      );
      // Also sets a placeholder tenant_id for RLS fail-closed
      expect(mockClient.query).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '00000000-0000-0000-0000-000000000000'`,
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when orang_tua has empty tenants array', () => {
      const noTenantsParent: RequestUser = {
        ...orangTuaUser,
        tenants: [],
      };
      const context = createMockContext(noTenantsParent);
      const handler = createMockCallHandler();

      expect(() => interceptor.intercept(context, handler)).toThrow(ForbiddenException);
      expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when orang_tua has undefined tenants', () => {
      const noTenantsParent: RequestUser = {
        ...orangTuaUser,
        tenants: undefined,
      };
      const context = createMockContext(noTenantsParent);
      const handler = createMockCallHandler();

      expect(() => interceptor.intercept(context, handler)).toThrow(ForbiddenException);
    });
  });

  describe('UUID validation (SQL injection prevention)', () => {
    it('should reject invalid tenant_id format', async () => {
      const maliciousUser: RequestUser = {
        ...staffUser,
        tenant_id: "'; DROP TABLE siswa; --",
      };
      const context = createMockContext(maliciousUser);
      const handler = createMockCallHandler();

      await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject invalid UUID in orang_tua tenants', async () => {
      const maliciousParent: RequestUser = {
        ...orangTuaUser,
        tenants: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'not-a-valid-uuid'],
      };
      const context = createMockContext(maliciousParent);
      const handler = createMockCallHandler();

      await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should accept valid UUID format', async () => {
      const context = createMockContext(staffUser);
      const handler = createMockCallHandler();

      // Should not throw
      await lastValueFrom(interceptor.intercept(context, handler));
      expect(mockClient.query).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'`,
      );
    });
  });

  describe('error handling in setup', () => {
    it('should rollback and release client if BEGIN fails', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') {
          return Promise.reject(new Error('Connection error'));
        }
        return Promise.resolve();
      });

      const context = createMockContext(staffUser);
      const handler = createMockCallHandler();

      await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
        'Connection error',
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle pool.connect() failure gracefully', async () => {
      mockPool.connect.mockRejectedValue(new Error('Pool exhausted'));

      const context = createMockContext(staffUser);
      const handler = createMockCallHandler();

      await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
        'Pool exhausted',
      );
    });
  });
});
