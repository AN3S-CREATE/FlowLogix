import { afterEach, describe, expect, it } from 'vitest';
import { useBoardStore } from './useBoardStore';
import { setPersistFailureRate } from './persistence';
import { BoardMutationEnvelope } from '../realtime/types';

afterEach(() => setPersistFailureRate(0));

function movedFrame(
  cardId: string,
  listId: string,
  positionIdx: string,
): BoardMutationEnvelope {
  return {
    seq: 1,
    boardId: 'b1',
    type: 'card.moved',
    payload: { cardId, listId, positionIdx },
    ts: Date.now(),
  };
}

describe('moveCard rollback', () => {
  it('restores both the list position and the server key when persist fails', async () => {
    setPersistFailureRate(1);
    const store = useBoardStore.getState();
    // Seed: c1 sits in l2 at index 0 with server key 'a0'.
    expect(store.cards.c1.positionIdx).toBe('a0');

    await store.moveCard('c1', 'l2', 'l1', 0);

    const after = useBoardStore.getState();
    const l1 = after.lists.find((l) => l.id === 'l1')!;
    const l2 = after.lists.find((l) => l.id === 'l2')!;
    // Reverted to its original list/slot…
    expect(l2.cardIds).toEqual(['c1', 'c5']);
    expect(l1.cardIds).not.toContain('c1');
    // …with its server key restored (not left undefined)…
    expect(after.cards.c1.positionIdx).toBe('a0');
    // …and the failure surfaced.
    expect(after.moveError).toBeTruthy();
  });

  it('does not clobber a peer move that landed while the persist was in flight', async () => {
    setPersistFailureRate(1);
    const store = useBoardStore.getState();

    // Start the (doomed) move — the optimistic update runs synchronously.
    const pending = store.moveCard('c1', 'l2', 'l1', 0);
    // A peer's confirmed card.moved arrives before our persist rejects: it
    // re-keys c1 (which we had cleared) and repositions it.
    useBoardStore.getState().applyRemoteMutation(movedFrame('c1', 'l1', 'z9'));
    await pending;

    const after = useBoardStore.getState();
    // The peer's move stands — not rolled back to l2 or re-keyed to 'a0'.
    expect(after.cards.c1.positionIdx).toBe('z9');
    expect(after.lists.find((l) => l.id === 'l1')!.cardIds).toContain('c1');
    expect(after.lists.find((l) => l.id === 'l2')!.cardIds).not.toContain('c1');
    expect(after.moveError).toBeTruthy();
  });

  it('a failed move does not corrupt a second in-flight move of the same card', async () => {
    setPersistFailureRate(1);
    const s = useBoardStore.getState();
    // Two optimistic moves of c1 back-to-back, both destined to fail.
    const p1 = s.moveCard('c1', 'l2', 'l1', 0); // l2 -> l1
    const p2 = useBoardStore.getState().moveCard('c1', 'l1', 'l3', 0); // l1 -> l3
    await Promise.all([p1, p2]);

    const after = useBoardStore.getState();
    // The first rollback must not clobber the second move's state: c1 stays in
    // exactly one list (never duplicated or lost) and the second move rolls back.
    const appearances = after.lists.filter((l) =>
      l.cardIds.includes('c1'),
    ).length;
    expect(appearances).toBe(1);
    expect(after.lists.find((l) => l.id === 'l1')!.cardIds).toContain('c1');
    expect(after.moveError).toBeTruthy();
  });
});
