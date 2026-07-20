import {
  Controller,
  Get,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { HealthService } from './health.service';
import { MetricsService } from './metrics.service';
import { HealthReport } from './health.types';
import { Public } from '../auth/public.decorator';
import { isMetricsRequestAuthorized } from './metrics-auth.util';

/**
 * Diagnostics endpoints:
 *   - `GET /health`          structured multi-database health (503 when degraded)
 *   - `GET /health/metrics`  Prometheus exposition for scraping (ACL via METRICS_SECRET)
 *
 * `/health` stays public for load balancers. Metrics require `METRICS_SECRET`
 * (Bearer or `X-Metrics-Secret`) in production — see `isMetricsRequestAuthorized`.
 * Throttle skipped so orchestrator probes / Prometheus scrapes are not rate-limited.
 */
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly metrics: MetricsService,
  ) {}

  @Get()
  async check(): Promise<HealthReport> {
    const report = await this.health.check();
    // 503 so orchestrators/load balancers treat a degraded node as unhealthy,
    // while still returning the full per-dependency breakdown in the body.
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }

  @Get('metrics')
  async prometheus(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (!isMetricsRequestAuthorized(req)) {
      // Manual @Res() mode — set status directly (exception filter bypassed).
      res.status(401).json({
        statusCode: 401,
        message:
          'Metrics scrape unauthorized — set METRICS_SECRET and send Bearer or X-Metrics-Secret',
        error: 'Unauthorized',
      });
      return;
    }
    res.setHeader('Content-Type', this.metrics.contentType());
    res.send(await this.metrics.metrics());
  }
}
