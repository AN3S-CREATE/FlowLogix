import { DataSource, EntityManager } from 'typeorm';
import { SyncService } from './sync.service';
import { SyncRequestDto } from './dto/sync.dto';
import { Card } from '../cards/card.entity';
import { Board } from '../boards/board.entity';
import { List } from '../lists/list.entity';
import { PositionService } from '../common/ordering/position.service';

interface FakeManager {
  findOne: jest.Mock;
  update: jest.Mock;
  insert: jest.Mock;
}

function makeService(manager: FakeManager): {
  service: SyncService;
  update: jest.Mock;
  insert: jest.Mock;
  positions: PositionService;
} {
  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue(undefined),
    isTransactionActive: true,
    manager: manager as unknown as EntityManager,
  };
  const dataSource = {
    createQueryRunner: () => queryRunner,
  } as unknown as DataSource;
  const positions = new PositionService();
  return {
    service: new SyncService(dataSource, positions),
    update: manager.update,
    insert: manager.insert,
    positions,
  };
}

const CARD_ID = '11111111-1111-4111-8111-111111111111';
const LIST_ID = '22222222-2222-4222-8222-222222222222';
const BOARD_ID = '33333333-3333-4333-8333-333333333333';

const cardRow = () => ({
  title: 'server',
  description: 'server desc',
  isComplete: false,
  listId: LIST_ID,
  positionIdx: 'a1',
  syncClocks: {
    title: 100,
    description: 100,
    isComplete: 100,
    listId: 100,
    positionIdx: 100,
  },
  nodeId: 'server-node',
  syncDeletedAt: null as number | null,
});

function req(change: SyncRequestDto['changes'][number]): SyncRequestDto {
  return { collection: 'cards', sinceCheckpoint: 0, changes: [change] };
}

