import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisPubSubService } from './redis-pubsub.service';
import { BoardEventsService } from './board-events.service';
import { RealtimeGateway } from './realtime.gateway';
import { TenantModule } from '../common/tenant/tenant.module';
import { HealthModule } from '../health/health.module';

/**
 * Wires the real-time sync pipeline: the Redis Pub/Sub connections, the
 * service-layer capture point (`BoardEventsService`, exported so Cards/Lists
 * can publish), and the Socket.io gateway. `TenantModule` supplies the
 * ownership check the gateway runs when a socket joins a board.
 */
@Module({
  imports: [ConfigModule, TenantModule, HealthModule],
  providers: [RedisPubSubService, BoardEventsService, RealtimeGateway],
  exports: [BoardEventsService],
})
export class RealtimeModule {}
