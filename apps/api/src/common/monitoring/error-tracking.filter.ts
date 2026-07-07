import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  requestId: string;
  timestamp: string;
  path: string;
}

/**
 * Global exception filter that provides:
 * - Structured error logging with full context (request ID, user, tenant)
 * - Consistent error response shape for all HTTP errors
 * - Stack trace logging for 5xx errors in production
 * - Error classification for monitoring/alerting
 */
@Catch()
export class ErrorTrackingFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorTracking');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const requestId = (request as any).requestId || request.headers['x-request-id'] || 'unknown';
    const userId = (request as any).user?.sub || 'anonymous';
    const tenantId = (request as any).user?.tenant_id || null;

    let statusCode: number;
    let message: string | string[];
    let error: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const responseBody = exception.getResponse();
      if (typeof responseBody === 'string') {
        message = responseBody;
        error = exception.name;
      } else {
        const body = responseBody as Record<string, any>;
        message = body.message || exception.message;
        error = body.error || exception.name;
      }
    } else if (exception instanceof Error) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'InternalServerError';
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'UnknownError';
    }

    // Structured error log
    const errorLog = {
      requestId,
      method: request.method,
      url: request.url,
      statusCode,
      error,
      message: Array.isArray(message) ? message.join('; ') : message,
      userId,
      tenantId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      timestamp: new Date().toISOString(),
    };

    if (statusCode >= 500) {
      // 5xx errors: log with stack trace for investigation
      this.logger.error(
        {
          ...errorLog,
          stack: exception instanceof Error ? exception.stack : undefined,
        },
        exception instanceof Error ? exception.stack : 'Unknown error',
      );
    } else if (statusCode >= 400) {
      // 4xx errors: log as warning (client errors)
      this.logger.warn(errorLog);
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      error,
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(errorResponse);
  }
}
