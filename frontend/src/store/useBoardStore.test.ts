import { afterEach, describe, expect, it } from 'vitest';
import { useBoardStore } from './useBoardStore';
import { setPersistFailureRate } from './persistence';

afterEach(() => setPersistFailureRate(0));

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
});
