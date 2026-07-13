import {
  BASE62_ALPHABET,
  FractionalIndexer,
  OrderableItem,
} from './fractional-indexer';

describe('FractionalIndexer', () => {
  let indexer: FractionalIndexer;

  beforeEach(() => {
    indexer = new FractionalIndexer();
  });

  /** Assert `a < mid < b` under plain lexicographic string comparison. */
  const assertBetween = (a: string | null, mid: string, b: string | null) => {
    if (a !== null) expect(a < mid).toBe(true);
    if (b !== null) expect(mid < b).toBe(true);
  };

  const isValid = (key: string) => indexer.isValidKey(key);

  describe('getIntermediateKey — base cases', () => {
    it("returns the Base62 seed 'M' for an empty column", () => {
      expect(indexer.getIntermediateKey(null, null)).toBe('M');
      expect(isValid('M')).toBe(true);
    });

    it('appends to the end when next is null (key > prev)', () => {
      const key = indexer.getIntermediateKey('M', null);
      assertBetween('M', key, null);
      expect(isValid(key)).toBe(true);
    });

    it('prepends to the front when prev is null (key < next)', () => {
      const key = indexer.getIntermediateKey(null, 'M');
      assertBetween(null, key, 'M');
      expect(isValid(key)).toBe(true);
    });

    it('inserts strictly between two spaced keys', () => {
      const key = indexer.getIntermediateKey('B', 'g');
      assertBetween('B', key, 'g');
      expect(isValid(key)).toBe(true);
    });
  });

  describe('consecutive-character handling (no space between digits)', () => {
    it("appends a character between adjacent letters 'b' and 'c'", () => {
      const key = indexer.getIntermediateKey('b', 'c');
      assertBetween('b', key, 'c');
      expect(key.startsWith('b')).toBe(true);
      expect(key.length).toBe(2);
      expect(isValid(key)).toBe(true);
    });

    it('appends between adjacent digits at the front of the alphabet', () => {
      const key = indexer.getIntermediateKey('0V', '1'); // rank(0)=0, rank(1)=1
      assertBetween('0V', key, '1');
      expect(isValid(key)).toBe(true);
    });

    it('keeps appending past the top of the alphabet when next is null', () => {
      const key = indexer.getIntermediateKey('zz', null);
      assertBetween('zz', key, null);
      expect(key.startsWith('zz')).toBe(true);
      expect(isValid(key)).toBe(true);
    });

    it('produces a between-key even for the tightest neighbours (a1 / a11-like)', () => {
      const key = indexer.getIntermediateKey('1', '11');
      assertBetween('1', key, '11');
      expect(isValid(key)).toBe(true);
    });
  });

  describe('no-trailing-zero invariant', () => {
    it('never emits a key ending in the zero character across many ops', () => {
      // Sweep the alphabet as single-char neighbours and check outputs. Skip
      // index 0 (the zero char), which is not itself a valid key.
      for (let i = 1; i < BASE62_ALPHABET.length; i++) {
        for (let j = i + 1; j < BASE62_ALPHABET.length; j++) {
          const key = indexer.getIntermediateKey(
            BASE62_ALPHABET[i],
            BASE62_ALPHABET[j],
          );
          expect(key.endsWith('0')).toBe(false);
          assertBetween(BASE62_ALPHABET[i], key, BASE62_ALPHABET[j]);
        }
      }
    });

    it('rejects a malformed key that ends in zero', () => {
      expect(() => indexer.getIntermediateKey('10', null)).toThrow(
        /must not end in/,
      );
      expect(indexer.isValidKey('10')).toBe(false);
    });
  });

  describe('deep repeated insertion', () => {
    it('supports 500 head insertions and stays sorted', () => {
      const keys: string[] = [];
      let head = indexer.getIntermediateKey(null, null);
      keys.push(head);
      for (let i = 0; i < 500; i++) {
        const next = indexer.getIntermediateKey(null, head);
        assertBetween(null, next, head);
        keys.unshift(next);
        head = next;
      }
      expect(isSortedAscending(keys)).toBe(true);
      keys.forEach((k) => expect(isValid(k)).toBe(true));
    });

    it('supports 500 tail insertions and stays sorted', () => {
      const keys: string[] = [];
      let tail = indexer.getIntermediateKey(null, null);
      keys.push(tail);
      for (let i = 0; i < 500; i++) {
        const next = indexer.getIntermediateKey(tail, null);
        assertBetween(tail, next, null);
        keys.push(next);
        tail = next;
      }
      expect(isSortedAscending(keys)).toBe(true);
      keys.forEach((k) => expect(isValid(k)).toBe(true));
    });

    it('supports 500 insertions into the same gap (worst case) and stays sorted', () => {
      const lo = indexer.getIntermediateKey(null, null);
      const hi = indexer.getIntermediateKey(lo, null);
      const collected = [lo, hi];
      let a = lo;
      const b = hi;
      for (let i = 0; i < 500; i++) {
        const mid = indexer.getIntermediateKey(a, b);
        assertBetween(a, mid, b);
        collected.splice(collected.length - 1, 0, mid);
        a = mid; // keep splitting the shrinking left gap
      }
      expect(isSortedAscending(collected)).toBe(true);
      collected.forEach((k) => expect(isValid(k)).toBe(true));
    });
  });

  describe('random-insertion fuzz', () => {
    it('maintains a fully sorted column across 2000 random inserts', () => {
      const rand = makeSeededRandom(1234567);
      // Start with one item.
      const column: string[] = [indexer.getIntermediateKey(null, null)];
      for (let i = 0; i < 2000; i++) {
        const pos = Math.floor(rand() * (column.length + 1)); // 0..length
        const prev = pos === 0 ? null : column[pos - 1];
        const next = pos === column.length ? null : column[pos];
        const key = indexer.getIntermediateKey(prev, next);
        assertBetween(prev, key, next);
        column.splice(pos, 0, key);
      }
      expect(column.length).toBe(2001);
      // Independent proof of order: a stable sort must not reorder anything.
      const sorted = [...column].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
      expect(sorted).toEqual(column);
      expect(new Set(column).size).toBe(column.length); // all unique
    });
  });

  describe('error handling', () => {
    it('throws when prev is not strictly less than next', () => {
      expect(() => indexer.getIntermediateKey('g', 'B')).toThrow(
        /strictly before/,
      );
      expect(() => indexer.getIntermediateKey('M', 'M')).toThrow(
        /strictly before/,
      );
    });

    it('throws on empty-string keys', () => {
      expect(() => indexer.getIntermediateKey('', null)).toThrow(/non-empty/);
    });

    it('throws on characters outside the alphabet', () => {
      expect(() => indexer.getIntermediateKey('M!', null)).toThrow(
        /not in the alphabet/,
      );
    });
  });

  describe('rebalance', () => {
    it('returns evenly spaced, sorted, two-character keys for a small column', () => {
      const keys = indexer.rebalance(10);
      expect(keys).toHaveLength(10);
      keys.forEach((k) => {
        expect(k.length).toBe(2);
        expect(isValid(k)).toBe(true);
      });
      expect(isSortedAscending(keys)).toBe(true);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('accepts an ordered array of existing keys and preserves count', () => {
      const existing = ['0V', 'M', 'MMMMMMMM', 'zz'];
      const rebalanced = indexer.rebalance(existing);
      expect(rebalanced).toHaveLength(existing.length);
      expect(isSortedAscending(rebalanced)).toBe(true);
      rebalanced.forEach((k) => expect(k.length).toBe(2));
    });

    it('collapses length-bloated keys back down to two characters', () => {
      // Build a bloated column by hammering one gap.
      let a = indexer.getIntermediateKey(null, null);
      const b = indexer.getIntermediateKey(a, null);
      const column = [a, b];
      for (let i = 0; i < 40; i++) {
        const mid = indexer.getIntermediateKey(a, b);
        column.splice(column.length - 1, 0, mid);
        a = mid;
      }
      const maxLenBefore = Math.max(...column.map((k) => k.length));
      expect(maxLenBefore).toBeGreaterThan(2);

      const rebalanced = indexer.rebalance(column);
      expect(Math.max(...rebalanced.map((k) => k.length))).toBe(2);
      expect(isSortedAscending(rebalanced)).toBe(true);
    });

    it('still leaves room to insert between rebalanced neighbours', () => {
      const keys = indexer.rebalance(50);
      for (let i = 0; i < keys.length - 1; i++) {
        const mid = indexer.getIntermediateKey(keys[i], keys[i + 1]);
        assertBetween(keys[i], mid, keys[i + 1]);
        expect(isValid(mid)).toBe(true);
      }
    });

    it('widens keys automatically when the column exceeds the two-char capacity', () => {
      const bigCount = 4000; // > 62*62/2, forces length 3
      const keys = indexer.rebalance(bigCount);
      expect(keys).toHaveLength(bigCount);
      expect(Math.max(...keys.map((k) => k.length))).toBeGreaterThan(2);
      expect(isSortedAscending(keys)).toBe(true);
      keys.forEach((k) => expect(isValid(k)).toBe(true));
    });

    it('returns an empty array for a zero-length column', () => {
      expect(indexer.rebalance(0)).toEqual([]);
      expect(indexer.rebalance([])).toEqual([]);
    });

    it('honours an explicit targetLength', () => {
      const keys = indexer.rebalance(5, 3);
      expect(keys).toHaveLength(5);
      keys.forEach((k) => expect(k.length).toBe(3));
      expect(isSortedAscending(keys)).toBe(true);
    });

    it('rejects an invalid or too-small targetLength', () => {
      expect(() => indexer.rebalance(5, 1)).toThrow(/integer >= 2/);
      expect(() => indexer.rebalance(5, 2.5)).toThrow(/integer >= 2/);
      // 62^2 = 3844 cannot evenly space 5000 items.
      expect(() => indexer.rebalance(5000, 2)).toThrow(/too small/);
    });

    it('stays exact when (k+1)*capacity would overflow a JS number (BigInt spacing)', () => {
      // 62^8 ≈ 2.18e14; by k≈41 the product (k+1)*capacity exceeds
      // Number.MAX_SAFE_INTEGER (~9.007e15), which would silently lose
      // precision without BigInt and could break strict ordering/uniqueness.
      const keys = indexer.rebalance(50, 8);
      expect(keys).toHaveLength(50);
      keys.forEach((k) => expect(k.length).toBe(8));
      expect(isSortedAscending(keys)).toBe(true);
      expect(new Set(keys).size).toBe(keys.length);
      keys.forEach((k) => expect(isValid(k)).toBe(true));
    });
  });

  describe('FractionalIndexer.compare — collision ordering', () => {
    const item = (
      positionIdx: string,
      createdAt: string,
      id: string,
    ): OrderableItem => ({
      positionIdx,
      createdAt,
      id,
    });

    it('orders primarily by position_idx ascending', () => {
      const items = [
        item('g', '2026-01-01', 'c'),
        item('B', '2026-01-01', 'a'),
      ];
      items.sort(FractionalIndexer.compare);
      expect(items.map((i) => i.positionIdx)).toEqual(['B', 'g']);
    });

    it('breaks position_idx ties by created_at ascending', () => {
      const items = [
        item('M', '2026-01-02T00:00:00Z', 'later'),
        item('M', '2026-01-01T00:00:00Z', 'earlier'),
      ];
      items.sort(FractionalIndexer.compare);
      expect(items.map((i) => i.id)).toEqual(['earlier', 'later']);
    });

    it('breaks position_idx + created_at ties by id (uuid) ascending', () => {
      const ts = '2026-01-01T00:00:00Z';
      const items = [
        item('M', ts, 'ffffffff-0000-0000-0000-000000000000'),
        item('M', ts, '00000000-0000-0000-0000-000000000000'),
      ];
      items.sort(FractionalIndexer.compare);
      expect(items.map((i) => i.id)).toEqual([
        '00000000-0000-0000-0000-000000000000',
        'ffffffff-0000-0000-0000-000000000000',
      ]);
    });

    it('is a total order (returns 0 only for fully equal items)', () => {
      const a = item('M', '2026-01-01T00:00:00Z', 'same');
      const b = item('M', '2026-01-01T00:00:00Z', 'same');
      expect(FractionalIndexer.compare(a, b)).toBe(0);
    });

    it('keeps a strict weak ordering when created_at is an invalid date', () => {
      const items = [
        item('M', 'not-a-date', 'b'),
        item('M', '2026-01-01T00:00:00Z', 'a'),
      ];
      // Must not throw and must produce a stable, consistent order.
      expect(() => items.sort(FractionalIndexer.compare)).not.toThrow();
      // Invalid date collapses to epoch 0, so it sorts before the 2026 item.
      expect(items.map((i) => i.id)).toEqual(['b', 'a']);
    });

    it('accepts Date and epoch-ms created_at values', () => {
      const items: OrderableItem[] = [
        {
          positionIdx: 'M',
          createdAt: new Date('2026-01-02T00:00:00Z'),
          id: 'b',
        },
        {
          positionIdx: 'M',
          createdAt: Date.parse('2026-01-01T00:00:00Z'),
          id: 'a',
        },
      ];
      items.sort(FractionalIndexer.compare);
      expect(items.map((i) => i.id)).toEqual(['a', 'b']);
    });
  });

  describe('custom alphabet', () => {
    it('works with a small ordered alphabet and honours a custom seed', () => {
      const binary = new FractionalIndexer('01', '1');
      expect(binary.getIntermediateKey(null, null)).toBe('1');
      const mid = binary.getIntermediateKey('1', null);
      assertBetween('1', mid, null);
      expect(binary.isValidKey(mid)).toBe(true);
    });

    it('rejects an unsorted alphabet', () => {
      expect(() => new FractionalIndexer('ba')).toThrow(/sorted ascending/);
    });

    it('rejects an alphabet with duplicate characters', () => {
      expect(() => new FractionalIndexer('aab')).toThrow(/duplicate character/);
    });
  });
});

// --- test helpers ----------------------------------------------------------

function isSortedAscending(keys: readonly string[]): boolean {
  for (let i = 1; i < keys.length; i++) {
    if (!(keys[i - 1] < keys[i])) return false;
  }
  return true;
}

/** Deterministic PRNG (mulberry32) so the fuzz test is reproducible. */
function makeSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
