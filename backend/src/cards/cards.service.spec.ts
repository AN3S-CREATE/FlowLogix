import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CardsService } from './cards.service';
import { PositionService } from '../common/ordering/position.service';
import { Card } from './card.entity';

type MutableCard = Card & { list: { boardId: string } };

function mockDataSource(manager: EntityManager): DataSource {
  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue(undefined),
    isTransactionActive: true,
    manager,
  };
  return {
    createQueryRunner: () => queryRunner,
  } as unknown as DataSource;
}

describe('CardsService.update', () => {
  const orgId = 'org-1';
  const boardId = 'board-1';
  const positions = new PositionService();

  function makeCard(
    overrides: Partial<MutableCard> & Pick<MutableCard, 'id' | 'listId'>,
  ): MutableCard {
    return {
      id: overrides.id,
      listId: overrides.listId,
      title: overrides.title ?? 'Card',
      description: null,
      positionIdx: overrides.positionIdx ?? 'a0',
      dueDate: null,
      isComplete: false,
      isArchived: false,
      customFields: {},
      syncClocks: {},
      nodeId: null,
      syncDeletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      list: { boardId },
      comments: [],
      members: [],
    } as unknown as MutableCard;
  }

  it('mints a fractional key between before/after neighbors and emits card.moved', async () => {
    const card = makeCard({ id: 'c-move', listId: 'list-a', positionIdx: 'V' });
    const before = makeCard({ id: 'c-before', listId: 'list-b', positionIdx: 'a' });
    const after = makeCard({ id: 'c-after', listId: 'list-b', positionIdx: 'c' });

    const manager = {
      findOne: jest.fn(async (_entity: unknown, opts: { where: { id: string } }) => {
        const id = opts.where.id;
        if (id === before.id) return before;
        if (id === after.id) return after;
        return null;
      }),
      save: jest.fn(async (_entity: unknown, row: Card) => row),
    } as unknown as EntityManager;

    const tenantAccess = {
      assertCardInOrg: jest.fn().mockResolvedValue({ ...card }),
      assertListInOrg: jest
        .fn()
        .mockResolvedValue({ id: 'list-b', boardId }),
    };
    const boardEvents = { emit: jest.fn() };

    const service = new CardsService(
      mockDataSource(manager),
      tenantAccess as never,
      boardEvents as never,
      positions,
    );

    const saved = await service.update(card.id, orgId, {
      listId: 'list-b',
      beforeCardId: before.id,
      afterCardId: after.id,
    });

    expect(saved.listId).toBe('list-b');
    expect(saved.positionIdx > before.positionIdx).toBe(true);
    expect(saved.positionIdx < after.positionIdx).toBe(true);
    expect(boardEvents.emit).toHaveBeenCalledWith(
      'card.moved',
      boardId,
      expect.objectContaining({
        cardId: card.id,
        listId: 'list-b',
        positionIdx: saved.positionIdx,
      }),
    );
  });

  it('rejects a neighbor that is not in the target list', async () => {
    const card = makeCard({ id: 'c1', listId: 'list-a', positionIdx: 'a0' });
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    } as unknown as EntityManager;

    const service = new CardsService(
      mockDataSource(manager),
      {
        assertCardInOrg: jest.fn().mockResolvedValue({ ...card }),
        assertListInOrg: jest
          .fn()
          .mockResolvedValue({ id: 'list-b', boardId }),
      } as never,
      { emit: jest.fn() } as never,
      positions,
    );

    await expect(
      service.update(card.id, orgId, {
        listId: 'list-b',
        beforeCardId: 'missing',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
