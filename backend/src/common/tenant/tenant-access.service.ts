import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Board } from '../../boards/board.entity';
import { List } from '../../lists/list.entity';
import { Card } from '../../cards/card.entity';
import { runInTenantContext } from './tenant-transaction.util';

/**
 * Resolves the org-ownership chain for tenant-scoped resources that don't
 * carry org_id themselves (lists, cards, ...) by walking up to their board
 * and checking it against the active org. Board lookups go through
 * runInTenantContext so they're also covered by the boards RLS policy —
 * the app connects as a non-owner role, so a plain query against boards
 * would otherwise see zero rows.
 */
@Injectable()
export class TenantAccessService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(List) private readonly listsRepo: Repository<List>,
    @InjectRepository(Card) private readonly cardsRepo: Repository<Card>,
  ) {}

  async assertBoardInOrg(boardId: string, orgId: string): Promise<Board> {
    return runInTenantContext(this.dataSource, orgId, async (manager) => {
      const board = await manager.findOne(Board, { where: { id: boardId, orgId } });
      if (!board) {
        throw new NotFoundException('Board not found');
      }
      return board;
    });
  }

  async assertListInOrg(listId: string, orgId: string): Promise<List> {
    const list = await this.listsRepo.findOne({ where: { id: listId } });
    if (!list) {
      throw new NotFoundException('List not found');
    }
    await this.assertBoardInOrg(list.boardId, orgId);
    return list;
  }

  async assertCardInOrg(cardId: string, orgId: string): Promise<Card> {
    const card = await this.cardsRepo.findOne({ where: { id: cardId } });
    if (!card) {
      throw new NotFoundException('Card not found');
    }
    await this.assertListInOrg(card.listId, orgId);
    return card;
  }
}
