import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@edu/shared';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;
  let mockContext: ExecutionContext;
  let mockRequest: any;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    guard = new RolesGuard(reflector);

    mockRequest = {
      user: {
        id: 'user-123',
        role: Role.ADMIN,
        tenant_id: 'tenant-456',
        platform: 'admin_panel',
        jti: 'jti-789',
      },
    };

    mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as any;
  });

  it('should allow access when no @Roles() decorator is set', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should allow access when roles array is empty', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should allow access when user role is in the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN, Role.BENDAHARA]);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should deny access when user role is not in the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.BENDAHARA, Role.KEPALA_SEKOLAH]);

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(mockContext)).toThrow(
      'You do not have permission to access this resource',
    );
  });

  it('should deny access when no user on request', () => {
    mockRequest.user = undefined;
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  it('should allow guru access to guru-restricted routes', () => {
    mockRequest.user.role = Role.GURU;
    reflector.getAllAndOverride.mockReturnValue([Role.GURU]);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should deny orang_tua from admin-only routes', () => {
    mockRequest.user.role = Role.ORANG_TUA;
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN, Role.BENDAHARA]);

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  it('should allow super_admin when included in roles', () => {
    mockRequest.user.role = Role.SUPER_ADMIN;
    reflector.getAllAndOverride.mockReturnValue([Role.SUPER_ADMIN]);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should deny super_admin when not included in roles', () => {
    mockRequest.user.role = Role.SUPER_ADMIN;
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });
});
