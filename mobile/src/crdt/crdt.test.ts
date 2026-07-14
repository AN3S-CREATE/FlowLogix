import { describe, it, expect } from 'vitest';
import { HybridClock } from './clock';
import { mergeRegister, registerWins, compareStamps } from './lwwRegister';
import { LwwElementSet } from './lwwElementSet';
import { mergeRecord, isDeleted } from './mergeRecord';
import { LwwRegister, VersionedRecord } from './types';

describe('HybridClock', () => {
  it('produces strictly increasing timestamps even within the same ms', () => {
    const clock = new HybridClock();
    const stamps = Array.from({ length: 1000 }, () => clock.now());
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i]).toBeGreaterThan(stamps[i - 1]);
    }
  });

  it('never goes backwards if the wall clock rewinds', () => {
    const clock = new HybridClock();
    const first = clock.now();
    // Simulate a backwards wall-clock step.
    const realNow = Date.now;
    Date.now = () => 0;
    try {
      const second = clock.now();
      expect(second).toBeGreaterThan(first);
    } finally {
      Date.now = realNow;
    }
  });
});

describe('mergeRegister (LWW)', () => {
  const reg = <T>(value: T, updatedAt: number, nodeId: string): LwwRegister<T> => ({
    value,
    updatedAt,
    nodeId,
  });

  it('keeps the later timestamp', () => {
    const a = reg('old', 100, 'n1');
    const b = reg('new', 200, 'n2');
    expect(mergeRegister(a, b).value).toBe('new');
    expect(mergeRegister(b, a).value).toBe('new'); // order-independent
  });

  it('breaks exact ties deterministically by nodeId', () => {
    const a = reg('A', 100, 'nodeA');
    const b = reg('B', 100, 'nodeB');
    expect(mergeRegister(a, b).value).toBe('B'); // 'nodeB' > 'nodeA'
    expect(mergeRegister(b, a).value).toBe('B'); // same result either way
    expect(registerWins(b, a)).toBe(true);
  });

  it('compareStamps reports the winning side', () => {
    expect(compareStamps(200, 'x', 100, 'y')).toBe('local');
    expect(compareStamps(100, 'x', 200, 'y')).toBe('remote');
    expect(compareStamps(100, 'x', 100, 'x')).toBe('equal');
  });
});

describe('LwwElementSet', () => {
  it('adds and removes by timestamp', () => {
    const set = new LwwElementSet();
    set.add('u1', 10);
    expect(set.has('u1')).toBe(true);
    set.remove('u1', 20);
    expect(set.has('u1')).toBe(false);
    set.add('u1', 30); // re-added later
    expect(set.has('u1')).toBe(true);
    expect(set.values()).toEqual(['u1']);
  });

  it('default bias makes remove win on an exact tie (delete-wins)', () => {
    const set = new LwwElementSet('remove');
    set.add('c1', 50);
    set.remove('c1', 50);
    expect(set.has('c1')).toBe(false);
  });

  it("'add' bias makes add win on a tie", () => {
    const set = new LwwElementSet('add');
    set.add('c1', 50);
    set.remove('c1', 50);
    expect(set.has('c1')).toBe(true);
  });

  it('merge is commutative, associative, and idempotent', () => {
    const a = new LwwElementSet().add('x', 1).add('y', 5);
    const b = new LwwElementSet().remove('x', 3).add('z', 2);

    const ab = LwwElementSet.fromJSON(a.toJSON()).merge(b).values();
    const ba = LwwElementSet.fromJSON(b.toJSON()).merge(a).values();
    expect(ab).toEqual(ba); // commutative

    const twice = LwwElementSet.fromJSON(a.toJSON()).merge(b).merge(b).values();
    expect(twice).toEqual(ab); // idempotent

    // x removed@3 > added@1 -> absent; y & z present.
    expect(ab).toEqual(['y', 'z']);
  });

  it('round-trips through JSON', () => {
    const set = new LwwElementSet().add('a', 1).remove('b', 2);
    const restored = LwwElementSet.fromJSON(set.toJSON());
    expect(restored.toJSON()).toEqual(set.toJSON());
  });
});

