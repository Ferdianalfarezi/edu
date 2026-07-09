import { Request } from 'express';

/**
 * Extended Express Request with custom properties attached by middleware and guards.
 */
export interface AuthenticatedRequest extends Request {
  requestId?: string;
  user?: {
    sub: string;
    tenant_id: string;
    role: string;
    [key: string]: unknown;
  };
}
