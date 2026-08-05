import {
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Role } from '@edu/shared';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { user } from '@/drizzle/schema/user';
import { RedisService } from '../../modules/redis/redis.service';
import { RequestUser } from '../../modules/auth/interfaces';

/**
 * JWT Auth Guard that extends Passport's AuthGuard with additional
 * Redis token blacklist checking, tokens_invalidated_at validation, and
 * single-device session (sid) validation.
 *
 * Flow:
 * 1. Passport validates JWT signature + expiration
 *    - TokenExpiredError → 401 TOKEN_EXPIRED (Req 11.4)
 * 2. JwtStrategy.validate() extracts RequestUser
 * 3. This guard checks the token's JTI against Redis blacklist
 * 4. This guard checks if the user's tokens were globally invalidated after token issuance
 * 5. For non-orang_tua roles: validate claim `sid` vs Session_Store (Req 12.3)
 *    - Redis down → 503 SERVICE_UNAVAILABLE, fail-closed (Req 12.7)
 *    - sid mismatch or missing → 401 SESSION_INVALIDATED (Req 12.5)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly redisService: RedisService,
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
  ) {
    super();
  }

  /**
   * Translate Passport-level errors into typed error codes.
   * Called by AuthGuard after strategy execution.
   */
  handleRequest<TUser = RequestUser>(err: any, user: TUser, info: any): TUser {
    // Req 11.4: expired access token → structured 401 with TOKEN_EXPIRED code
    if (info?.name === 'TokenExpiredError') {
      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED',
        message: 'Token akses kedaluwarsa. Silakan perbarui sesi Anda.',
      });
    }
    if (err || !user) {
      throw err || new UnauthorizedException('Unauthorized');
    }
    return user;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First, let Passport validate the JWT (signature + expiration)
    const isValid = await (super.canActivate(context) as Promise<boolean>);
    if (!isValid) {
      return false;
    }

    // Then check the token blacklist in Redis
    const request = context.switchToHttp().getRequest();
    const requestUser = request.user as RequestUser;

    if (!requestUser || !requestUser.jti) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const isBlacklisted = await this.redisService.isTokenBlacklisted(requestUser.jti);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Check if user's tokens were globally invalidated (password change, deactivation, etc.)
    // We extract `iat` from the raw JWT payload in the request
    const rawToken = this.extractTokenFromRequest(request);
    if (rawToken) {
      // Decode payload without verification (already verified by Passport)
      const payloadBase64 = rawToken.split('.')[1];
      if (payloadBase64) {
        const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
        const tokenIssuedAt = new Date(payload.iat * 1000);

        // Cache the tokens_invalidated_at check in Redis (TTL 60s) to avoid DB hit on every request
        const cacheKey = `user_invalidated:${requestUser.id}`;
        let tokensInvalidatedAt: Date | null = null;

        const cached = await this.redisService.get(cacheKey);
        if (cached !== null) {
          tokensInvalidatedAt = cached === '' ? null : new Date(cached);
        } else {
          const users = await this.db
            .select({ tokensInvalidatedAt: user.tokensInvalidatedAt })
            .from(user)
            .where(eq(user.id, requestUser.id))
            .limit(1);

          const foundUser = users[0];
          tokensInvalidatedAt = foundUser?.tokensInvalidatedAt ?? null;

          // Cache for 60 seconds — short enough to honor invalidation quickly
          await this.redisService.set(
            cacheKey,
            tokensInvalidatedAt ? tokensInvalidatedAt.toISOString() : '',
            60,
          );
        }

        if (tokensInvalidatedAt && tokenIssuedAt < tokensInvalidatedAt) {
          throw new UnauthorizedException('Semua sesi telah di-invalidasi, silakan login ulang');
        }

        // Req 12.3, 12.5, 12.7: validate sid (session_id) vs Session_Store for non-orang_tua roles
        if (requestUser.role !== Role.ORANG_TUA && payload.sid) {
          let storedSessionId: string | null;
          try {
            storedSessionId = await this.redisService.get(`session:${requestUser.id}`);
          } catch {
            // Req 12.7: Redis is unreachable → fail-closed for staff roles
            throw new HttpException(
              { code: 'SERVICE_UNAVAILABLE', message: 'Layanan sementara tidak tersedia' },
              503,
            );
          }

          if (!storedSessionId || storedSessionId !== payload.sid) {
            throw new UnauthorizedException({
              code: 'SESSION_INVALIDATED',
              message: 'Sesi tidak valid karena login dari perangkat lain.',
            });
          }
        }
      }
    }

    return true;
  }

  private extractTokenFromRequest(request: {
    headers?: { authorization?: string };
  }): string | null {
    const authHeader = request.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.slice(7);
  }
}
