import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { List } from './list.entity';
import { ListsService } from './lists.service';
import { ListsController } from './lists.controller';
import { TenantModule } from '../common/tenant/tenant.module';

@Module({
  imports: [TypeOrmModule.forFeature([List]), TenantModule],
  controllers: [ListsController],
  providers: [ListsService],
  exports: [ListsService],
})
export class ListsModule {}
