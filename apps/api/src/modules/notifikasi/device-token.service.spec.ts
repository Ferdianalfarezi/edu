import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DeviceTokenService } from './device-token.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';

describe('DeviceTokenService', () => {
  let service: DeviceTokenService;

  const USER_ID = 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const OTHER_USER_ID = 'cccc3333-cccc-cccc-cccc-cccccccccccc';
  const TOKEN_ID = 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const FCM_TOKEN = 'fcm-token-abc123xyz';

  // Build a chainable mock that mimics Drizzle's builder pattern
  let mockSelectResult: any[];
  let mockInsertResult: any[];
  let mockUpdateResult: any[];

  const buildSelectChain = () => {
    const chain: any = {};
    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockImplementation(() => mockSelectResult);
    return chain;
  };

  const buildInsertChain = () => {
    const chain: any = {};
    chain.values = jest.fn().mockReturnValue(chain);
    chain.onConflictDoUpdate = jest.fn().mockReturnValue(chain);
    chain.returning = jest.fn().mockImplementation(() => mockInsertResult);
    return chain;
  };

  const buildUpdateChain = () => {
    const chain: any = {};
    chain.set = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    chain.returning = jest.fn().mockImplementation(() => mockUpdateResult);
    return chain;
  };

  const mockDb = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    mockSelectResult = [];
    mockInsertResult = [];
    mockUpdateResult = [];

    mockDb.select.mockImplementation(() => buildSelectChain());
    mockDb.insert.mockImplementation(() => buildInsertChain());
    mockDb.update.mockImplementation(() => buildUpdateChain());

    const module: TestingModule = await Test.createTestingModule({
      providers: [DeviceTokenService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<DeviceTokenService>(DeviceTokenService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('registerToken', () => {
    it('should insert a new token when fcm_token does not exist', async () => {
      // No existing token found
      mockSelectResult = [];
      mockInsertResult = [
        {
          id: TOKEN_ID,
          fcmToken: FCM_TOKEN,
          platform: 'android',
          isActive: true,
        },
      ];

      const result = await service.registerToken(USER_ID, FCM_TOKEN, 'android');

      expect(result).toEqual({
        id: TOKEN_ID,
        fcm_token: FCM_TOKEN,
        platform: 'android',
        is_active: true,
      });
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should update existing token when fcm_token already exists', async () => {
      // Token exists for another user
      mockSelectResult = [
        {
          id: TOKEN_ID,
          userId: OTHER_USER_ID,
          platform: 'android',
          isActive: false,
        },
      ];
      mockUpdateResult = [
        {
          id: TOKEN_ID,
          fcmToken: FCM_TOKEN,
          platform: 'ios',
          isActive: true,
        },
      ];

      const result = await service.registerToken(USER_ID, FCM_TOKEN, 'ios');

      expect(result).toEqual({
        id: TOKEN_ID,
        fcm_token: FCM_TOKEN,
        platform: 'ios',
        is_active: true,
      });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should reactivate a previously deactivated token for same user', async () => {
      mockSelectResult = [
        {
          id: TOKEN_ID,
          userId: USER_ID,
          platform: 'android',
          isActive: false,
        },
      ];
      mockUpdateResult = [
        {
          id: TOKEN_ID,
          fcmToken: FCM_TOKEN,
          platform: 'android',
          isActive: true,
        },
      ];

      const result = await service.registerToken(USER_ID, FCM_TOKEN, 'android');

      expect(result.is_active).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('deactivateToken', () => {
    it('should deactivate a token owned by the user', async () => {
      mockUpdateResult = [{ id: TOKEN_ID }];

      await expect(service.deactivateToken(TOKEN_ID, USER_ID)).resolves.toBeUndefined();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when token not found or not owned by user', async () => {
      mockUpdateResult = [];

      await expect(service.deactivateToken(TOKEN_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
