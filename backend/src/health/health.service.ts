import { Injectable } from '@nestjs/common';
import { MongoProbe, PostgresProbe, RedisProbe } from './health.probes';
import { MetricsService } from './metrics.service';
import { HealthReport } from './health.types';

/**
 * Runs the Postgres / Redis / MongoDB probes in parallel, folds each result
 * into the Prometheus gauges, and returns a structured report. Overall status
 * is `ok` only when every dependency is up, else `degraded`.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly postgres: PostgresProbe,
    private readonly redis: RedisProbe,
    private readonly mongo: MongoProbe,
    private readonly metrics: MetricsService,
  ) {}

  async check(): Promise<HealthReport> {
    const checks = await Promise.all([
      this.postgres.check(),
      this.redis.check(),
      this.mongo.check(),
    ]);
    for (const result of checks) this.metrics.recordProbe(result);

    const status = checks.every((c) => c.status === 'up') ? 'ok' : 'degraded';
    return { status, timestamp: new Date().toISOString(), checks };
  }
}
