import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';

/**
 * Health endpoints — no authentication required.
 * These sit outside the /api/v1 prefix for infrastructure tooling.
 *
 * Railway and other PaaS providers use /health for readiness probes.
 */
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Full readiness check — verifies all dependencies (DB, Redis, storage).
   * Returns 200 if healthy/degraded, 503 if unhealthy.
   *
   * Railway uses this to determine if the service is ready to receive traffic.
   * Degraded (partial failure) still returns 200 to avoid unnecessary restarts.
   */
  @Get('health')
  async getHealth(@Res() res: Response): Promise<void> {
    const health = await this.healthService.getHealth();

    // 200 for healthy/degraded — partial failures shouldn't trigger restarts
    // 503 only when ALL dependencies are down (unhealthy)
    const statusCode =
      health.status === 'unhealthy' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK;

    res.status(statusCode).json(health);
  }

  /**
   * Lightweight liveness probe — confirms the process is alive.
   * Always returns 200 unless the process is completely stuck.
   */
  @Get('health/live')
  @HttpCode(HttpStatus.OK)
  getLiveness(): { status: 'ok'; timestamp: string } {
    return this.healthService.getLiveness();
  }
}