interface CardFields {
  title: string;
  description: string;
  listId: string;
  positionIdx: number;
  [key: string]: unknown;
}

function card(
  over: Partial<{
    fields: Partial<CardFields>;
    clocks: Partial<Record<keyof CardFields, number>>;
    nodeId: string;
    deletedAt: number | null;
  }> = {},
): VersionedRecord<CardFields> {
  return {
    id: 'card-1',
    fields: {
      title: 'A',
      description: '',
      listId: 'list-1',
      positionIdx: 0,
      ...over.fields,
    },
    clocks: {
      title: 100,
      description: 100,
      listId: 100,
      positionIdx: 100,
      ...over.clocks,
    },
    nodeId: over.nodeId ?? 'device-A',
    deletedAt: over.deletedAt ?? null,
  };
}

describe('mergeRecord (field-level LWW)', () => {
  it('takes each field from whichever side stamped it latest', () => {
    const local = card({
      fields: { title: 'Local title', description: 'Local desc' },
      clocks: { title: 300, description: 100 },
    });
    const remote = card({
      fields: { title: 'Remote title', description: 'Remote desc' },
      clocks: { title: 200, description: 400 },
      nodeId: 'device-B',
    });

    const { merged, report, changed } = mergeRecord(local, remote);
    expect(merged.fields.title).toBe('Local title'); // 300 > 200
    expect(merged.fields.description).toBe('Remote desc'); // 400 > 100
    expect(report.title).toBe('local');
    expect(report.description).toBe('remote');
    expect(changed).toBe(true);
  });

  it('is order-independent (converges regardless of merge direction)', () => {
    const local = card({ fields: { title: 'L' }, clocks: { title: 300 } });
    const remote = card({
      fields: { title: 'R' },
      clocks: { title: 400 },
      nodeId: 'device-B',
    });
    expect(mergeRecord(local, remote).merged.fields).toEqual(
      mergeRecord(remote, local).merged.fields,
    );
  });

  it('a later edit resurrects a record deleted earlier', () => {
    // Delete@200, then a field edit@300 on another device.
    const deleted = card({ deletedAt: 200, clocks: { title: 100 } });
    const edited = card({
      fields: { title: 'Edited after delete' },
      clocks: { title: 300 },
      nodeId: 'device-B',
    });
    const { merged } = mergeRecord(deleted, edited);
    expect(isDeleted(merged)).toBe(false); // edit@300 > tombstone@200
    expect(merged.fields.title).toBe('Edited after delete');
  });

  it('a later delete wins over an earlier edit', () => {
    const edited = card({ fields: { title: 'Edited' }, clocks: { title: 200 } });
    const deleted = card({ deletedAt: 300, nodeId: 'device-B' });
    const { merged } = mergeRecord(edited, deleted);
    expect(merged.deletedAt).toBe(300);
    expect(isDeleted(merged)).toBe(true); // tombstone@300 > newest field@200
  });

  it('reports no change when local already dominates every field', () => {
    const local = card({ clocks: { title: 500, description: 500, listId: 500, positionIdx: 500 } });
    const remote = card({ nodeId: 'device-B' });
    expect(mergeRecord(local, remote).changed).toBe(false);
  });

  it('refuses to merge two different records', () => {
    const a = card();
    const b = { ...card(), id: 'other' };
    expect(() => mergeRecord(a, b)).toThrow(/different records/);
  });

  it('breaks an exact clock tie by value, independent of merge order or nodeId', () => {
    // Same field, same clock, different values, different (mutable) nodeIds.
    const x = card({
      fields: { title: 'aaa' },
      clocks: { title: 500 },
      nodeId: 'device-Z',
    });
    const y = card({
      fields: { title: 'zzz' },
      clocks: { title: 500 },
      nodeId: 'device-A',
    });
    const xy = mergeRecord(x, y).merged.fields.title;
    const yx = mergeRecord(y, x).merged.fields.title;
    expect(xy).toBe(yx); // order-independent despite differing nodeIds
    expect(xy).toBe('zzz'); // greater value wins the tie
  });
});
