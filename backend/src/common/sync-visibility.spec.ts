import { filterVisible, isSyncDeleted } from './sync-visibility';

const row = (syncDeletedAt: number | null, clocks: Record<string, number>) => ({
  syncDeletedAt,
  syncClocks: clocks,
});

describe('isSyncDeleted', () => {
  it('is false when there is no tombstone', () => {
    expect(isSyncDeleted(row(null, { title: 100 }))).toBe(false);
  });

  it('is true when the tombstone is at/after the newest field write', () => {
    expect(isSyncDeleted(row(300, { title: 100, description: 200 }))).toBe(
      true,
    );
    expect(isSyncDeleted(row(200, { title: 200 }))).toBe(true); // tie -> deleted
  });

  it('is false when a later field edit resurrects the record', () => {
    // Deleted@200, then a field edited@300 -> visible again.
    expect(isSyncDeleted(row(200, { title: 300, description: 100 }))).toBe(
      false,
    );
  });

  it('treats an empty clock map as never-written (tombstone wins)', () => {
    expect(isSyncDeleted(row(1, {}))).toBe(true);
  });

  it('ignores a non-numeric clock instead of leaking the tombstoned row', () => {
    // A malformed JSONB clock must not poison Math.max into NaN (which would
    // make every `>=` false and expose a genuinely-deleted row).
    const bad = { title: 'oops' as unknown as number, description: 100 };
    expect(isSyncDeleted(row(300, bad))).toBe(true); // 300 >= 100, still deleted
    expect(isSyncDeleted(row(50, bad))).toBe(false); // 50 < 100, resurrected
  });
});

describe('filterVisible', () => {
  it('drops only the currently-deleted rows', () => {
    const rows = [
      { id: 'alive', syncDeletedAt: null, syncClocks: { title: 100 } },
      { id: 'deleted', syncDeletedAt: 500, syncClocks: { title: 100 } },
      { id: 'resurrected', syncDeletedAt: 200, syncClocks: { title: 300 } },
    ];
    expect(filterVisible(rows).map((r) => r.id)).toEqual([
      'alive',
      'resurrected',
    ]);
  });
});
