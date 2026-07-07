import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload, RequestUser } from '../interfaces';

/**
 * Passport JWT strategy that extracts and validates JWT tokens.
 * Transforms the JWT payload into a RequestUser object attached to the request.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Called by Passport after token signature + expiration are verified.
   * Extracts the fields we need and returns the user object for req.user.
   */
  validate(payload: JwtPayload): RequestUser {
    return {
      id: payload.sub,
      role: payload.role,
      tenant_id: payload.tenant_id,
      tenants: payload.tenants,
      platform: payload.platform,
      jti: payload.jti,
    };
  }
}
