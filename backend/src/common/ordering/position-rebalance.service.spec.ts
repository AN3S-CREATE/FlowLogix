import { Repository } from 'typeorm';
import { PositionService } from './position.service';
import { PositionRebalanceService } from './position-rebalance.service';
import { List } from '../../lists/list.entity';
import { Card } from '../../cards/card.entity';

/**
 * A repo whose `query` returns queued results in order, and whose `update`
 * records the (id, patch) pairs it was called with.
 */
function fakeRepo(queryResults: unknown[][]): {
  repo: Repository<never>;
  updates: Array<{ id: string; positionIdx: string }>;
} {
  const updates: Array<{ id: string; positionIdx: string }> = [];
  let call = 0;
  const repo = {
    query: jest.fn().mockImplementation(() => queryResults[call++] ?? []),
    update: jest
      .fn()
      .mockImplementation((id: string, patch: { positionIdx: string }) => {
        updates.push({ id, positionIdx: patch.positionIdx });
        return Promise.resolve({ affected: 1 });
      }),
  } as unknown as Repository<never>;
  return { repo, updates };
}

describe('PositionRebalanceService', () => {
  it('rebalances only the parent columns that hold an over-long key', async () => {
    const positions = new PositionService();

    // lists repo: one board is over-long, with 3 lists to re-spread.
    const lists = fakeRepo([
      [{ parent: 'board-1' }], // over-long parents
      [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }], // ordered rows
    ]);
    // cards repo: nothing over-long.
    const cards = fakeRepo([[]]);

    const service = new PositionRebalanceService(
      positions,
      lists.repo as unknown as Repository<List>,
      cards.repo as unknown as Repository<Card>,
    );

    const result = await service.rebalanceOverlongColumns();

    expect(result).toEqual({ lists: 1, cards: 0 });
    // Each of the 3 lists got a fresh key, in ascending order.
    expect(lists.updates.map((u) => u.id)).toEqual(['l1', 'l2', 'l3']);
    const keys = lists.updates.map((u) => u.positionIdx);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(3);
    expect(cards.updates).toHaveLength(0);
  });

  it('is a no-op when no column has an over-long key', async () => {
    const positions = new PositionService();
    const lists = fakeRepo([[]]);
    const cards = fakeRepo([[]]);
    const service = new PositionRebalanceService(
      positions,
      lists.repo as unknown as Repository<List>,
      cards.repo as unknown as Repository<Card>,
    );

    expect(await service.rebalanceOverlongColumns()).toEqual({
      lists: 0,
      cards: 0,
    });
    expect(lists.updates).toHaveLength(0);
    expect(cards.updates).toHaveLength(0);
  });
});
