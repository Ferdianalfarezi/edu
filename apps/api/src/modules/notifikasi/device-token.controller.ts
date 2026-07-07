import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { DeviceTokenService } from './device-token.service';
import { RegisterDeviceTokenDto } from './dto';

/**
 * Device Token Controller
 *
 * Endpoints for registering and deactivating FCM push notification tokens.
 * Accessible by any authenticated user (guru and orang_tua use the mobile app).
 *
 * Requirements: 6.1
 */
@Controller('device-tokens')
@UseGuards(JwtAuthGuard)
export class DeviceTokenController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  /**
   * POST /device-tokens
   * Register a new FCM token. If the token already exists for this user, upsert it.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(@CurrentUser('id') userId: string, @Body() dto: RegisterDeviceTokenDto) {
    return this.deviceTokenService.registerToken(userId, dto.fcm_token, dto.platform);
  }

  /**
   * DELETE /device-tokens/:tokenId
   * Deactivate a device token on logout (set is_active = false).
   */
  @Delete(':tokenId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(
    @CurrentUser('id') userId: string,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ): Promise<void> {
    await this.deviceTokenService.deactivateToken(tokenId, userId);
  }
}
