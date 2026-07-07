import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { FcmService, FcmMessage } from './fcm.service';
import { DrizzleService } from '@/drizzle/drizzle.service';

// Mock firebase-admin
jest.mock('firebase-admin', () => {
  const mockSendEach = jest.fn();
  const mockMessaging = jest.fn(() => ({ sendEach: mockSendEach }));
  const mockApp = { messaging: mockMessaging };

  return {
    apps: [],
    initializeApp: jest.fn(() => mockApp),
    credential: {
      cert: jest.fn(() => 'mock-credential'),
    },
    __mockApp: mockApp,
    __mockSendEach: mockSendEach,
    __mockMessaging: mockMessaging,
  };
});

const mockAdmin = admin as unknown as typeof admin & {
  __mockApp: { messaging: jest.Mock };
  __mockSendEach: jest.Mock;
  __mockMessaging: jest.Mock;
};

describe('FcmService', () => {
  let service: FcmService;
  let mockConfigService: Partial<ConfigService>;
  let mockDrizzleService: { db: { update: jest.Mock } };
  let mockUpdate: jest.Mock;
  let mockSet: jest.Mock;
  let mockWhere: jest.Mock;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    (admin as any).apps = [];

    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          FIREBASE_PROJECT_ID: 'test-project',
          FIREBASE_PRIVATE_KEY: 'test-private-key',
          FIREBASE_CLIENT_EMAIL: 'test@test.iam.gserviceaccount.com',
        };
        return config[key];
      }),
    };

    mockWhere = jest.fn().mockResolvedValue(undefined);
    mockSet = jest.fn(() => ({ where: mockWhere }));
    mockUpdate = jest.fn(() => ({ set: mockSet }));
    mockDrizzleService = {
      db: { update: mockUpdate },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FcmService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DrizzleService, useValue: mockDrizzleService },
      ],
    }).compile();

    service = module.get<FcmService>(FcmService);
    service.onModuleInit();
  });

  describe('initialization', () => {
    it('should initialize Firebase Admin SDK with credentials from ConfigService', () => {
      expect(admin.credential.cert).toHaveBeenCalledWith({
        projectId: 'test-project',
        privateKey: 'test-private-key',
        clientEmail: 'test@test.iam.gserviceaccount.com',
      });
      expect(admin.initializeApp).toHaveBeenCalled();
    });

    it('should reuse existing Firebase app if already initialized', () => {
      jest.clearAllMocks();
      (admin as any).apps = [mockAdmin.__mockApp];

      service.onModuleInit();

      expect(admin.initializeApp).not.toHaveBeenCalled();
    });

    it('should handle missing Firebase credentials gracefully', () => {
      jest.clearAllMocks();
      (admin as any).apps = [];

      (mockConfigService.get as jest.Mock).mockReturnValue(undefined);
      service.onModuleInit();

      // Should still call initializeApp (without credentials)
      expect(admin.initializeApp).toHaveBeenCalled();
    });
  });

  describe('sendBatch', () => {
    it('should return empty result for empty messages array', async () => {
      const result = await service.sendBatch([]);

      expect(result).toEqual({
        total: 0,
        successCount: 0,
        failureCount: 0,
        results: [],
      });
    });

    it('should send messages and return per-token results', async () => {
      const messages: FcmMessage[] = [
        { token: 'token-1', notification: { title: 'Test', body: 'Hello' } },
        { token: 'token-2', notification: { title: 'Test', body: 'World' } },
      ];

      mockAdmin.__mockSendEach.mockResolvedValue({
        responses: [
          { success: true, messageId: 'msg-1' },
          { success: true, messageId: 'msg-2' },
        ],
        successCount: 2,
        failureCount: 0,
      });

      const result = await service.sendBatch(messages);

      expect(result.total).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.results[0]).toEqual({
        token: 'token-1',
        success: true,
        messageId: 'msg-1',
      });
      expect(result.results[1]).toEqual({
        token: 'token-2',
        success: true,
        messageId: 'msg-2',
      });
    });

    it('should handle partial failures and return mixed results', async () => {
      const messages: FcmMessage[] = [
        { token: 'token-good', notification: { title: 'Test', body: 'OK' } },
        { token: 'token-bad', notification: { title: 'Test', body: 'Fail' } },
      ];

      mockAdmin.__mockSendEach.mockResolvedValue({
        responses: [
          { success: true, messageId: 'msg-good' },
          {
            success: false,
            error: { code: 'messaging/invalid-argument', message: 'Invalid token' },
          },
        ],
        successCount: 1,
        failureCount: 1,
      });

      const result = await service.sendBatch(messages);

      expect(result.total).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].errorCode).toBe('messaging/invalid-argument');
    });

    it('should deactivate stale tokens on registration-token-not-registered error', async () => {
      const messages: FcmMessage[] = [
        { token: 'token-stale', notification: { title: 'Test', body: 'Stale' } },
        { token: 'token-ok', notification: { title: 'Test', body: 'OK' } },
      ];

      mockAdmin.__mockSendEach.mockResolvedValue({
        responses: [
          {
            success: false,
            error: {
              code: 'messaging/registration-token-not-registered',
              message: 'Token not registered',
            },
          },
          { success: true, messageId: 'msg-ok' },
        ],
        successCount: 1,
        failureCount: 1,
      });

      const result = await service.sendBatch(messages);

      expect(result.failureCount).toBe(1);
      expect(result.results[0].errorCode).toBe('messaging/registration-token-not-registered');

      // Allow async deactivation to run
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });

    it('should chunk messages into groups of 500 for sendEach', async () => {
      // Create 600 messages to test chunking
      const messages: FcmMessage[] = Array.from({ length: 600 }, (_, i) => ({
        token: `token-${i}`,
        notification: { title: 'Test', body: `Message ${i}` },
      }));

      mockAdmin.__mockSendEach.mockImplementation((msgs: any[]) => {
        return Promise.resolve({
          responses: msgs.map(() => ({ success: true, messageId: 'msg-id' })),
          successCount: msgs.length,
          failureCount: 0,
        });
      });

      const result = await service.sendBatch(messages);

      // Should have been called twice: once with 500, once with 100
      expect(mockAdmin.__mockSendEach).toHaveBeenCalledTimes(2);
      const firstCallArgs = mockAdmin.__mockSendEach.mock.calls[0][0];
      const secondCallArgs = mockAdmin.__mockSendEach.mock.calls[1][0];
      expect(firstCallArgs.length).toBe(500);
      expect(secondCallArgs.length).toBe(100);
      expect(result.total).toBe(600);
      expect(result.successCount).toBe(600);
    });

    it('should handle complete sendEach failure gracefully', async () => {
      const messages: FcmMessage[] = [
        { token: 'token-1', notification: { title: 'Test', body: 'Fail' } },
        { token: 'token-2', notification: { title: 'Test', body: 'Fail' } },
      ];

      mockAdmin.__mockSendEach.mockRejectedValue(new Error('Network timeout'));

      const result = await service.sendBatch(messages);

      expect(result.total).toBe(2);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(2);
      expect(result.results[0].error).toBe('Network timeout');
      expect(result.results[0].errorCode).toBe('messaging/internal-error');
    });

    it('should pass data payload in FCM messages', async () => {
      const messages: FcmMessage[] = [
        {
          token: 'token-1',
          notification: { title: 'Absensi', body: 'Status: hadir' },
          data: { type: 'absensi', siswa_id: 'siswa-123' },
        },
      ];

      mockAdmin.__mockSendEach.mockResolvedValue({
        responses: [{ success: true, messageId: 'msg-1' }],
        successCount: 1,
        failureCount: 0,
      });

      await service.sendBatch(messages);

      const sentMessages = mockAdmin.__mockSendEach.mock.calls[0][0];
      expect(sentMessages[0]).toEqual({
        token: 'token-1',
        notification: { title: 'Absensi', body: 'Status: hadir' },
        data: { type: 'absensi', siswa_id: 'siswa-123' },
      });
    });
  });

  describe('deactivateStaleTokens', () => {
    it('should do nothing for empty token array', async () => {
      await service.deactivateStaleTokens([]);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should deactivate multiple stale tokens', async () => {
      await service.deactivateStaleTokens(['stale-1', 'stale-2', 'stale-3']);

      expect(mockUpdate).toHaveBeenCalledTimes(3);
      expect(mockSet).toHaveBeenCalledTimes(3);
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });
  });
});
