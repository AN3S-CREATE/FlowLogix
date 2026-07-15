import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MetricsService } from './metrics.service';
import { MongoProbe, PostgresProbe, RedisProbe } from './health.probes';

/**
 * Multi-database health + Prometheus metrics. Exports `MetricsService` so the
 * realtime gateway can push websocket-pool and active-board-user gauges without
 * this module depending on the realtime layer (keeps the dependency one-way).
 */
@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    MetricsService,
    PostgresProbe,
    RedisProbe,
    MongoProbe,
  ],
  exports: [MetricsService],
})
export class HealthModule {}
