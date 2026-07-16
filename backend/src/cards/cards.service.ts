import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Card } from './card.entity';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { TenantAccessService } from '../common/tenant/tenant-access.service';
import { runInTenantContext } from '../common/tenant/tenant-transaction.util';
import { BoardEventsService } from '../realtime/board-events.service';
import { filterVisible, isSyncDeleted } from '../common/sync-visibility';
import { PositionService } from '../common/ordering/position.service';

@Injectable()
export class CardsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantAccess: TenantAccessService,
    private readonly boardEvents: BoardEventsService,
    private readonly positions: PositionService,
  ) {}

  async create(
    listId: string,
    orgId: string,
    dto: CreateCardDto,
  ): Promise<Card> {
    // assertListInOrg loads the list's board, giving us the boardId to route on.
    const list = await this.tenantAccess.assertListInOrg(listId, orgId);
    // `cards` has RLS: the insert (and last-key lookup) must run with the tenant
    // set on the same transaction.
    const card = await runInTenantContext(this.dataSource, orgId, async (m) => {
      const positionIdx = await this.resolvePosition(m, listId, dto.positionIdx);
      return m.save(Card, m.create(Card, { ...dto, listId, positionIdx }));
    });
    // Broadcast after commit, fire-and-forget: the write is authoritative and
    // emit() is best-effort, so we don't block the response on Redis latency.
    void this.boardEvents.emit('card.created', list.boardId, {
      cardId: card.id,
      listId: card.listId,
      positionIdx: card.positionIdx,
    });
    return card;
  }

  async findAll(listId: string, orgId: string): Promise<Card[]> {
    await this.tenantAccess.assertListInOrg(listId, orgId);
    const cards = await runInTenantContext(this.dataSource, orgId, (m) =>
      m.find(Card, { where: { listId } }),
    );
    // Hide records a mobile client has soft-deleted via CRDT sync.
    return filterVisible(cards);
  }

  async findOne(id: string, orgId: string): Promise<Card> {
    const card = await this.tenantAccess.assertCardInOrg(id, orgId);
    if (isSyncDeleted(card)) {
      throw new NotFoundException('Card not found');
    }
    return card;
  }

  async update(id: string, orgId: string, dto: UpdateCardDto): Promise<Card> {
    const card = await this.tenantAccess.assertCardInOrg(id, orgId);
    if (dto.positionIdx !== undefined) this.positions.assertValid(dto.positionIdx);
    const fromListId = card.listId;
    Object.assign(card, dto);
    const saved = await runInTenantContext(this.dataSource, orgId, (m) =>
      m.save(Card, card),
    );

    // A change of list or position is a "move"; anything else is a plain update.
    const moved =
      saved.listId !== fromListId ||
      (dto.positionIdx !== undefined && dto.positionIdx !== null);
    void this.boardEvents.emit(
      moved ? 'card.moved' : 'card.updated',
      card.list.boardId,
      {
        cardId: saved.id,
        listId: saved.listId,
        positionIdx: saved.positionIdx,
      },
    );
    return saved;
  }

  /**
   * A validated key when the client supplied one, else a fresh key appended
   * after the list's current last card. Runs on the caller's tenant-scoped
   * manager so the RLS-filtered read is correct.
   */
  private async resolvePosition(
    manager: EntityManager,
    listId: string,
    provided?: string,
  ): Promise<string> {
    if (provided !== undefined) {
      this.positions.assertValid(provided);
      return provided;
    }
    const last = await manager.findOne(Card, {
      where: { listId },
      order: { positionIdx: 'DESC' },
    });
    return this.positions.keyForAppend(last ? last.positionIdx : null);
  }

  async remove(id: string, orgId: string): Promise<void> {
    const card = await this.tenantAccess.assertCardInOrg(id, orgId);
    const boardId = card.list.boardId;
    const listId = card.listId;
    await runInTenantContext(this.dataSource, orgId, (m) => m.remove(Card, card));
    void this.boardEvents.emit('card.deleted', boardId, {
      cardId: id,
      listId,
    });
  }
}
