import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Response } from 'express';
import { AuthenticatedRequest } from '../interfaces/request.interface';

/**
 * Logging interceptor that records structured request/response data with timing.
 * Outputs JSON-structured logs for production log aggregation.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<AuthenticatedRequest>();
    const startTime = Date.now();

    const { method, url, ip } = request;
    const requestId = request.requestId || request.headers['x-request-id'] || 'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';
    const userId = request.user?.sub || 'anonymous';
    const tenantId = request.user?.tenant_id || null;

    return next.handle().pipe(
      tap({
        next: () => {
          const response = ctx.getResponse<Response>();
          const durationMs = Date.now() - startTime;

          this.logger.log({
            message: `${method} ${url} ${response.statusCode}`,
            requestId,
            method,
            url,
            statusCode: response.statusCode,
            durationMs,
            ip,
            userAgent,
            userId,
            tenantId,
          });
        },
        error: (error) => {
          const durationMs = Date.now() - startTime;
          const statusCode = error.status || error.statusCode || 500;

          this.logger.error({
            message: `${method} ${url} ${statusCode}`,
            requestId,
            method,
            url,
            statusCode,
            durationMs,
            ip,
            userAgent,
            userId,
            tenantId,
            error: {
              name: error.name,
              message: error.message,
            },
          });
        },
      }),
    );
  }
}
