import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoardMember } from './board-member.entity';
import { BoardMembersService } from './board-members.service';
import { BoardMembersController } from './board-members.controller';
import { TenantModule } from '../common/tenant/tenant.module';

@Module({
  imports: [TypeOrmModule.forFeature([BoardMember]), TenantModule],
  controllers: [BoardMembersController],
  providers: [BoardMembersService],
  exports: [BoardMembersService],
})
export class BoardMembersModule {}
