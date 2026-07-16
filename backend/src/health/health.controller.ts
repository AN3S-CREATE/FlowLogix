import {
  Controller,
  Get,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';
import { MetricsService } from './metrics.service';
import { HealthReport } from './health.types';
import { Public } from '../auth/public.decorator';

/**
 * Diagnostics endpoints:
 *   - `GET /health`          structured multi-database health (503 when degraded)
 *   - `GET /health/metrics`  Prometheus exposition for scraping
 *
 * Public: load balancers and Prometheus scrape these without a token.
 */
@Public()
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
  async prometheus(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.contentType());
    res.send(await this.metrics.metrics());
  }
}
