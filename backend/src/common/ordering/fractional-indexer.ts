/**
 * FractionalIndexer
 * -----------------
 * Computes lexicographically sortable "position" strings for ordering Kanban
 * lists and cards, so that inserting an item between two neighbours never
 * requires renumbering the rest of the column — you only write the single new
 * key.
 *
 * A position key is a string over an ordered `alphabet` (Base62 by default).
 * Keys are compared with ordinary lexicographic string comparison, which the
 * database can do too (`ORDER BY position_idx ASC`). Between any two adjacent
 * keys the indexer finds a "midpoint" key that sorts strictly between them,
 * appending characters when two neighbours have no character space left
 * between them (e.g. between `b` and `c` it yields `bV`, a key that starts
 * with `b` and therefore sorts after `b` but before `c`).
 *
 * ### The no-trailing-zero invariant
 * Every key this class produces is guaranteed **not** to end in the alphabet's
 * lowest character (`'0'` for Base62). That invariant is load-bearing: it is
 * precisely what guarantees there is *always* room to insert between any two
 * keys. (For example, there is no string strictly between `"1"` and `"10"`, so
 * `"10"` — which ends in `0` — is never a legal key.) `getIntermediateKey`
 * rejects malformed keys that violate the invariant so corruption fails loudly
 * rather than silently producing an un-insertable pair.
 *
 * The midpoint algorithm is the well-known fractional-indexing scheme
 * popularised by Figma / Implementing "generateKeyBetween"
 * (https://observablehq.com/@dgreensp/implementing-fractional-indexing),
 * specialised here to a single fractional part over an arbitrary ordered
 * alphabet.
 */

export const BASE62_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** The minimal shape needed to break ties between colliding position keys. */
export interface OrderableItem {
  /** The fractional-index position string. */
  positionIdx: string;
  /** Creation timestamp — anything `Date`/ISO-string/epoch-ms accepts. */
  createdAt: Date | string | number;
  /** Stable unique id (e.g. the row UUID) — the final, total-order tiebreak. */
  id: string;
}

export class FractionalIndexer {
  private readonly alphabet: string;
  private readonly zero: string;
  private readonly seed: string;
  private readonly rankByChar: ReadonlyMap<string, number>;

  /**
   * @param alphabet Ordered set of characters. Must be non-empty, contain no
   *   duplicates, and be sorted ascending by character so that lexicographic
   *   string order matches digit order. Defaults to Base62.
   * @param seed The key returned when inserting into an empty column
   *   (`getIntermediateKey(null, null)`). Defaults to `'M'` for Base62 — a
   *   human-friendly near-midpoint with ample room on either side. Required if
   *   a custom alphabet does not contain `'M'`.
   */
  constructor(alphabet: string = BASE62_ALPHABET, seed?: string) {
    if (alphabet.length < 2) {
      throw new Error(
        'FractionalIndexer: alphabet must have at least 2 characters',
      );
    }
    const rank = new Map<string, number>();
    for (let i = 0; i < alphabet.length; i++) {
      const char = alphabet[i];
      if (rank.has(char)) {
        throw new Error(
          `FractionalIndexer: duplicate character "${char}" in alphabet`,
        );
      }
      if (i > 0 && alphabet[i - 1] >= char) {
        throw new Error(
          'FractionalIndexer: alphabet must be sorted ascending so that string ' +
            `order matches digit order (offending pair "${alphabet[i - 1]}${char}")`,
        );
      }
      rank.set(char, i);
    }
    this.alphabet = alphabet;
    this.rankByChar = rank;
    this.zero = alphabet[0];

    const resolvedSeed =
      seed ?? (rank.has('M') ? 'M' : alphabet[Math.floor(alphabet.length / 2)]);
    if (resolvedSeed.length !== 1 || !rank.has(resolvedSeed)) {
      throw new Error(
        `FractionalIndexer: seed "${resolvedSeed}" must be a single alphabet character`,
      );
    }
    if (resolvedSeed === this.zero) {
      throw new Error(
        'FractionalIndexer: seed must not be the lowest alphabet character',
      );
    }
    this.seed = resolvedSeed;
  }

