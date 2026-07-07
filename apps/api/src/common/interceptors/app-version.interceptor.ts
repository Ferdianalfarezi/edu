import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { Response } from 'express';

/**
 * Injects X-Minimum-App-Version header on every API response.
 * Per ADR-004: Mobile app checks this header to determine if a forced update is required.
 *
 * The minimum version is configured via MINIMUM_APP_VERSION env var.
 * Defaults to '1.0.0' if not set.
 */
@Injectable()
export class AppVersionInterceptor implements NestInterceptor {
  private readonly minimumAppVersion: string;

  constructor(private readonly configService: ConfigService) {
    this.minimumAppVersion = this.configService.get<string>('MINIMUM_APP_VERSION', '1.0.0');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('X-Minimum-App-Version', this.minimumAppVersion);
    return next.handle();
  }
}
