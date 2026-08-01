import { describe, expect, it } from 'vitest';
import {
  insertionIndexForKey,
  reconcileRemoteMutation,
  type BoardState,
} from './remoteMutations';
import { BoardMutationEnvelope, BoardMutationType } from '../realtime/types';
import { Card } from './types';

function card(id: string, positionIdx?: string): Card {
  return {
    id,
    title: id,
    priority: 'medium',
    assigneeIds: [],
    checklist: [],
    isComplete: false,
    positionIdx,
  };
}

function baseState(): BoardState {
  return {
    lists: [
      { id: 'l1', title: 'Backlog', cardIds: ['c1', 'c2'] },
      { id: 'l2', title: 'Doing', cardIds: ['c3'] },
    ],
    cards: {
      c1: card('c1', 'a0'),
      c2: card('c2', 'a2'),
      c3: card('c3', 'a0'),
    },
  };
}

function frame(
  type: BoardMutationType,
  payload: BoardMutationEnvelope['payload'],
  seq = 1,
): BoardMutationEnvelope {
  return { seq, boardId: 'b1', type, payload, ts: Date.now() };
}

describe('insertionIndexForKey', () => {
  const cards = { c1: card('c1', 'a0'), c2: card('c2', 'a2') };

  it('returns the slot before the first greater-keyed sibling', () => {
    expect(insertionIndexForKey(['c1', 'c2'], cards, 'a1')).toBe(1);
    expect(insertionIndexForKey(['c1', 'c2'], cards, 'a0z')).toBe(1);
  });

  it('returns 0 when the key sorts before every sibling', () => {
    expect(insertionIndexForKey(['c1', 'c2'], cards, 'a')).toBe(0);
  });

  it('appends when the key sorts after every sibling', () => {
    expect(insertionIndexForKey(['c1', 'c2'], cards, 'b')).toBe(2);
  });

  it('appends past unkeyed siblings (they are skipped as references)', () => {
    const mixed = { c1: card('c1'), c2: card('c2') };
    expect(insertionIndexForKey(['c1', 'c2'], mixed, 'a1')).toBe(2);
  });
});

describe('reconcileRemoteMutation — card.moved', () => {
  it('moves a card into another list at its key-ordered position', () => {
    const patch = reconcileRemoteMutation(
      baseState(),
      frame('card.moved', { cardId: 'c3', listId: 'l1', positionIdx: 'a1' }),
    );
    const l1 = patch.lists?.find((l) => l.id === 'l1');
    const l2 = patch.lists?.find((l) => l.id === 'l2');
    expect(l1?.cardIds).toEqual(['c1', 'c3', 'c2']); // a0 < a1 < a2
    expect(l2?.cardIds).toEqual([]);
    expect(patch.cards?.c3.positionIdx).toBe('a1');
    expect(patch.needsResync).toBeUndefined();
  });

  it('reorders within the same list', () => {
    const patch = reconcileRemoteMutation(
      baseState(),
      frame('card.moved', { cardId: 'c1', listId: 'l1', positionIdx: 'a3' }),
    );
    // c1 re-keyed to a3 sorts after c2 (a2), so it moves to the end.
    expect(patch.lists?.find((l) => l.id === 'l1')?.cardIds).toEqual([
      'c2',
      'c1',
    ]);
  });

  it('asks for a resync when the card is unknown', () => {
    const patch = reconcileRemoteMutation(
      baseState(),
      frame('card.moved', { cardId: 'ghost', listId: 'l1', positionIdx: 'a1' }),
    );
    expect(patch.needsResync).toBe(true);
    expect(patch.lists).toBeUndefined();
  });

  it('asks for a resync when the target list is unknown', () => {
    const patch = reconcileRemoteMutation(
      baseState(),
      frame('card.moved', { cardId: 'c1', listId: 'lX', positionIdx: 'a1' }),
    );
    expect(patch.needsResync).toBe(true);
  });

  it('asks for a resync when the move frame carries no key', () => {
    const patch = reconcileRemoteMutation(
      baseState(),
      frame('card.moved', { cardId: 'c1', listId: 'l2' }),
    );
    expect(patch.needsResync).toBe(true);
    expect(patch.lists).toBeUndefined();
  });
});

describe('reconcileRemoteMutation — deletes', () => {
  it('removes a deleted card from its list and the map', () => {
    const patch = reconcileRemoteMutation(
      baseState(),
      frame('card.deleted', { cardId: 'c2' }),
    );
    expect(patch.lists?.find((l) => l.id === 'l1')?.cardIds).toEqual(['c1']);
    expect(patch.cards && 'c2' in patch.cards).toBe(false);
  });

  it('is a no-op for an already-absent card', () => {
    const patch = reconcileRemoteMutation(
      baseState(),
      frame('card.deleted', { cardId: 'ghost' }),
    );
    expect(patch).toEqual({});
  });

  it('removes a deleted list and drops its cards', () => {
    const patch = reconcileRemoteMutation(
      baseState(),
      frame('list.deleted', { listId: 'l1' }),
    );
    expect(patch.lists?.map((l) => l.id)).toEqual(['l2']);
    expect(patch.cards && 'c1' in patch.cards).toBe(false);
    expect(patch.cards && 'c2' in patch.cards).toBe(false);
    expect(patch.cards?.c3).toBeDefined();
  });
});

describe('reconcileRemoteMutation — content frames need a resync', () => {
  for (const type of [
    'card.created',
    'card.updated',
    'list.created',
    'list.updated',
  ] as const) {
    it(`flags ${type}`, () => {
      const patch = reconcileRemoteMutation(
        baseState(),
        frame(type, { cardId: 'c1', listId: 'l1' }),
      );
      expect(patch.needsResync).toBe(true);
      expect(patch.lists).toBeUndefined();
    });
  }
});
