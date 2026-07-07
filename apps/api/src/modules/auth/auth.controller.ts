import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService, LoginResponse } from './auth.service';
import {
  LoginDto,
  RefreshDto,
  ResetPasswordRequestDto,
  ResetPasswordConfirmDto,
  ChangePasswordDto,
} from './dto';
import { RequestUser } from './interfaces';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   * Branches on platform and credential type:
   * - Staff (email+password) → JWT with role-based TTL
   * - Parent (phone only) → JWT with 1 year TTL + cross-tenant tenants[]
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto);
  }

  /**
   * POST /auth/refresh
   * Validates the refresh token, blacklists the old one, and issues a new pair.
   * Does NOT require an access token (the refresh token itself is the credential).
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto): Promise<{ access_token: string; refresh_token: string }> {
    return this.authService.refresh(dto);
  }

  /**
   * POST /auth/logout
   * Blacklists the current access token and optional refresh token.
   * Requires a valid access token.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() currentUser: RequestUser,
    @Body('refresh_token') refreshToken?: string,
  ): Promise<{ message: string }> {
    await this.authService.logout(currentUser, refreshToken);
    return { message: 'Berhasil logout' };
  }

  /**
   * POST /auth/reset-password/request
   * Accepts an email, generates a reset token, and enqueues an email job.
   * Anti-enumeration: always returns success regardless of email existence.
   */
  @Post('reset-password/request')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() dto: ResetPasswordRequestDto): Promise<{ message: string }> {
    return this.authService.requestPasswordReset(dto);
  }

  /**
   * POST /auth/reset-password/confirm
   * Validates the reset token, sets the new password, and invalidates all existing tokens.
   */
  @Post('reset-password/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(@Body() dto: ResetPasswordConfirmDto): Promise<{ message: string }> {
    return this.authService.confirmPasswordReset(dto);
  }

  /**
   * POST /auth/change-password
   * Authenticated endpoint: requires old password, sets new password,
   * invalidates all other sessions.
   */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() currentUser: RequestUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.changePassword(currentUser, dto);
  }
}
