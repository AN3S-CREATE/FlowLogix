/**
 * Last-Writer-Wins Element Set (LWW-Element-Set).
 *
 * Two grow-only maps of `element -> latest timestamp`: one for adds, one for
 * removes. An element is a member iff its newest add stamp beats its newest
 * remove stamp. Merge is the element-wise max of both maps, so the structure is
 * a state-based CRDT: merges are commutative, associative, and idempotent, and
 * every replica converges regardless of message order or duplication.
 *
 * Used for set-valued fields on the board (e.g. a card's assignee ids) and,
 * conceptually, for the membership of cards within a list.
 *
 * `bias` decides ties where an element's add and remove stamps are exactly
 * equal. `'remove'` (the default) makes deletions win on a tie — the safer
 * choice for a Kanban, so a card isn't resurrected by a concurrent add that
 * happens to share a timestamp with its deletion.
 */
export type SetBias = 'add' | 'remove';

export interface LwwElementSetState<T extends string> {
  adds: Record<T, number>;
  removes: Record<T, number>;
  bias: SetBias;
}

export class LwwElementSet<T extends string = string> {
  private adds = new Map<T, number>();
  private removes = new Map<T, number>();

  constructor(private readonly bias: SetBias = 'remove') {}

  /** Record that `element` was added at `timestamp` (keeps the max seen). */
  add(element: T, timestamp: number): this {
    this.bump(this.adds, element, timestamp);
    return this;
  }

  /** Record that `element` was removed at `timestamp` (keeps the max seen). */
  remove(element: T, timestamp: number): this {
    this.bump(this.removes, element, timestamp);
    return this;
  }

  /** Membership test under the LWW rule + configured tie bias. */
  has(element: T): boolean {
    const added = this.adds.get(element);
    if (added === undefined) return false;
    const removed = this.removes.get(element);
    if (removed === undefined) return true;
    if (added === removed) return this.bias === 'add';
    return added > removed;
  }

  /** All currently-present members, in stable sorted order. */
  values(): T[] {
    const present: T[] = [];
    for (const element of this.adds.keys()) {
      if (this.has(element)) present.push(element);
    }
    return present.sort();
  }

  /**
   * Fold another set into this one (element-wise max on both maps). Idempotent
   * and order-independent — the heart of the CRDT convergence guarantee.
   */
  merge(other: LwwElementSet<T>): this {
    for (const [el, ts] of other.adds) this.bump(this.adds, el, ts);
    for (const [el, ts] of other.removes) this.bump(this.removes, el, ts);
    return this;
  }

  /** Serialisable snapshot for persistence / transport. */
  toJSON(): LwwElementSetState<T> {
    return {
      adds: Object.fromEntries(this.adds) as Record<T, number>,
      removes: Object.fromEntries(this.removes) as Record<T, number>,
      bias: this.bias,
    };
  }

  static fromJSON<T extends string>(
    state: LwwElementSetState<T>,
  ): LwwElementSet<T> {
    const set = new LwwElementSet<T>(state.bias);
    for (const [el, ts] of Object.entries(state.adds)) {
      set.add(el as T, ts as number);
    }
    for (const [el, ts] of Object.entries(state.removes)) {
      set.remove(el as T, ts as number);
    }
    return set;
  }

  private bump(map: Map<T, number>, element: T, timestamp: number): void {
    const current = map.get(element);
    if (current === undefined || timestamp > current) {
      map.set(element, timestamp);
    }
  }
}
