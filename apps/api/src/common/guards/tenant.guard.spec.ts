import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@edu/shared';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let mockContext: ExecutionContext;
  let mockRequest: any;

  beforeEach(() => {
    guard = new TenantGuard();

    mockRequest = {
      params: {},
      query: {},
      body: {},
      user: {
        id: 'user-123',
        role: Role.ADMIN,
        tenant_id: 'tenant-A',
        platform: 'admin_panel',
        jti: 'jti-789',
      },
    };

    mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as any;
  });

  describe('super_admin', () => {
    beforeEach(() => {
      mockRequest.user.role = Role.SUPER_ADMIN;
      mockRequest.user.tenant_id = null;
    });

    it('should allow access to any tenant', () => {
      mockRequest.params.tenant_id = 'tenant-X';

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should allow access when no tenant_id in request', () => {
      expect(guard.canActivate(mockContext)).toBe(true);
    });
  });

  describe('orang_tua (cross-tenant parent)', () => {
    beforeEach(() => {
      mockRequest.user.role = Role.ORANG_TUA;
      mockRequest.user.tenant_id = null;
      mockRequest.user.tenants = ['tenant-A', 'tenant-B'];
    });

    it('should allow access to authorized tenant', () => {
      mockRequest.params.tenant_id = 'tenant-A';

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should allow access to another authorized tenant', () => {
      mockRequest.query.tenant_id = 'tenant-B';

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should deny access to unauthorized tenant', () => {
      mockRequest.params.tenant_id = 'tenant-C';

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(mockContext)).toThrow(
        "You do not have access to this school's data",
      );
    });

    it('should deny access when tenants list is empty', () => {
      mockRequest.user.tenants = [];
      mockRequest.params.tenant_id = 'tenant-A';

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should allow when no tenant_id in request', () => {
      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should extract tenant_id from body when not in params or query', () => {
      mockRequest.body.tenant_id = 'tenant-A';

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should deny when tenant_id in body is not authorized', () => {
      mockRequest.body.tenant_id = 'tenant-UNKNOWN';

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });
  });

  describe('staff roles (admin, guru, bendahara, kepala_sekolah)', () => {
    it('should allow when requested tenant matches user tenant', () => {
      mockRequest.user.role = Role.ADMIN;
      mockRequest.user.tenant_id = 'tenant-A';
      mockRequest.params.tenant_id = 'tenant-A';

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should deny when requested tenant does not match user tenant', () => {
      mockRequest.user.role = Role.GURU;
      mockRequest.user.tenant_id = 'tenant-A';
      mockRequest.params.tenant_id = 'tenant-B';

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should allow when no tenant_id in request', () => {
      mockRequest.user.role = Role.BENDAHARA;
      mockRequest.user.tenant_id = 'tenant-A';

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should prioritize route param tenantId over query', () => {
      mockRequest.user.role = Role.ADMIN;
      mockRequest.user.tenant_id = 'tenant-A';
      mockRequest.params.tenantId = 'tenant-A'; // camelCase from route
      mockRequest.query.tenant_id = 'tenant-B';

      expect(guard.canActivate(mockContext)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should throw when no user on request', () => {
      mockRequest.user = undefined;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });
  });
});
