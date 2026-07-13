import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
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

  function createMockContext(
    user?: RequestUser,
    headers?: Record<string, string>,
    options?: { method?: string; body?: Record<string, unknown>; url?: string },
  ): ExecutionContext {
    const request: Record<string, unknown> = {
      headers: headers || {},
      method: options?.method || 'GET',
      body: options?.body || {},
      originalUrl: options?.url || '/',
      url: options?.url || '/',
    };
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
      const request: Record<string, unknown> = { user: staffUser, headers: {} };
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

  describe('super_admin with X-Tenant-Context header', () => {
    const validTenantId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    it('should scope to tenant when valid X-Tenant-Context header is provided', async () => {
      mockPool.connect.mockResolvedValue(mockClient);
      // Mock pool.query for tenant existence check (pool-level query, not client-level)
      (mockDrizzleService.getPool as jest.Mock).mockReturnValue({
        connect: mockPool.connect,
        query: jest.fn().mockResolvedValue({
          rows: [{ id: validTenantId, is_active: true }],
        }),
      });

      const context = createMockContext(superAdminUser, {
        'x-tenant-context': validTenantId,
      });
      const handler = createMockCallHandler('scoped-response');

      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('scoped-response');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(`SET LOCAL app.tenant_id = '${validTenantId}'`);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid UUID format in header', async () => {
      const context = createMockContext(superAdminUser, {
        'x-tenant-context': 'not-a-valid-uuid',
      });
      const handler = createMockCallHandler();

      await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
        BadRequestException,
      );
      await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
        'Tenant tidak tersedia atau tidak aktif',
      );
      expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when tenant does not exist', async () => {
      (mockDrizzleService.getPool as jest.Mock).mockReturnValue({
        connect: mockPool.connect,
        query: jest.fn().mockResolvedValue({ rows: [] }),
      });

      const context = createMockContext(superAdminUser, {
        'x-tenant-context': validTenantId,
      });
      const handler = createMockCallHandler();

      await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
        BadRequestException,
      );
      await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
        'Tenant tidak tersedia atau tidak aktif',
      );
    });

    it('should throw BadRequestException when tenant is inactive', async () => {
      (mockDrizzleService.getPool as jest.Mock).mockReturnValue({
        connect: mockPool.connect,
        query: jest.fn().mockResolvedValue({
          rows: [{ id: validTenantId, is_active: false }],
        }),
      });

      const context = createMockContext(superAdminUser, {
        'x-tenant-context': validTenantId,
      });
      const handler = createMockCallHandler();

      await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
        BadRequestException,
      );
      await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
        'Tenant tidak tersedia atau tidak aktif',
      );
    });

    it('should throw InternalServerErrorException when SET LOCAL fails', async () => {
      (mockDrizzleService.getPool as jest.Mock).mockReturnValue({
        connect: mockPool.connect,
        query: jest.fn().mockResolvedValue({
          rows: [{ id: validTenantId, is_active: true }],
        }),
      });

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.startsWith('SET LOCAL')) {
          return Promise.reject(new Error('SET LOCAL failed'));
        }
        return Promise.resolve();
      });

      const context = createMockContext(superAdminUser, {
        'x-tenant-context': validTenantId,
      });
      const handler = createMockCallHandler();

      await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
        'Konteks tenant tidak dapat disiapkan',
      );
    });

    it('should bypass RLS when no X-Tenant-Context header is present', async () => {
      const context = createMockContext(superAdminUser);
      const handler = createMockCallHandler('bypass-response');

      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('bypass-response');
      expect(mockPool.connect).not.toHaveBeenCalled();
    });
  });

  describe('super_admin POST create validation (tenant_id required)', () => {
    it('should throw BadRequestException when SUPER_ADMIN does POST without tenant context and without tenant_id in body', () => {
      const context = createMockContext(
        superAdminUser,
        {},
        {
          method: 'POST',
          url: '/users',
          body: { name: 'Test User', email: 'test@test.com' },
        },
      );
      const handler = createMockCallHandler();

      expect(() => interceptor.intercept(context, handler)).toThrow(BadRequestException);
      expect(() => interceptor.intercept(context, handler)).toThrow(
        'tenant_id wajib disertakan untuk operasi create oleh Superadmin',
      );
    });

    it('should allow POST when tenant_id is present in body', async () => {
      const context = createMockContext(
        superAdminUser,
        {},
        {
          method: 'POST',
          url: '/users',
          body: { name: 'Test User', tenant_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        },
      );
      const handler = createMockCallHandler('created');

      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('created');
      expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('should allow POST when X-Tenant-Context header is set', async () => {
      const validTenantId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      (mockDrizzleService.getPool as jest.Mock).mockReturnValue({
        connect: mockPool.connect,
        query: jest.fn().mockResolvedValue({
          rows: [{ id: validTenantId, is_active: true }],
        }),
      });

      const context = createMockContext(
        superAdminUser,
        {
          'x-tenant-context': validTenantId,
        },
        {
          method: 'POST',
          url: '/users',
          body: { name: 'Test User' },
        },
      );
      const handler = createMockCallHandler('scoped-create');

      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('scoped-create');
    });

    it('should exempt /tenants route from tenant_id check', async () => {
      const context = createMockContext(
        superAdminUser,
        {},
        {
          method: 'POST',
          url: '/tenants',
          body: { nama: 'New School' },
        },
      );
      const handler = createMockCallHandler('tenant-created');

      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('tenant-created');
    });

    it('should exempt /auth routes from tenant_id check', async () => {
      const context = createMockContext(
        superAdminUser,
        {},
        {
          method: 'POST',
          url: '/auth/login',
          body: { email: 'admin@test.com', password: 'pass' },
        },
      );
      const handler = createMockCallHandler('login-response');

      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('login-response');
    });

    it('should exempt routes with UUID path segments (operating on existing entities)', async () => {
      const context = createMockContext(
        superAdminUser,
        {},
        {
          method: 'POST',
          url: '/users/11111111-1111-1111-1111-111111111111/reset-password',
          body: {},
        },
      );
      const handler = createMockCallHandler('password-reset');

      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('password-reset');
    });

    it('should not apply validation for non-POST methods (GET, PATCH, DELETE)', async () => {
      const context = createMockContext(
        superAdminUser,
        {},
        {
          method: 'GET',
          url: '/users',
          body: {},
        },
      );
      const handler = createMockCallHandler('get-response');

      const result = await lastValueFrom(interceptor.intercept(context, handler));

      expect(result).toBe('get-response');
    });

    it('should reject POST to non-exempt route with empty body', () => {
      const context = createMockContext(
        superAdminUser,
        {},
        {
          method: 'POST',
          url: '/siswa',
          body: {},
        },
      );
      const handler = createMockCallHandler();

      expect(() => interceptor.intercept(context, handler)).toThrow(BadRequestException);
      expect(() => interceptor.intercept(context, handler)).toThrow(
        'tenant_id wajib disertakan untuk operasi create oleh Superadmin',
      );
    });

    it('should reject POST to non-exempt route with null body', () => {
      const context = createMockContext(
        superAdminUser,
        {},
        {
          method: 'POST',
          url: '/kelas',
          body: undefined as unknown as Record<string, unknown>,
        },
      );
      const handler = createMockCallHandler();

      expect(() => interceptor.intercept(context, handler)).toThrow(BadRequestException);
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
