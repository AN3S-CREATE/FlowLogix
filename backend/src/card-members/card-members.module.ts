import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardMember } from './card-member.entity';
import { CardMembersService } from './card-members.service';
import { CardMembersController } from './card-members.controller';
import { TenantModule } from '../common/tenant/tenant.module';

@Module({
  imports: [TypeOrmModule.forFeature([CardMember]), TenantModule],
  controllers: [CardMembersController],
  providers: [CardMembersService],
  exports: [CardMembersService],
})
export class CardMembersModule {}
