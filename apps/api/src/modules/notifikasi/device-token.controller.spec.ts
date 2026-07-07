import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DeviceTokenController } from './device-token.controller';
import { DeviceTokenService } from './device-token.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { RedisService } from '@/modules/redis/redis.service';

describe('DeviceTokenController', () => {
  let controller: DeviceTokenController;
  let service: jest.Mocked<DeviceTokenService>;

  const USER_ID = 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const TOKEN_ID = 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const mockService = {
    registerToken: jest.fn(),
    deactivateToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeviceTokenController],
      providers: [
        { provide: DeviceTokenService, useValue: mockService },
        { provide: RedisService, useValue: {} },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    controller = module.get<DeviceTokenController>(DeviceTokenController);
    service = module.get(DeviceTokenService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('POST /device-tokens', () => {
    it('should register a new device token', async () => {
      const dto = { fcm_token: 'fcm-token-abc123', platform: 'android' as const };
      const expected = {
        id: TOKEN_ID,
        fcm_token: 'fcm-token-abc123',
        platform: 'android',
        is_active: true,
      };
      mockService.registerToken.mockResolvedValue(expected);

      const result = await controller.register(USER_ID, dto);

      expect(result).toEqual(expected);
      expect(mockService.registerToken).toHaveBeenCalledWith(
        USER_ID,
        'fcm-token-abc123',
        'android',
      );
    });

    it('should upsert an existing token (same fcm_token)', async () => {
      const dto = { fcm_token: 'existing-token-xyz', platform: 'ios' as const };
      const expected = {
        id: TOKEN_ID,
        fcm_token: 'existing-token-xyz',
        platform: 'ios',
        is_active: true,
      };
      mockService.registerToken.mockResolvedValue(expected);

      const result = await controller.register(USER_ID, dto);

      expect(result).toEqual(expected);
      expect(mockService.registerToken).toHaveBeenCalledWith(USER_ID, 'existing-token-xyz', 'ios');
    });
  });

  describe('DELETE /device-tokens/:tokenId', () => {
    it('should deactivate a device token on logout', async () => {
      mockService.deactivateToken.mockResolvedValue(undefined);

      await controller.deactivate(USER_ID, TOKEN_ID);

      expect(mockService.deactivateToken).toHaveBeenCalledWith(TOKEN_ID, USER_ID);
    });

    it('should throw NotFoundException when token does not exist', async () => {
      mockService.deactivateToken.mockRejectedValue(
        new NotFoundException('Device token tidak ditemukan'),
      );

      await expect(controller.deactivate(USER_ID, TOKEN_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