  /**
   * Returns a key that sorts strictly between `prev` and `next`.
   *
   * - `(null, null)` — empty column — returns the seed (`'M'` for Base62).
   * - `(prev, null)` — append to the end — returns a key `> prev`.
   * - `(null, next)` — prepend to the front — returns a key `< next`.
   * - `(prev, next)` — insert in the middle — returns a key with
   *   `prev < key < next`.
   *
   * @throws if `prev`/`next` are malformed keys, or if `prev >= next`.
   */
  getIntermediateKey(prev: string | null, next: string | null): string {
    if (prev !== null) this.assertValidKey(prev, 'prev');
    if (next !== null) this.assertValidKey(next, 'next');
    if (prev !== null && next !== null && prev >= next) {
      throw new Error(
        `FractionalIndexer: prev must sort strictly before next (prev="${prev}", next="${next}")`,
      );
    }

    if (prev === null && next === null) {
      return this.seed;
    }

    const key = this.midpoint(prev ?? '', next);

    // Defensive post-condition: the whole point of the class is betweenness.
    if ((prev !== null && key <= prev) || (next !== null && key >= next)) {
      throw new Error(
        `FractionalIndexer: internal error, generated key "${key}" is not strictly ` +
          `between "${prev}" and "${next}"`,
      );
    }
    return key;
  }

  /**
   * Re-index an ordered column back onto evenly spaced, fixed-length keys to
   * prevent key-length bloat that accumulates from many midpoint insertions.
   *
   * Pass either the current number of items or the current (ordered) array of
   * keys — only the count and the intended order matter; the returned keys
   * replace them 1:1 while preserving order. Keys are two characters wide
   * whenever the count fits; larger columns transparently widen to keep at
   * least a two-slot gap between neighbours.
   *
   * @param itemsOrCount Current item count, or the ordered array of keys/items.
   * @param targetLength Optional fixed key width to force (must leave room).
   */
  rebalance(
    itemsOrCount: number | readonly unknown[],
    targetLength?: number,
  ): string[] {
    const count =
      typeof itemsOrCount === 'number' ? itemsOrCount : itemsOrCount.length;
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(
        `FractionalIndexer: rebalance count must be a non-negative integer (got ${count})`,
      );
    }
    if (count === 0) return [];
    if (
      targetLength !== undefined &&
      (!Number.isInteger(targetLength) || targetLength < 2)
    ) {
      throw new Error(
        `FractionalIndexer: targetLength must be an integer >= 2 (got ${targetLength})`,
      );
    }

    const base = this.alphabet.length;
    // We need capacity >= 2 * (count + 1) so that consecutive picks are at least
    // two integer slots apart — that gap is what leaves room to insert between
    // freshly rebalanced neighbours, and lets us nudge off a trailing zero.
    const required = 2 * (count + 1);
    let length = Math.max(2, targetLength ?? 2);
    let capacity = Math.pow(base, length);
    if (targetLength === undefined) {
      while (capacity < required) {
        length++;
        capacity = Math.pow(base, length);
        if (!Number.isSafeInteger(capacity)) {
          throw new Error(
            'FractionalIndexer: rebalance count too large for a safe key space',
          );
        }
      }
    } else {
      // A caller-forced width can also overflow the safe-integer range.
      if (!Number.isSafeInteger(capacity)) {
        throw new Error(
          `FractionalIndexer: targetLength ${targetLength} is too large for a safe key space`,
        );
      }
      if (capacity < required) {
        throw new Error(
          `FractionalIndexer: targetLength ${targetLength} is too small to evenly space ${count} keys`,
        );
      }
    }

