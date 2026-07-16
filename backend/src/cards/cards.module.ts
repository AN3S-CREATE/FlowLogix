import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card } from './card.entity';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';
import { TenantModule } from '../common/tenant/tenant.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OrderingModule } from '../common/ordering/ordering.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Card]),
    TenantModule,
    RealtimeModule,
    OrderingModule,
  ],
  controllers: [CardsController],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule {}
