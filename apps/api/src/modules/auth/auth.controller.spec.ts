import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RedisService } from '@/modules/redis/redis.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { Role } from '@edu/shared';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: any;

  beforeEach(async () => {
    mockAuthService = {
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: RedisService, useValue: {} },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('POST /auth/login', () => {
    it('should call authService.login and return result', async () => {
      const loginResponse = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        must_change_password: false,
        user: { id: '1', name: 'Admin', role: Role.ADMIN, tenant_id: 'tenant-1' },
      };
      mockAuthService.login!.mockResolvedValue(loginResponse);

      const result = await controller.login({
        email: 'admin@school.com',
        password: 'password',
        platform: 'admin_panel',
      });

      expect(result).toEqual(loginResponse);
      expect(mockAuthService.login).toHaveBeenCalled();
    });
  });

  describe('POST /auth/refresh', () => {
    it('should call authService.refresh and return new token pair', async () => {
      const tokenPair = { access_token: 'new-access', refresh_token: 'new-refresh' };
      mockAuthService.refresh!.mockResolvedValue(tokenPair);

      const result = await controller.refresh({ refresh_token: 'old-refresh-token' });

      expect(result).toEqual(tokenPair);
      expect(mockAuthService.refresh).toHaveBeenCalledWith({ refresh_token: 'old-refresh-token' });
    });

    it('should propagate UnauthorizedException from service', async () => {
      mockAuthService.refresh!.mockRejectedValue(
        new UnauthorizedException('Refresh token tidak valid atau sudah kadaluarsa'),
      );

      await expect(controller.refresh({ refresh_token: 'invalid-token' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('POST /auth/logout', () => {
    it('should call authService.logout and return success message', async () => {
      mockAuthService.logout!.mockResolvedValue(undefined);

      const currentUser = {
        id: 'user-1',
        role: Role.ADMIN,
        tenant_id: 'tenant-1',
        platform: 'admin_panel' as const,
        jti: 'access-jti-1',
      };

      const result = await controller.logout(currentUser, 'refresh-token');

      expect(result).toEqual({ message: 'Berhasil logout' });
      expect(mockAuthService.logout).toHaveBeenCalledWith(currentUser, 'refresh-token');
    });

    it('should allow logout without refresh_token in body', async () => {
      mockAuthService.logout!.mockResolvedValue(undefined);

      const currentUser = {
        id: 'user-1',
        role: Role.ADMIN,
        tenant_id: 'tenant-1',
        platform: 'admin_panel' as const,
        jti: 'access-jti-1',
      };

      const result = await controller.logout(currentUser, undefined);

      expect(result).toEqual({ message: 'Berhasil logout' });
      expect(mockAuthService.logout).toHaveBeenCalledWith(currentUser, undefined);
    });
  });
});
