import { Role } from '@edu/shared';
import { JwtStrategy } from './jwt.strategy';
import { JwtPayload } from '../interfaces';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockReturnValue('test-jwt-secret'),
    };

    strategy = new JwtStrategy(mockConfigService);
  });

  describe('validate', () => {
    it('should extract correct fields from a staff payload', () => {
      const payload: JwtPayload = {
        sub: 'user-123',
        role: Role.ADMIN,
        tenant_id: 'tenant-456',
        platform: 'admin_panel',
        jti: 'jti-abc',
        iat: 1700000000,
        exp: 1700086400,
      };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        id: 'user-123',
        role: Role.ADMIN,
        tenant_id: 'tenant-456',
        tenants: undefined,
        platform: 'admin_panel',
        jti: 'jti-abc',
      });
    });

    it('should extract cross-tenant parent payload with tenants array', () => {
      const payload: JwtPayload = {
        sub: 'parent-789',
        role: Role.ORANG_TUA,
        tenant_id: null,
        tenants: ['tenant-A', 'tenant-B'],
        platform: 'mobile',
        jti: 'jti-parent',
        iat: 1700000000,
        exp: 1731536000,
      };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        id: 'parent-789',
        role: Role.ORANG_TUA,
        tenant_id: null,
        tenants: ['tenant-A', 'tenant-B'],
        platform: 'mobile',
        jti: 'jti-parent',
      });
    });

    it('should handle guru on mobile platform', () => {
      const payload: JwtPayload = {
        sub: 'guru-555',
        role: Role.GURU,
        tenant_id: 'tenant-X',
        platform: 'mobile',
        jti: 'jti-guru',
        iat: 1700000000,
        exp: 1707776000,
      };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        id: 'guru-555',
        role: Role.GURU,
        tenant_id: 'tenant-X',
        tenants: undefined,
        platform: 'mobile',
        jti: 'jti-guru',
      });
    });

    it('should handle super_admin with null tenant_id', () => {
      const payload: JwtPayload = {
        sub: 'admin-001',
        role: Role.SUPER_ADMIN,
        tenant_id: null,
        platform: 'admin_panel',
        jti: 'jti-super',
        iat: 1700000000,
        exp: 1700086400,
      };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        id: 'admin-001',
        role: Role.SUPER_ADMIN,
        tenant_id: null,
        tenants: undefined,
        platform: 'admin_panel',
        jti: 'jti-super',
      });
    });
  });
});
