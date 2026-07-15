import { DataSource, EntityManager } from 'typeorm';
import { SyncService } from './sync.service';
import { SyncRequestDto } from './dto/sync.dto';
import { Card } from '../cards/card.entity';

interface FakeManager {
  findOne: jest.Mock;
  update: jest.Mock;
}

function makeService(manager: FakeManager): {
  service: SyncService;
  update: jest.Mock;
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
  return { service: new SyncService(dataSource), update: manager.update };
}

const cardRow = () => ({
  title: 'server',
  description: 'server desc',
  isComplete: false,
  syncClocks: { title: 100, description: 100, isComplete: 100 },
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
    };
    const { service, update } = makeService(manager);

    const res = await service.sync(
      'org-1',
      req({
        id: 'c1',
        fields: {
          title: 'client',
          description: 'server desc',
          isComplete: false,
        },
        clocks: { title: 300, description: 100, isComplete: 100 },
        nodeId: 'client-node',
        deletedAt: null,
      }),
    );

    expect(update).toHaveBeenCalledTimes(1);
    const [target, id, patch] = update.mock.calls[0];
    expect(target).toBe(Card); // targeted at the entity, only sync columns
    expect(id).toBe('c1');
    expect(patch.title).toBe('client'); // 300 > 100
    expect(patch.syncClocks.title).toBe(300);
    expect(patch).not.toHaveProperty('positionIdx'); // non-sync columns untouched
    expect(res.acceptedIds).toEqual(['c1']);
    expect(res.changes).toHaveLength(0); // server had nothing newer
    expect(res.checkpoint).toBeGreaterThan(0);
  });

  it('echoes a server-newer field back without updating or accepting', async () => {
    const row = cardRow();
    row.syncClocks = { title: 500, description: 100, isComplete: 100 };
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const { service, update } = makeService(manager);

    const res = await service.sync(
      'org-1',
      req({
        id: 'c1',
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
    expect(res.changes[0].fields.title).toBe('server'); // 500 > 200
  });

  it('ignores a non-numeric client clock (treats it as absent → server wins)', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(cardRow()),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const { service, update } = makeService(manager);

    const res = await service.sync(
      'org-1',
      req({
        id: 'c1',
        fields: {
          title: 'client',
          description: 'server desc',
          isComplete: false,
        },
        // A hostile/malformed clock — must not win the merge.
        clocks: {
          title: 'not-a-number' as unknown as number,
          description: 100,
          isComplete: 100,
        },
        nodeId: 'client-node',
        deletedAt: null,
      }),
    );

    expect(update).not.toHaveBeenCalled(); // client title clock treated as 0 < 100
    expect(res.acceptedIds).toEqual([]);
    expect(res.changes[0].fields.title).toBe('server');
  });

  it('re-reads the row under a pessimistic_write lock (by id, join-free) before merging', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(cardRow()),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const { service } = makeService(manager);

    await service.sync(
      'org-1',
      req({
        id: 'c1',
        fields: {
          title: 'client',
          description: 'server desc',
          isComplete: false,
        },
        clocks: { title: 300, description: 100, isComplete: 100 },
        nodeId: 'client-node',
        deletedAt: null,
      }),
    );

    // Two loads: (1) the relation-joined authorization load, then (2) the
    // FOR UPDATE re-read — by id alone, no join — so a lost update can't slip in.
    expect(manager.findOne).toHaveBeenCalledTimes(2);
    const lockCall = manager.findOne.mock.calls[1];
    expect(lockCall[0]).toBe(Card);
    expect(lockCall[1]).toEqual({
      where: { id: 'c1' },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('skips a row deleted between the auth load and the lock re-read', async () => {
    // Authorized load succeeds, but the FOR UPDATE re-read finds it gone.
    const manager: FakeManager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(cardRow())
        .mockResolvedValueOnce(null),
      update: jest.fn(),
    };
    const { service, update } = makeService(manager);

    const res = await service.sync(
      'org-1',
      req({
        id: 'c1',
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

  it('skips an unseen / out-of-org id (not accepted, no write)', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const { service, update } = makeService(manager);

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

    expect(update).not.toHaveBeenCalled();
    expect(res.acceptedIds).toEqual([]);
    expect(res.changes).toHaveLength(0);
  });

  it('produces a strictly-increasing checkpoint across calls', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
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
