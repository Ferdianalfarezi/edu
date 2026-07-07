import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { deviceToken } from '@/drizzle/schema/notifikasi';

@Injectable()
export class DeviceTokenService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  /**
   * Register (upsert) a device token for a user.
   * If the fcm_token already exists for this user, update platform and reactivate.
   * If it exists for another user, reassign to the current user.
   *
   * Requirements: 6.1
   */
  async registerToken(
    userId: string,
    fcmToken: string,
    platform: 'android' | 'ios',
  ): Promise<{ id: string; fcm_token: string; platform: string; is_active: boolean }> {
    // Check if this fcm_token already exists (regardless of user)
    const existing = await this.db
      .select({
        id: deviceToken.id,
        userId: deviceToken.userId,
        platform: deviceToken.platform,
        isActive: deviceToken.isActive,
      })
      .from(deviceToken)
      .where(eq(deviceToken.fcmToken, fcmToken))
      .limit(1);

    if (existing.length > 0) {
      const record = existing[0];
      // Update: reassign to current user, set platform, reactivate
      const updated = await this.db
        .update(deviceToken)
        .set({
          userId,
          platform,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(deviceToken.id, record.id))
        .returning({
          id: deviceToken.id,
          fcmToken: deviceToken.fcmToken,
          platform: deviceToken.platform,
          isActive: deviceToken.isActive,
        });

      return {
        id: updated[0].id,
        fcm_token: updated[0].fcmToken,
        platform: updated[0].platform!,
        is_active: updated[0].isActive,
      };
    }

    // Insert new token
    const inserted = await this.db
      .insert(deviceToken)
      .values({
        userId,
        fcmToken,
        platform,
        isActive: true,
      })
      .returning({
        id: deviceToken.id,
        fcmToken: deviceToken.fcmToken,
        platform: deviceToken.platform,
        isActive: deviceToken.isActive,
      });

    return {
      id: inserted[0].id,
      fcm_token: inserted[0].fcmToken,
      platform: inserted[0].platform!,
      is_active: inserted[0].isActive,
    };
  }

  /**
   * Deactivate a device token (set is_active = false).
   * Used on logout.
   *
   * Requirements: 6.1
   */
  async deactivateToken(tokenId: string, userId: string): Promise<void> {
    const result = await this.db
      .update(deviceToken)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(and(eq(deviceToken.id, tokenId), eq(deviceToken.userId, userId)))
      .returning({ id: deviceToken.id });

    if (result.length === 0) {
      throw new NotFoundException('Device token tidak ditemukan');
    }
  }
}