describe('SyncService', () => {
  it('applies a client-newer field via a targeted update, and accepts the id', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(cardRow()),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      insert: jest.fn(),
    };
    const { service, update } = makeService(manager);

    const res = await service.sync(
      'org-1',
      req({
        id: CARD_ID,
        fields: {
          title: 'client',
          description: 'server desc',
          isComplete: false,
          listId: LIST_ID,
          positionIdx: 'a1',
        },
        clocks: {
          title: 300,
          description: 100,
          isComplete: 100,
          listId: 100,
          positionIdx: 100,
        },
        nodeId: 'client-node',
        deletedAt: null,
      }),
    );

    expect(update).toHaveBeenCalledTimes(1);
    const [target, id, patch] = update.mock.calls[0];
    expect(target).toBe(Card);
    expect(id).toBe(CARD_ID);
    expect(patch.title).toBe('client');
    expect(patch.syncClocks.title).toBe(300);
    expect(patch.positionIdx).toBe('a1');
    expect(res.acceptedIds).toEqual([CARD_ID]);
    expect(res.changes).toHaveLength(0);
    expect(res.checkpoint).toBeGreaterThan(0);
  });

  it('merges a newer client positionIdx under LWW', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(cardRow()),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      insert: jest.fn(),
    };
    const { service, update } = makeService(manager);

    const res = await service.sync(
      'org-1',
      req({
        id: CARD_ID,
        fields: {
          title: 'server',
          description: 'server desc',
          isComplete: false,
          listId: LIST_ID,
          positionIdx: 'b1',
        },
        clocks: {
          title: 100,
          description: 100,
          isComplete: 100,
          listId: 100,
          positionIdx: 400,
        },
        nodeId: 'client-node',
        deletedAt: null,
      }),
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][2].positionIdx).toBe('b1');
    expect(update.mock.calls[0][2].syncClocks.positionIdx).toBe(400);
    expect(res.acceptedIds).toEqual([CARD_ID]);
  });

  it('drops an invalid positionIdx (keeps server key; content-only still works)', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(cardRow()),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      insert: jest.fn(),
    };
    const { service, update } = makeService(manager);

    const res = await service.sync(
      'org-1',
      req({
        id: CARD_ID,
        fields: {
          title: 'client',
          description: 'server desc',
          isComplete: false,
          listId: LIST_ID,
          positionIdx: '!!!invalid!!!',
        },
        clocks: {
          title: 300,
          description: 100,
          isComplete: 100,
          listId: 100,
          positionIdx: 999,
        },
        nodeId: 'client-node',
        deletedAt: null,
      }),
    );

    expect(update).toHaveBeenCalledTimes(1);
    const patch = update.mock.calls[0][2];
    expect(patch.title).toBe('client');
    expect(patch.positionIdx).toBe('a1'); // invalid client key ignored
    expect(res.acceptedIds).toEqual([CARD_ID]);
  });

  it('echoes a server-newer field back without updating or accepting', async () => {
    const row = cardRow();
    row.syncClocks = {
      title: 500,
      description: 100,
      isComplete: 100,
      listId: 100,
      positionIdx: 100,
    };
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      insert: jest.fn(),
    };
    const { service, update } = makeService(manager);

    const res = await service.sync(
      'org-1',
      req({
        id: CARD_ID,
        fields: {
          title: 'client',
          description: 'server desc',
          isComplete: false,
        },
        clocks: { title: 200, description: 100, isComplete: 100 },
        nodeId: 'client-node',
        deletedAt: null,
      }),
    );

    expect(update).not.toHaveBeenCalled();
    expect(res.acceptedIds).toEqual([]);
    expect(res.changes).toHaveLength(1);
    expect(res.changes[0].fields.title).toBe('server');
  });

  it('ignores a non-numeric client clock (treats it as absent → server wins)', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(cardRow()),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      insert: jest.fn(),
    };
    const { service, update } = makeService(manager);

    const res = await service.sync(
      'org-1',
      req({
        id: CARD_ID,
        fields: {
          title: 'client',
          description: 'server desc',
          isComplete: false,
        },
        clocks: {
          title: 'not-a-number' as unknown as number,
          description: 100,
          isComplete: 100,
        },
        nodeId: 'client-node',
        deletedAt: null,
      }),
    );

    expect(update).not.toHaveBeenCalled();
    expect(res.acceptedIds).toEqual([]);
    expect(res.changes[0].fields.title).toBe('server');
  });

  it('re-reads the row under a pessimistic_write lock (by id, join-free) before merging', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(cardRow()),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      insert: jest.fn(),
    };
    const { service } = makeService(manager);

    await service.sync(
      'org-1',
      req({
        id: CARD_ID,
        fields: { title: 'client' },
        clocks: { title: 300 },
        nodeId: 'client-node',
        deletedAt: null,
      }),
    );

    expect(manager.findOne).toHaveBeenCalledTimes(2);
    const lockCall = manager.findOne.mock.calls[1];
    expect(lockCall[0]).toBe(Card);
    expect(lockCall[1]).toEqual({
      where: { id: CARD_ID },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('skips a row deleted between the auth load and the lock re-read', async () => {
    const manager: FakeManager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(cardRow())
        .mockResolvedValueOnce(null),
      update: jest.fn(),
      insert: jest.fn(),
    };
    const { service, update } = makeService(manager);

    const res = await service.sync(
      'org-1',
      req({
        id: CARD_ID,
        fields: { title: 'client' },
        clocks: { title: 300 },
        nodeId: 'client-node',
        deletedAt: null,
      }),
    );

    expect(update).not.toHaveBeenCalled();
    expect(res.acceptedIds).toEqual([]);
    expect(res.changes).toHaveLength(0);
  });

  it('skips an unseen / out-of-org id when insert payload is incomplete', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      insert: jest.fn(),
    };
    const { service, update, insert } = makeService(manager);

    const res = await service.sync(
      'org-1',
      req({
        id: 'ghost',
        fields: { title: 'x' },
        clocks: { title: 999 },
        nodeId: 'client-node',
        deletedAt: null,
      }),
    );

    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(res.acceptedIds).toEqual([]);
    expect(res.changes).toHaveLength(0);
  });

  it('inserts an offline-created card when list is in-org', async () => {
    const manager: FakeManager = {
      findOne: jest
        .fn()
        // auth load → null (unseen)
        .mockResolvedValueOnce(null)
        // listInOrg check → found
        .mockResolvedValueOnce({ id: LIST_ID })
        // last sibling for mint (no provided key path uses last) — we provide valid key so unused
        .mockResolvedValue(null),
      update: jest.fn(),
      insert: jest.fn().mockResolvedValue({ identifiers: [{ id: CARD_ID }] }),
    };
    const { service, insert, update } = makeService(manager);

    const res = await service.sync(
      'org-1',
      req({
        id: CARD_ID,
        fields: {
          title: 'Offline card',
          description: null,
          isComplete: false,
          listId: LIST_ID,
          positionIdx: 'a1',
        },
        clocks: {
          title: 50,
          description: 50,
          isComplete: 50,
          listId: 50,
          positionIdx: 50,
        },
        nodeId: 'mobile-1',
        deletedAt: null,
      }),
    );

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toBe(Card);
    expect(insert.mock.calls[0][1]).toMatchObject({
      id: CARD_ID,
      listId: LIST_ID,
      title: 'Offline card',
      positionIdx: 'a1',
    });
    expect(update).not.toHaveBeenCalled();
    expect(res.acceptedIds).toEqual([CARD_ID]);
  });

  it('rejects offline card insert when list is out of org', async () => {
    const manager: FakeManager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null) // auth
        .mockResolvedValueOnce(null) // listInOrg miss
        .mockResolvedValueOnce(null), // re-load after failed insert
      update: jest.fn(),
      insert: jest.fn(),
    };
    const { service, insert } = makeService(manager);

    const res = await service.sync(
      'org-1',
      req({
        id: CARD_ID,
        fields: {
          title: 'Sneaky',
          listId: LIST_ID,
          positionIdx: 'a1',
        },
        clocks: { title: 50, listId: 50, positionIdx: 50 },
        nodeId: 'mobile-1',
        deletedAt: null,
      }),
    );

    expect(insert).not.toHaveBeenCalled();
    expect(res.acceptedIds).toEqual([]);
  });

  it('inserts an offline-created board for the active org', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      insert: jest.fn().mockResolvedValue({ identifiers: [{ id: BOARD_ID }] }),
    };
    const { service, insert } = makeService(manager);

    const res = await service.sync('org-1', {
      collection: 'boards',
      sinceCheckpoint: 0,
      changes: [
        {
          id: BOARD_ID,
          fields: { title: 'Offline board' },
          clocks: { title: 10 },
          nodeId: 'mobile-1',
          deletedAt: null,
        },
      ],
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toBe(Board);
    expect(insert.mock.calls[0][1]).toMatchObject({
      id: BOARD_ID,
      orgId: 'org-1',
      title: 'Offline board',
    });
    expect(res.acceptedIds).toEqual([BOARD_ID]);
  });

  it('inserts an offline-created list when board is in-org', async () => {
    const manager: FakeManager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null) // auth
        .mockResolvedValueOnce({ id: BOARD_ID }), // boardInOrg
      update: jest.fn(),
      insert: jest.fn().mockResolvedValue({ identifiers: [{ id: LIST_ID }] }),
    };
    const { service, insert } = makeService(manager);

    const res = await service.sync('org-1', {
      collection: 'lists',
      sinceCheckpoint: 0,
      changes: [
        {
          id: LIST_ID,
          fields: {
            title: 'Offline list',
            boardId: BOARD_ID,
            positionIdx: 'a1',
          },
          clocks: { title: 10, boardId: 10, positionIdx: 10 },
          nodeId: 'mobile-1',
          deletedAt: null,
        },
      ],
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toBe(List);
    expect(insert.mock.calls[0][1]).toMatchObject({
      id: LIST_ID,
      boardId: BOARD_ID,
      title: 'Offline list',
      positionIdx: 'a1',
    });
    expect(res.acceptedIds).toEqual([LIST_ID]);
  });

  it('produces a strictly-increasing checkpoint across calls', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      insert: jest.fn(),
    };
    const { service } = makeService(manager);
    const a = await service.sync('org-1', {
      collection: 'boards',
      sinceCheckpoint: 0,
      changes: [],
    });
    const b = await service.sync('org-1', {
      collection: 'boards',
      sinceCheckpoint: 0,
      changes: [],
    });
    expect(b.checkpoint).toBeGreaterThan(a.checkpoint);
  });
});
