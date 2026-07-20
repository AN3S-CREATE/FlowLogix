import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Board } from '../boards/board.entity';
import { List } from '../lists/list.entity';
import { Card } from '../cards/card.entity';
import { OrderingModule } from '../common/ordering/ordering.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([Board, List, Card]), OrderingModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
