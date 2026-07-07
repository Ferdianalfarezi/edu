import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { deviceToken } from '@/drizzle/schema/notifikasi';

/**
 * A single FCM message to be sent.
 */
export interface FcmMessage {
  token: string;
  notification?: {
    title: string;
    body: string;
  };
  data?: Record<string, string>;
}

/**
 * Result of a single message send attempt.
 */
export interface FcmSendResult {
  token: string;
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Result of a batch send operation.
 */
export interface FcmBatchResult {
  total: number;
  successCount: number;
  failureCount: number;
  results: FcmSendResult[];
}

/** Max tokens per FCM sendEach call */
const FCM_BATCH_LIMIT = 500;

/**
 * FCM error code indicating the token is no longer valid.
 * When this error occurs, the device_token should be deactivated.
 */
const STALE_TOKEN_ERROR = 'messaging/registration-token-not-registered';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private app: admin.app.App;

  constructor(
    private readonly configService: ConfigService,
    private readonly drizzleService: DrizzleService,
  ) {}

  onModuleInit() {
    this.initializeFirebase();
  }

  /**
   * Initialize Firebase Admin SDK if not already initialized.
   * Uses environment variables for credentials.
   */
  private initializeFirebase(): void {
    const existingApps = admin.apps;
    if (existingApps && existingApps.length > 0) {
      this.app = existingApps[0]!;
      this.logger.log('Reusing existing Firebase Admin app');
      return;
    }

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');

    if (!projectId || !privateKey || !clientEmail) {
      this.logger.warn('Firebase credentials not configured. Push notifications will be disabled.');
      return;
    }

    // Skip initialization if using placeholder credentials (dev environment)
    if (
      projectId === 'placeholder' ||
      privateKey === 'placeholder' ||
      clientEmail?.includes('placeholder') ||
      privateKey.startsWith('<') ||
      projectId.startsWith('<') ||
      !privateKey.includes('-----BEGIN')
    ) {
      this.logger.warn(
        'Firebase credentials are placeholders. Push notifications will be disabled.',
      );
      return;
    }

    try {
      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          privateKey: privateKey.replace(/\\n/g, '\n'),
          clientEmail,
        }),
      });

      this.logger.log(`Firebase Admin initialized for project: ${projectId}`);
    } catch (error) {
      this.logger.error(
        `Failed to initialize Firebase: ${error.message}. Push notifications disabled.`,
      );
    }
  }

  /**
   * Send a batch of FCM messages. Handles chunking for the 500-token limit,
   * stale token cleanup, and returns per-message results.
   *
   * Only failed tokens are surfaced for retry — successful ones are not retried.
   *
   * @param messages Array of FcmMessage to send
   * @returns FcmBatchResult with per-message success/failure details
   */
  async sendBatch(messages: FcmMessage[]): Promise<FcmBatchResult> {
    if (messages.length === 0) {
      return { total: 0, successCount: 0, failureCount: 0, results: [] };
    }

    const allResults: FcmSendResult[] = [];

    // Chunk messages into groups of FCM_BATCH_LIMIT
    for (let i = 0; i < messages.length; i += FCM_BATCH_LIMIT) {
      const chunk = messages.slice(i, i + FCM_BATCH_LIMIT);
      const chunkResults = await this.sendChunk(chunk);
      allResults.push(...chunkResults);
    }

    // Deactivate stale tokens in the background
    const staleTokens = allResults
      .filter((r) => r.errorCode === STALE_TOKEN_ERROR)
      .map((r) => r.token);

    if (staleTokens.length > 0) {
      this.deactivateStaleTokens(staleTokens).catch((err) => {
        this.logger.error('Failed to deactivate stale tokens', err);
      });
    }

    const successCount = allResults.filter((r) => r.success).length;

    return {
      total: allResults.length,
      successCount,
      failureCount: allResults.length - successCount,
      results: allResults,
    };
  }

  /**
   * Send a single chunk of messages (up to 500) via messaging().sendEach().
   */
  private async sendChunk(messages: FcmMessage[]): Promise<FcmSendResult[]> {
    const messaging = this.app.messaging();

    const fcmMessages: admin.messaging.Message[] = messages.map((msg) => ({
      token: msg.token,
      notification: msg.notification,
      data: msg.data,
    }));

    try {
      const response = await messaging.sendEach(fcmMessages);

      return response.responses.map((res, idx) => {
        const token = messages[idx].token;
        if (res.success) {
          return {
            token,
            success: true,
            messageId: res.messageId,
          };
        }

        const errorCode = res.error?.code;
        const errorMessage = res.error?.message || 'Unknown error';

        return {
          token,
          success: false,
          error: errorMessage,
          errorCode,
        };
      });
    } catch (error) {
      // If the entire call fails, mark all messages in this chunk as failed
      this.logger.error(`FCM sendEach failed for chunk of ${messages.length} messages`, error);
      return messages.map((msg) => ({
        token: msg.token,
        success: false,
        error: error instanceof Error ? error.message : 'FCM sendEach call failed',
        errorCode: 'messaging/internal-error',
      }));
    }
  }

  /**
   * Deactivate device tokens that are no longer registered with FCM.
   * Sets is_active = false for the given tokens.
   */
  async deactivateStaleTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;

    const db = this.drizzleService.db;

    for (const token of tokens) {
      await db
        .update(deviceToken)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(deviceToken.fcmToken, token));
    }

    this.logger.log(`Deactivated ${tokens.length} stale FCM token(s)`);
  }
}
