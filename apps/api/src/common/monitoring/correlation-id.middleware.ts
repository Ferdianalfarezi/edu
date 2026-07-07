import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { MONITORING_CONFIG } from './monitoring.config';

/**
 * Middleware that assigns a correlation ID (X-Request-ID) to each request.
 * If the client provides one, it is reused; otherwise a new UUID is generated.
 * The correlation ID is propagated in the response headers for tracing.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const headerName = MONITORING_CONFIG.requestTracking.headerName;
    const existing = req.headers[headerName.toLowerCase()] as string | undefined;

    const requestId = existing || randomUUID();

    // Attach to request for downstream use
    (req as any).requestId = requestId;
    req.headers[headerName.toLowerCase()] = requestId;

    // Propagate in response
    res.setHeader(headerName, requestId);

    next();
  }
}
