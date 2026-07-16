import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { List } from '../../lists/list.entity';
import { Card } from '../../cards/card.entity';
import { PositionService } from './position.service';
import { PositionRebalanceService } from './position-rebalance.service';

/**
 * Fractional-ordering: the shared {@link PositionService} (key computation) and
 * the {@link PositionRebalanceService} precision-bloat cron. Exports only
 * `PositionService` so Lists/Cards compute keys through one configured indexer.
 */
@Module({
  imports: [TypeOrmModule.forFeature([List, Card])],
  providers: [PositionService, PositionRebalanceService],
  exports: [PositionService],
})
export class OrderingModule {}
