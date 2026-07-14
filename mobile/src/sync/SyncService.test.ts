import { describe, it, expect, beforeEach } from 'vitest';
import { HybridClock } from '../crdt/clock';
import { SyncEngine, SyncServiceConfig } from './SyncService';
import { ManualNetworkMonitor } from './networkMonitor';
import {
  CheckpointStore,
  CollectionName,
  LocalRecord,
  LocalStore,
  PullResult,
  PushResult,
  RemoteChange,
} from './ports';

interface CardFields {
  title: string;
  description: string;
  listId: string;
  [key: string]: unknown;
}

class MemoryStore implements LocalStore<CardFields> {
  readonly rows = new Map<string, LocalRecord<CardFields>>();
  async getById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async getPending() {
    return [...this.rows.values()].filter((r) => r.pending);
  }
  async put(record: LocalRecord<CardFields>) {
    this.rows.set(record.id, { ...record });
  }
}

class MemoryCheckpoints implements CheckpointStore {
  private readonly values = new Map<CollectionName, number>();
  async get(c: CollectionName) {
    return this.values.get(c) ?? 0;
  }
  async set(c: CollectionName, v: number) {
    this.values.set(c, v);
  }
}

class FakeTransport {
  pullQueue: RemoteChange<CardFields>[] = [];
  checkpoint = 1;
  pushed: RemoteChange<CardFields>[] = [];
  rejectIds = new Set<string>();

  async pull(): Promise<PullResult<CardFields>> {
    const changes = this.pullQueue;
    this.pullQueue = [];
    return { changes, checkpoint: this.checkpoint++ };
  }
  async push(
    _c: CollectionName,
    changes: RemoteChange<CardFields>[],
  ): Promise<PushResult> {
    this.pushed.push(...changes);
    return {
      acceptedIds: changes
        .map((c) => c.id)
        .filter((id) => !this.rejectIds.has(id)),
    };
  }
}

function makeEngine(over: Partial<SyncServiceConfig<CardFields>> = {}) {
  const store = over.store ?? new MemoryStore();
  const transport = over.transport ?? (new FakeTransport() as never);
  const network = over.network ?? new ManualNetworkMonitor(true, 'wifi');
  const checkpoints = over.checkpoints ?? new MemoryCheckpoints();
  const cfg: SyncServiceConfig<CardFields> = {
    nodeId: over.nodeId ?? 'device-A',
    store,
    transport,
    network,
    checkpoints,
    clock: over.clock ?? new HybridClock(),
  };
  return {
    engine: new SyncEngine<CardFields>('cards', cfg),
    store: store as MemoryStore,
    transport: transport as unknown as FakeTransport,
    network: network as ManualNetworkMonitor,
  };
}

describe('SyncEngine offline mutations', () => {
  it('writes mutations straight to local store and flags them pending', async () => {
    const { engine, store } = makeEngine({
      network: new ManualNetworkMonitor(false, 'none'),
    });
    await engine.mutate('c1', { title: 'Draft', listId: 'l1' });

    const row = store.rows.get('c1')!;
    expect(row.fields.title).toBe('Draft');
    expect(row.pending).toBe(true);
    expect(row.clocks.title).toBeGreaterThan(0);
  });

  it('only re-stamps the fields present in the patch', async () => {
    const { engine, store } = makeEngine();
    await engine.mutate('c1', { title: 'A', description: 'D' });
    const first = store.rows.get('c1')!;
    const descClock = first.clocks.description;

    await engine.mutate('c1', { title: 'A2' }); // only title
    const second = store.rows.get('c1')!;
    expect(second.clocks.title).toBeGreaterThan(first.clocks.title);
    expect(second.clocks.description).toBe(descClock); // untouched
  });

  it('sync is a safe no-op while offline', async () => {
    const { engine } = makeEngine({
      network: new ManualNetworkMonitor(false, 'none'),
    });
    await engine.mutate('c1', { title: 'Offline' });
    const report = await engine.sync();
    expect(report.skippedOffline).toBe(true);
    expect(report.pushed).toBe(0);
  });
});