    // `(k + 1) * capacity` can exceed Number.MAX_SAFE_INTEGER for very large
    // columns even when `capacity` itself is safe, so do the spacing division in
    // BigInt for exact results. The quotient is <= capacity (a safe integer), so
    // converting back to Number is lossless.
    const capacityBig = BigInt(capacity);
    const gapsBig = BigInt(count + 1);
    const keys: string[] = [];
    let previousValue = -1;
    for (let k = 0; k < count; k++) {
      // Even spacing: drop `count` picks into `count + 1` gaps.
      let value = Number((BigInt(k + 1) * capacityBig) / gapsBig);
      // Preserve the no-trailing-zero invariant. `value % base === 0` means the
      // last digit is the zero char; +1 makes the last digit `1` and stays
      // strictly inside the >=2 gap to the next pick.
      if (value % base === 0) value += 1;
      if (value <= previousValue) value = previousValue + 1;
      previousValue = value;
      keys.push(this.encodeFixed(value, length));
    }
    return keys;
  }

  /** True if `key` is a well-formed position key for this alphabet. */
  isValidKey(key: string): boolean {
    if (typeof key !== 'string' || key.length === 0) return false;
    for (const char of key) {
      if (!this.rankByChar.has(char)) return false;
    }
    return key[key.length - 1] !== this.zero;
  }

  /**
   * Total-order comparator resolving concurrent-insertion collisions: sort by
   * `position_idx` ascending, then `created_at` ascending, then `id` ascending.
   * Mirror this in SQL with `ORDER BY position_idx ASC, created_at ASC, id ASC`.
   */
  static compare(a: OrderableItem, b: OrderableItem): number {
    if (a.positionIdx < b.positionIdx) return -1;
    if (a.positionIdx > b.positionIdx) return 1;

    const ta = FractionalIndexer.toMillis(a.createdAt);
    const tb = FractionalIndexer.toMillis(b.createdAt);
    if (ta < tb) return -1;
    if (ta > tb) return 1;

    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  }

  // --- internals -----------------------------------------------------------

  private rank(char: string): number {
    const r = this.rankByChar.get(char);
    if (r === undefined) {
      throw new Error(
        `FractionalIndexer: character "${char}" is not in the alphabet`,
      );
    }
    return r;
  }

  private assertValidKey(key: string, label: string): void {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error(`FractionalIndexer: ${label} must be a non-empty key`);
    }
    for (const char of key) {
      if (!this.rankByChar.has(char)) {
        throw new Error(
          `FractionalIndexer: ${label} contains character "${char}" not in the alphabet`,
        );
      }
    }
    if (key[key.length - 1] === this.zero) {
      throw new Error(
        `FractionalIndexer: ${label} "${key}" is malformed — keys must not end in "${this.zero}"`,
      );
    }
  }

  /**
   * Returns a string strictly between `a` and `b`, where `a` is a lower bound
   * (`''` = the smallest possible key) and `b` is an upper bound (`null` =
   * unbounded / +infinity). Requires `a < b`.
   */
  private midpoint(a: string, b: string | null): string {
    if (b !== null && a >= b) {
      throw new Error(
        `FractionalIndexer: midpoint precondition violated ("${a}" >= "${b}")`,
      );
    }

    // Copy any shared leading run verbatim, then find the split on the first
    // differing digit. `a` is virtually padded with the zero char past its end.
    if (b !== null) {
      let n = 0;
      while ((a[n] ?? this.zero) === b[n]) n++;
      if (n > 0) {
        return b.slice(0, n) + this.midpoint(a.slice(n), b.slice(n));
      }
    }

    const digitA = a.length > 0 ? this.rank(a[0]) : 0;
    const digitB = b !== null ? this.rank(b[0]) : this.alphabet.length;

    if (digitB - digitA > 1) {
      // There is an integer digit strictly between the two — use its midpoint.
      const mid = Math.round(0.5 * (digitA + digitB));
      return this.alphabet[mid];
    }

    // Digits are consecutive: no room at this position.
    if (b !== null && b.length > 1) {
      // Truncating `b` to its first digit lands strictly between a and b.
      return b.slice(0, 1);
    }
    // `b` is unbounded or a single digit: keep a's leading digit and descend,
    // now with no upper bound (any suffix keeps us below b).
    return this.alphabet[digitA] + this.midpoint(a.slice(1), null);
  }

  /** Encode `value` as a big-endian, zero-padded, fixed-width alphabet string. */
  private encodeFixed(value: number, length: number): string {
    const base = this.alphabet.length;
    const chars = new Array<string>(length);
    let v = value;
    for (let i = length - 1; i >= 0; i--) {
      chars[i] = this.alphabet[v % base];
      v = Math.floor(v / base);
    }
    return chars.join('');
  }

  private static toMillis(value: Date | string | number): number {
    // `Date.parse` avoids allocating a Date per comparison during a sort. Any
    // NaN (invalid date / NaN input) collapses to 0 so the comparator keeps a
    // strict weak ordering — otherwise NaN comparisons break Array.sort.
    let ms: number;
    if (value instanceof Date) ms = value.getTime();
    else if (typeof value === 'number') ms = value;
    else ms = Date.parse(value);
    return Number.isNaN(ms) ? 0 : ms;
  }
}
