import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Card } from './card.entity';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { TenantAccessService } from '../common/tenant/tenant-access.service';
import { BoardEventsService } from '../realtime/board-events.service';

@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(Card)
    private readonly cardsRepo: Repository<Card>,
    private readonly tenantAccess: TenantAccessService,
    private readonly boardEvents: BoardEventsService,
  ) {}

  async create(
    listId: string,
    orgId: string,
    dto: CreateCardDto,
  ): Promise<Card> {
    // assertListInOrg loads the list's board, giving us the boardId to route on.
    const list = await this.tenantAccess.assertListInOrg(listId, orgId);
    const card = await this.cardsRepo.save(
      this.cardsRepo.create({ ...dto, listId }),
    );
    // Broadcast only after the write is committed (decoupled per .cursorrules §4).
    await this.boardEvents.emit('card.created', list.boardId, {
      cardId: card.id,
      listId: card.listId,
      positionIdx: card.positionIdx,
    });
    return card;
  }

  async findAll(listId: string, orgId: string): Promise<Card[]> {
    await this.tenantAccess.assertListInOrg(listId, orgId);
    return this.cardsRepo.find({ where: { listId } });
  }

  findOne(id: string, orgId: string): Promise<Card> {
    return this.tenantAccess.assertCardInOrg(id, orgId);
  }

  async update(id: string, orgId: string, dto: UpdateCardDto): Promise<Card> {
    const card = await this.tenantAccess.assertCardInOrg(id, orgId);
    const fromListId = card.listId;
    Object.assign(card, dto);
    const saved = await this.cardsRepo.save(card);

    // A change of list or position is a "move"; anything else is a plain update.
    const moved =
      saved.listId !== fromListId ||
      (dto.positionIdx !== undefined && dto.positionIdx !== null);
    await this.boardEvents.emit(
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

  async remove(id: string, orgId: string): Promise<void> {
    const card = await this.tenantAccess.assertCardInOrg(id, orgId);
    const boardId = card.list.boardId;
    const listId = card.listId;
    await this.cardsRepo.remove(card);
    await this.boardEvents.emit('card.deleted', boardId, {
      cardId: id,
      listId,
    });
  }
}
