import { DataSource } from 'typeorm';
import { PositionService } from './position.service';
import { PositionRebalanceService } from './position-rebalance.service';

/**
 * A DataSource whose `transaction(cb)` runs `cb` with a fake EntityManager.
 *
 * The rebalance pass runs one transaction that, per org, sets the tenant and
 * scans the RLS-protected `lists`/`cards`. The fake routes the fixed queries
 * (advisory lock, org list, `set_config`, the batched `UPDATE … unnest`) to
 * canned answers and serves the remaining SELECTs (over-long parents, ordered
 * rows) from `queryResults` in order — so a test scripts a scan by listing its
 * SELECT results and asserts the decoded (id, key) update pairs.
 */
function fakeDataSource(
  queryResults: unknown[][],
  {
    lockGranted = true,
    orgs = [{ id: 'org-1' }],
  }: { lockGranted?: boolean; orgs?: Array<{ id: string }> } = {},
): {
  dataSource: DataSource;
  updates: Array<{ id: string; positionIdx: string }>;
  setTenants: string[];
} {
  const updates: Array<{ id: string; positionIdx: string }> = [];
  const setTenants: string[] = [];
  let call = 0;
  const manager = {
    query: jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('pg_try_advisory_xact_lock')) {
        return Promise.resolve([{ locked: lockGranted }]);
      }
      if (sql.includes('FROM organizations')) {
        return Promise.resolve(orgs);
      }
      if (sql.includes('set_config')) {
        setTenants.push((params as [string, string])[1]);
        return Promise.resolve([]);
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
  return { dataSource, updates, setTenants };
}

describe('PositionRebalanceService', () => {
  it('rebalances only the parent columns that hold an over-long key', async () => {
    const { dataSource, updates, setTenants } = fakeDataSource([
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
    // The single org's tenant was set before its scan.
    expect(setTenants).toEqual(['org-1']);
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

  it('sets the tenant per org and scans each one', async () => {
    const { dataSource, setTenants } = fakeDataSource(
      [
        // org-1: no over-long lists, no over-long cards
        [],
        [],
        // org-2: no over-long lists, no over-long cards
        [],
        [],
      ],
      { orgs: [{ id: 'org-1' }, { id: 'org-2' }] },
    );
    const service = new PositionRebalanceService(
      new PositionService(),
      dataSource,
    );

    const result = await service.rebalanceOverlongColumns();

    expect(result).toEqual({ lists: 0, cards: 0, skipped: false });
    expect(setTenants).toEqual(['org-1', 'org-2']);
  });

  it('skips entirely when another instance holds the advisory lock', async () => {
    const { dataSource, updates } = fakeDataSource([], { lockGranted: false });
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