describe('SyncEngine reconnect merge', () => {
  let ctx: ReturnType<typeof makeEngine>;
  beforeEach(() => {
    ctx = makeEngine();
  });

  it('pulls remote changes and pushes local pending edits', async () => {
    await ctx.engine.mutate('c1', { title: 'Local', listId: 'l1' });
    ctx.transport.pullQueue = [
      {
        id: 'c2',
        fields: { title: 'FromServer', description: '', listId: 'l1' },
        clocks: { title: 5, description: 5, listId: 5 },
        nodeId: 'server',
        deletedAt: null,
      },
    ];

    const report = await ctx.engine.sync();
    expect(report.pulled).toBe(1);
    expect(ctx.store.rows.get('c2')!.fields.title).toBe('FromServer');
    expect(ctx.transport.pushed.map((c) => c.id)).toContain('c1');
    // Pushed & accepted -> pending cleared.
    expect(ctx.store.rows.get('c1')!.pending).toBe(false);
  });

  it('merges a conflicting record field-by-field (later timestamp wins)', async () => {
    // Local edited the title late; server edited the description late.
    await ctx.engine.mutate('c1', {
      title: 'Local title',
      description: 'stale',
      listId: 'l1',
    });
    const localTitleClock = ctx.store.rows.get('c1')!.clocks.title;

    ctx.transport.pullQueue = [
      {
        id: 'c1',
        fields: { title: 'server stale', description: 'Server desc', listId: 'l1' },
        clocks: {
          title: localTitleClock - 100, // older than local title
          description: localTitleClock + 1000, // newer than local desc
          listId: 1,
        },
        nodeId: 'server',
        deletedAt: null,
      },
    ];

    await ctx.engine.sync();
    const row = ctx.store.rows.get('c1')!;
    expect(row.fields.title).toBe('Local title'); // local kept
    expect(row.fields.description).toBe('Server desc'); // server won
  });

  it('keeps a record pending if a local field still beats the server', async () => {
    await ctx.engine.mutate('c1', { title: 'Local wins', listId: 'l1' });
    const titleClock = ctx.store.rows.get('c1')!.clocks.title;
    // Server sends an OLDER version of the same record during pull.
    ctx.transport.pullQueue = [
      {
        id: 'c1',
        fields: { title: 'old server', description: '', listId: 'l1' },
        clocks: { title: titleClock - 50, description: 1, listId: 1 },
        nodeId: 'server',
        deletedAt: null,
      },
    ];
    ctx.transport.rejectIds.add('c1'); // simulate push not yet acknowledged

    await ctx.engine.sync();
    const row = ctx.store.rows.get('c1')!;
    expect(row.fields.title).toBe('Local wins');
    expect(row.pending).toBe(true); // still ahead of server, keep pushing
  });

  it('advances the checkpoint after a successful pull', async () => {
    const checkpoints = new MemoryCheckpoints();
    const local = makeEngine({ checkpoints });
    local.transport.checkpoint = 42;
    await local.engine.sync();
    expect(await checkpoints.get('cards')).toBe(42);
  });
});

describe('SyncEngine convergence', () => {
  it('two devices editing different fields converge after exchanging state', async () => {
    const clock = new HybridClock();
    const a = makeEngine({ nodeId: 'device-A', clock });
    const b = makeEngine({ nodeId: 'device-B', clock });

    // Both start from the same seed.
    const seed = { title: 'Seed', description: 'Seed', listId: 'l1' };
    await a.engine.mutate('c1', seed);
    await b.engine.mutate('c1', seed);

    // A edits title later; B edits description even later.
    await a.engine.mutate('c1', { title: 'A title' });
    await b.engine.mutate('c1', { description: 'B desc' });

    const toRemote = (s: MemoryStore): RemoteChange<CardFields> => {
      const r = s.rows.get('c1')!;
      return {
        id: r.id,
        fields: r.fields,
        clocks: r.clocks,
        nodeId: r.nodeId,
        deletedAt: r.deletedAt,
      };
    };

    // Exchange: feed each other's current state through a pull.
    a.transport.pullQueue = [toRemote(b.store)];
    b.transport.pullQueue = [toRemote(a.store)];
    await a.engine.sync();
    await b.engine.sync();

    const rowA = a.store.rows.get('c1')!.fields;
    const rowB = b.store.rows.get('c1')!.fields;
    expect(rowA).toEqual(rowB); // converged
    expect(rowA.title).toBe('A title');
    expect(rowA.description).toBe('B desc');
  });
});
