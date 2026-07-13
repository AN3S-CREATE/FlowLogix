import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Board } from '../../boards/board.entity';
import { List } from '../../lists/list.entity';
import { Card } from '../../cards/card.entity';
import { TenantAccessService } from './tenant-access.service';

@Module({
  imports: [TypeOrmModule.forFeature([Board, List, Card])],
  providers: [TenantAccessService],
  exports: [TenantAccessService],
})
export class TenantModule {}
