import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Queue } from 'bull';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { user } from '@/drizzle/schema/user';
import { siswa } from '@/drizzle/schema/siswa';
import { tenant } from '@/drizzle/schema/tenant';
import { RedisService } from '@/modules/redis/redis.service';
import { QUEUE_NAMES } from '@/modules/queue';
import { Role } from '@edu/shared';
import { JwtPayload, RequestUser } from './interfaces';
import {
  LoginDto,
  RefreshDto,
  ResetPasswordRequestDto,
  ResetPasswordConfirmDto,
  ChangePasswordDto,
} from './dto';

/** Anti-enumeration: same message for all login failures */
const INVALID_CREDENTIALS_MSG = 'Email atau password salah';
const PHONE_NOT_REGISTERED_MSG = 'Nomor tidak terdaftar, hubungi admin sekolah';
const ACCOUNT_LOCKED_MSG = 'Akun terkunci. Silakan coba lagi dalam 15 menit';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const RESET_TOKEN_TTL_SECONDS = 30 * 60; // 30 minutes
const BCRYPT_SALT_ROUNDS = 10;

interface TenantInfo {
  id: string;
  nama: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  must_change_password: boolean;
  user: {
    id: string;
    name: string;
    role: Role;
    tenant_id: string | null;
    tenants?: TenantInfo[];
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const { email, password, phone, platform } = dto;

    // Branch: phone-only login for orang_tua
    if (phone && !email) {
      return this.loginParent(phone, platform);
    }

    // Branch: email+password login for staff
    if (email && password) {
      return this.loginStaff(email, password, platform);
    }

    throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);
  }

  // ─── Staff Login ──────────────────────────────────────────────

  private async loginStaff(
    email: string,
    password: string,
    platform: 'admin_panel' | 'mobile',
  ): Promise<LoginResponse> {
    // Find user by email (staff roles only, must be active)
    const users = await this.db
      .select()
      .from(user)
      .where(and(eq(user.email, email), eq(user.isActive, true)))
      .limit(1);

    const foundUser = users[0];

    // Anti-enumeration: if user doesn't exist, return same error
    if (!foundUser) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);
    }

    // Ensure user is not orang_tua (they use phone login)
    if (foundUser.role === Role.ORANG_TUA) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);
    }

    // Check account lockout
    if (this.isAccountLocked(foundUser)) {
      throw new UnauthorizedException(ACCOUNT_LOCKED_MSG);
    }

    // Validate password
    if (!foundUser.passwordHash) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);
    }

    const isPasswordValid = await bcrypt.compare(password, foundUser.passwordHash);

    if (!isPasswordValid) {
      await this.handleFailedLogin(foundUser.id, foundUser.failedLoginAttempts ?? 0);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);
    }

    // Successful login: reset failed attempts
    await this.resetFailedAttempts(foundUser.id);

    // Validate platform access
    this.validatePlatformAccess(foundUser.role as Role, platform);

    // Generate tokens
    const tokenPair = await this.generateTokenPair(
      {
        sub: foundUser.id,
        role: foundUser.role as Role,
        tenant_id: foundUser.tenantId,
        platform,
      },
      platform,
      foundUser.role as Role,
    );

    return {
      ...tokenPair,
      must_change_password: foundUser.mustChangePassword ?? false,
      user: {
        id: foundUser.id,
        name: foundUser.nama,
        role: foundUser.role as Role,
        tenant_id: foundUser.tenantId,
      },
    };
  }

  // ─── Parent Login ─────────────────────────────────────────────

  private async loginParent(
    phone: string,
    platform: 'admin_panel' | 'mobile',
  ): Promise<LoginResponse> {
    // Parents can only login on mobile
    if (platform === 'admin_panel') {
      throw new UnauthorizedException(PHONE_NOT_REGISTERED_MSG);
    }

    // Find parent user by phone (orang_tua role, active, tenant_id IS NULL per ADR-002)
    const users = await this.db
      .select()
      .from(user)
      .where(and(eq(user.phone, phone), eq(user.role, 'orang_tua'), eq(user.isActive, true)))
      .limit(1);

    const foundUser = users[0];

    // Anti-enumeration: same error message regardless of existence
    if (!foundUser) {
      throw new UnauthorizedException(PHONE_NOT_REGISTERED_MSG);
    }

    // Check account lockout (even for parent, in case of brute force)
    if (this.isAccountLocked(foundUser)) {
      throw new UnauthorizedException(ACCOUNT_LOCKED_MSG);
    }

    // Resolve tenants from active siswa records per ADR-002
    const tenants = await this.resolveParentTenants(foundUser.id);

    // If parent has no active children, still allow login but with empty tenants
    const tenantIds = tenants.map((t) => t.id);

    // Generate tokens with cross-tenant tenants[]
    const tokenPair = await this.generateTokenPair(
      {
        sub: foundUser.id,
        role: Role.ORANG_TUA,
        tenant_id: null,
        tenants: tenantIds,
        platform,
      },
      platform,
      Role.ORANG_TUA,
    );

    return {
      ...tokenPair,
      must_change_password: false,
      user: {
        id: foundUser.id,
        name: foundUser.nama,
        role: Role.ORANG_TUA,
        tenant_id: null,
        tenants,
      },
    };
  }

  // ─── Tenant Resolution ────────────────────────────────────────

  /**
   * Resolve accessible tenants for a parent user from their children's enrollment.
   * Per ADR-002: query siswa where orang_tua_id matches → get distinct tenant_ids.
   */
  async resolveParentTenants(parentUserId: string): Promise<TenantInfo[]> {
    const results = await this.db
      .selectDistinctOn([siswa.tenantId], {
        tenantId: siswa.tenantId,
        tenantNama: tenant.nama,
      })
      .from(siswa)
      .innerJoin(tenant, eq(siswa.tenantId, tenant.id))
      .where(and(eq(siswa.orangTuaId, parentUserId), eq(siswa.status, 'aktif')));

    return results.map((r) => ({ id: r.tenantId, nama: r.tenantNama }));
  }

  // ─── Token Refresh ─────────────────────────────────────────────

  /**
   * Validate refresh token, blacklist old token, issue new pair.
   */
  async refresh(dto: RefreshDto): Promise<{ access_token: string; refresh_token: string }> {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

    // Verify the refresh token signature and expiration
    let payload: JwtPayload & { type?: string };
    try {
      payload = this.jwtService.verify(dto.refresh_token, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException('Refresh token tidak valid atau sudah kadaluarsa');
    }

    // Ensure this is actually a refresh token
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token bukan refresh token');
    }

    // Check if the refresh token JTI is already blacklisted
    const isBlacklisted = await this.redisService.isTokenBlacklisted(payload.jti);
    if (isBlacklisted) {
      throw new UnauthorizedException('Refresh token sudah tidak berlaku');
    }

    // Check if user's tokens have been globally invalidated (password change, deactivation, etc.)
    const users = await this.db
      .select({ tokensInvalidatedAt: user.tokensInvalidatedAt, isActive: user.isActive })
      .from(user)
      .where(eq(user.id, payload.sub))
      .limit(1);

    const foundUser = users[0];
    if (!foundUser || !foundUser.isActive) {
      throw new UnauthorizedException('Akun tidak aktif');
    }

    // If tokens were globally invalidated after this token was issued, reject it
    if (foundUser.tokensInvalidatedAt) {
      const tokenIssuedAt = new Date(payload.iat * 1000);
      if (tokenIssuedAt < foundUser.tokensInvalidatedAt) {
        throw new UnauthorizedException('Semua sesi telah di-invalidasi, silakan login ulang');
      }
    }

    // Blacklist the old refresh token (TTL = remaining lifetime)
    const nowSeconds = Math.floor(Date.now() / 1000);
    const remainingTtl = payload.exp - nowSeconds;
    if (remainingTtl > 0) {
      await this.redisService.blacklistToken(payload.jti, remainingTtl);
    }

    // Generate a new token pair
    const newTokenPair = await this.generateTokenPair(
      {
        sub: payload.sub,
        role: payload.role,
        tenant_id: payload.tenant_id,
        tenants: payload.tenants,
        platform: payload.platform,
      },
      payload.platform,
      payload.role,
    );

    return newTokenPair;
  }

  // ─── Logout ───────────────────────────────────────────────────

  /**
   * Blacklist the current access token and its associated refresh token JTI.
   * Called with the access token's user context from the guard.
   */
  async logout(currentUser: RequestUser, refreshToken?: string): Promise<void> {
    // Blacklist the current access token
    // We don't have exp from RequestUser, so use a generous TTL (max possible: 365 days)
    // The Redis entry auto-expires, so over-estimating is safe
    const maxTtlSeconds = 365 * 24 * 60 * 60;
    await this.redisService.blacklistToken(currentUser.jti, maxTtlSeconds);

    // If refresh token is provided, decode and blacklist it too
    if (refreshToken) {
      try {
        const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
        const payload = this.jwtService.verify(refreshToken, { secret: refreshSecret });
        const nowSeconds = Math.floor(Date.now() / 1000);
        const remainingTtl = payload.exp - nowSeconds;
        if (remainingTtl > 0) {
          await this.redisService.blacklistToken(payload.jti, remainingTtl);
        }
      } catch {
        // If refresh token is invalid/expired, just ignore — the access token is already blacklisted
      }
    }
  }

  // ─── Invalidate All User Tokens ───────────────────────────────

  /**
   * Invalidate all tokens for a user by setting `tokens_invalidated_at`.
   * JwtAuthGuard checks this timestamp against token iat to reject old tokens.
   *
   * Use cases: password change, user deactivation, tenant disable.
   */
  async invalidateAllUserTokens(userId: string): Promise<void> {
    await this.db
      .update(user)
      .set({
        tokensInvalidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    // Invalidate the Redis cache so the JWT guard picks up the change immediately
    await this.redisService.del(`user_invalidated:${userId}`);
  }

  /**
   * Invalidate all tokens for all users in a tenant.
   * Use case: tenant (school) deactivation.
   */
  async invalidateAllTenantTokens(tenantId: string): Promise<void> {
    await this.db
      .update(user)
      .set({
        tokensInvalidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(user.tenantId, tenantId));
  }

  // ─── Password Reset Flow ──────────────────────────────────────

  /**
   * POST /auth/reset-password/request
   * Generates a reset token and enqueues an email job.
   * Anti-enumeration: always returns success even if the email doesn't exist.
   */
  async requestPasswordReset(dto: ResetPasswordRequestDto): Promise<{ message: string }> {
    const successMessage = 'Jika email terdaftar, link reset password telah dikirim';

    // Find user by email (must have a password — not orang_tua)
    const users = await this.db
      .select()
      .from(user)
      .where(and(eq(user.email, dto.email), eq(user.isActive, true)))
      .limit(1);

    const foundUser = users[0];

    // Anti-enumeration: return success even if user doesn't exist
    if (!foundUser || foundUser.role === Role.ORANG_TUA) {
      return { message: successMessage };
    }

    // Generate a cryptographically random token
    const rawToken = crypto.randomBytes(32).toString('hex');

    // Store the SHA-256 hash of the token in Redis (not the raw token)
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const redisKey = `reset_password:${tokenHash}`;

    await this.redisService.set(
      redisKey,
      JSON.stringify({ userId: foundUser.id, email: foundUser.email }),
      RESET_TOKEN_TTL_SECONDS,
    );

    // Build reset URL
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    // Enqueue email job
    await this.emailQueue.add('send-password-reset', {
      to: foundUser.email,
      name: foundUser.nama,
      resetUrl,
    });

    return { message: successMessage };
  }

  /**
   * POST /auth/reset-password/confirm
   * Validates the token, sets the new password, and invalidates all existing tokens.
   */
  async confirmPasswordReset(dto: ResetPasswordConfirmDto): Promise<{ message: string }> {
    // Hash the provided token to look up in Redis
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    const redisKey = `reset_password:${tokenHash}`;

    const stored = await this.redisService.get(redisKey);

    if (!stored) {
      throw new BadRequestException(
        'Token reset password tidak valid atau sudah kadaluarsa. Silakan ulangi proses reset.',
      );
    }

    const { userId } = JSON.parse(stored) as { userId: string; email: string };

    // Hash the new password
    const passwordHash = await bcrypt.hash(dto.new_password, BCRYPT_SALT_ROUNDS);

    // Update password and invalidate all tokens
    await this.db
      .update(user)
      .set({
        passwordHash,
        tokensInvalidatedAt: new Date(),
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    // Delete the used token from Redis (one-time use)
    await this.redisService.del(redisKey);

    // Enqueue confirmation email
    const users = await this.db
      .select({ email: user.email, nama: user.nama })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (users[0]?.email) {
      await this.emailQueue.add('send-password-changed-confirmation', {
        to: users[0].email,
        name: users[0].nama,
      });
    }

    return { message: 'Password berhasil diubah. Silakan login dengan password baru.' };
  }

  /**
   * POST /auth/change-password (authenticated)
   * Requires old password verification. Invalidates all other sessions.
   */
  async changePassword(
    currentUser: RequestUser,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    // Fetch the user record
    const users = await this.db.select().from(user).where(eq(user.id, currentUser.id)).limit(1);

    const foundUser = users[0];
    if (!foundUser || !foundUser.passwordHash) {
      throw new BadRequestException('Akun ini tidak mendukung perubahan password');
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(dto.old_password, foundUser.passwordHash);
    if (!isOldPasswordValid) {
      throw new BadRequestException('Password lama tidak benar');
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(dto.new_password, BCRYPT_SALT_ROUNDS);

    // Update password and invalidate all tokens
    await this.db
      .update(user)
      .set({
        passwordHash,
        tokensInvalidatedAt: new Date(),
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(user.id, currentUser.id));

    return { message: 'Password berhasil diubah. Sesi lain telah di-logout.' };
  }

  // ─── Token Generation ─────────────────────────────────────────

  private async generateTokenPair(
    payload: Omit<JwtPayload, 'jti' | 'iat' | 'exp'>,
    platform: 'admin_panel' | 'mobile',
    role: Role,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();

    const accessExpiration = this.getAccessTokenTTL(platform, role);
    const refreshExpiration = this.getRefreshTokenTTL(platform, role);

    const accessToken = this.jwtService.sign(
      { ...payload, jti: accessJti },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiration,
      },
    );

    const refreshToken = this.jwtService.sign(
      { ...payload, jti: refreshJti, type: 'refresh' },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiration,
      },
    );

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  /**
   * Determine access token TTL based on platform and role:
   * - admin_panel staff: 24h
   * - mobile guru: 90d
   * - mobile orang_tua: 365d
   */
  private getAccessTokenTTL(platform: 'admin_panel' | 'mobile', role: Role): string {
    if (platform === 'admin_panel') {
      return '24h';
    }
    if (role === Role.ORANG_TUA) {
      return '365d';
    }
    // mobile guru
    return '90d';
  }

  /**
   * Determine refresh token TTL based on platform and role:
   * - admin_panel staff: 7d
   * - mobile guru: 180d
   * - mobile orang_tua: 365d
   */
  private getRefreshTokenTTL(platform: 'admin_panel' | 'mobile', role: Role): string {
    if (platform === 'admin_panel') {
      return '7d';
    }
    if (role === Role.ORANG_TUA) {
      return '365d';
    }
    // mobile guru
    return '180d';
  }

  // ─── Account Lockout ──────────────────────────────────────────

  private isAccountLocked(foundUser: { lockedUntil: Date | null }): boolean {
    if (!foundUser.lockedUntil) {
      return false;
    }
    return new Date() < new Date(foundUser.lockedUntil);
  }

  private async handleFailedLogin(userId: string, currentAttempts: number): Promise<void> {
    const newAttempts = currentAttempts + 1;

    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      // Lock account for 15 minutes
      const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      await this.db
        .update(user)
        .set({
          failedLoginAttempts: newAttempts,
          lockedUntil: lockUntil,
          updatedAt: new Date(),
        })
        .where(eq(user.id, userId));
    } else {
      await this.db
        .update(user)
        .set({
          failedLoginAttempts: newAttempts,
          updatedAt: new Date(),
        })
        .where(eq(user.id, userId));
    }
  }

  private async resetFailedAttempts(userId: string): Promise<void> {
    await this.db
      .update(user)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));
  }

  // ─── Platform Validation ──────────────────────────────────────

  private validatePlatformAccess(role: Role, platform: 'admin_panel' | 'mobile'): void {
    // Guru can access both platforms
    if (role === Role.GURU) {
      return;
    }

    // Only guru and orang_tua can use mobile
    if (platform === 'mobile' && role !== Role.ORANG_TUA) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);
    }
  }
}
