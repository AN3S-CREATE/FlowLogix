import { DataSource, EntityManager } from 'typeorm';
import { SyncService } from './sync.service';
import { SyncRequestDto } from './dto/sync.dto';

interface FakeManager {
  findOne: jest.Mock;
  save: jest.Mock;
}

function makeService(manager: FakeManager): {
  service: SyncService;
  save: jest.Mock;
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
  return { service: new SyncService(dataSource), save: manager.save };
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
  it('applies a client-newer field, persists it, and accepts the id', async () => {
    const row = cardRow();
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(row),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service, save } = makeService(manager);

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

    expect(save).toHaveBeenCalledTimes(1);
    expect(row.title).toBe('client'); // 300 > 100
    expect(row.syncClocks.title).toBe(300);
    expect(res.acceptedIds).toEqual(['c1']);
    expect(res.changes).toHaveLength(0); // server had nothing newer
    expect(res.checkpoint).toBeGreaterThan(0);
  });

  it('echoes a server-newer field back without persisting or accepting', async () => {
    const row = cardRow();
    row.syncClocks = { title: 500, description: 100, isComplete: 100 };
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(row),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service, save } = makeService(manager);

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

    expect(save).not.toHaveBeenCalled();
    expect(res.acceptedIds).toEqual([]);
    expect(res.changes).toHaveLength(1);
    expect(res.changes[0].fields.title).toBe('server'); // 500 > 200
  });

  it('skips an unseen / out-of-org id (not accepted, no write)', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service, save } = makeService(manager);

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

    expect(save).not.toHaveBeenCalled();
    expect(res.acceptedIds).toEqual([]);
    expect(res.changes).toHaveLength(0);
  });

  it('produces a strictly-increasing checkpoint across calls', async () => {
    const manager: FakeManager = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
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
