import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../organizations/organization.entity';
import { User } from '../users/user.entity';
import { Board } from '../boards/board.entity';
import { BoardMember } from '../board-members/board-member.entity';
import { List } from '../lists/list.entity';
import { Card } from '../cards/card.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      User,
      Board,
      BoardMember,
      List,
      Card,
    ]),
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
