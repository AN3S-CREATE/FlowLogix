import { DataSource } from 'typeorm';
import { PositionService } from './position.service';
import { PositionRebalanceService } from './position-rebalance.service';

/**
 * A DataSource whose `transaction(cb)` runs `cb` with a fake EntityManager. That
 * manager's `query` returns queued SELECT results in order; the batched
 * `UPDATE … unnest` call is decoded into (id, key) pairs the test can assert.
 */
function fakeDataSource(
  queryResults: unknown[][],
  lockGranted = true,
): {
  dataSource: DataSource;
  updates: Array<{ id: string; positionIdx: string }>;
} {
  const updates: Array<{ id: string; positionIdx: string }> = [];
  let call = 0;
  const manager = {
    query: jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('pg_try_advisory_xact_lock')) {
        return Promise.resolve([{ locked: lockGranted }]);
      }
      if (sql.trimStart().startsWith('UPDATE')) {
        const [ids, keys] = params as [string[], string[]];
        ids.forEach((id, i) => updates.push({ id, positionIdx: keys[i] }));
        return Promise.resolve([]);
      }
      return Promise.resolve(queryResults[call++] ?? []);
    }),
  };
  const dataSource = {
    transaction: jest
      .fn()
      .mockImplementation((cb: (m: typeof manager) => unknown) => cb(manager)),
  } as unknown as DataSource;
  return { dataSource, updates };
}

describe('PositionRebalanceService', () => {
  it('rebalances only the parent columns that hold an over-long key', async () => {
    const { dataSource, updates } = fakeDataSource([
      [{ parent: 'board-1' }], // over-long list parents
      [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }], // ordered rows
      [], // no over-long card parents
    ]);
    const service = new PositionRebalanceService(
      new PositionService(),
      dataSource,
    );

    const result = await service.rebalanceOverlongColumns();

    expect(result).toEqual({ lists: 1, cards: 0, skipped: false });
    // The 3 lists got fresh keys, in id order and ascending key order.
    expect(updates.map((u) => u.id)).toEqual(['l1', 'l2', 'l3']);
    const keys = updates.map((u) => u.positionIdx);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(3);
  });

  it('is a no-op when no column has an over-long key', async () => {
    const { dataSource, updates } = fakeDataSource([[], []]);
    const service = new PositionRebalanceService(
      new PositionService(),
      dataSource,
    );

    expect(await service.rebalanceOverlongColumns()).toEqual({
      lists: 0,
      cards: 0,
      skipped: false,
    });
    expect(updates).toHaveLength(0);
  });

  it('skips entirely when another instance holds the advisory lock', async () => {
    const { dataSource, updates } = fakeDataSource([], false);
    const service = new PositionRebalanceService(
      new PositionService(),
      dataSource,
    );

    expect(await service.rebalanceOverlongColumns()).toEqual({
      lists: 0,
      cards: 0,
      skipped: true,
    });
    expect(updates).toHaveLength(0);
  });
});
