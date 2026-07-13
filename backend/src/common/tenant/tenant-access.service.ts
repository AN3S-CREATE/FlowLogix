import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Board } from '../../boards/board.entity';
import { List } from '../../lists/list.entity';
import { Card } from '../../cards/card.entity';
import { User } from '../../users/user.entity';
import { runInTenantContext } from './tenant-transaction.util';

/**
 * Resolves the org-ownership chain for tenant-scoped resources that don't
 * carry org_id themselves (lists, cards, ...) by walking up to their board
 * and checking it against the active org in a single query, so a
 * wrong-org resource and a nonexistent one both surface as the same
 * NotFoundException rather than leaking which case applies. Lookups that
 * touch boards go through runInTenantContext so they're also covered by
 * the boards RLS policy — the app connects as a non-owner role, so a
 * plain query against boards would otherwise see zero rows.
 */
@Injectable()
export class TenantAccessService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  async assertBoardInOrg(boardId: string, orgId: string): Promise<Board> {
    return runInTenantContext(this.dataSource, orgId, async (manager) => {
      const board = await manager.findOne(Board, {
        where: { id: boardId, orgId },
      });
      if (!board) {
        throw new NotFoundException('Board not found');
      }
      return board;
    });
  }

  async assertListInOrg(listId: string, orgId: string): Promise<List> {
    return runInTenantContext(this.dataSource, orgId, async (manager) => {
      const list = await manager.findOne(List, {
        where: { id: listId, board: { orgId } },
        relations: { board: true },
      });
      if (!list) {
        throw new NotFoundException('List not found');
      }
      return list;
    });
  }

  async assertCardInOrg(cardId: string, orgId: string): Promise<Card> {
    return runInTenantContext(this.dataSource, orgId, async (manager) => {
      const card = await manager.findOne(Card, {
        where: { id: cardId, list: { board: { orgId } } },
        relations: { list: { board: true } },
      });
      if (!card) {
        throw new NotFoundException('Card not found');
      }
      return card;
    });
  }

  async assertUserInOrg(userId: string, orgId: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id: userId, orgId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
