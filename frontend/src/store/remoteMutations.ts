import { BoardMutationEnvelope } from '../realtime/types';
import { Card, Id, List } from './types';

/**
 * Pure reconciliation of an inbound real-time frame against the local board.
 *
 * The server broadcasts *lightweight* deltas (ids + a fractional key), never
 * whole entities (`.cursorrules` §4). That splits the mutation kinds in two:
 *
 *  - **Structural** (`card.moved`, `card.deleted`, `list.deleted`) carry
 *    everything needed to reconcile, so they apply directly to local state.
 *  - **Content** (`*.created`, `card.updated`, `list.updated`) can't be
 *    rendered from ids alone — the title/body isn't in the frame — so they set
 *    `needsResync`, the honest signal for "refetch the board to catch up."
 *    (When a REST hydration client lands, these become targeted fetches.)
 *
 * A frame referencing an unknown card/list also asks for a resync rather than
 * guessing. The function is pure: it returns the patch to merge, never mutates.
 */
export interface BoardState {
  lists: List[];
  cards: Record<Id, Card>;
}

export interface ReconcilePatch {
  lists?: List[];
  cards?: Record<Id, Card>;
  /** True when the frame can't be applied from the delta and a refetch is due. */
  needsResync?: boolean;
}

/**
 * Index at which a card carrying `key` should sit among `orderedCardIds` so the
 * list stays ordered by fractional key. Siblings without a key keep their array
 * position; the keyed card slots in before the first keyed sibling that sorts
 * greater (Base62 keys compare correctly as plain strings). `orderedCardIds`
 * must already exclude the moved card.
 */
export function insertionIndexForKey(
  orderedCardIds: Id[],
  cards: Record<Id, Card>,
  key: string,
): number {
  for (let i = 0; i < orderedCardIds.length; i++) {
    const sibling = cards[orderedCardIds[i]];
    if (sibling?.positionIdx !== undefined && key < sibling.positionIdx) {
      return i;
    }
  }
  return orderedCardIds.length;
}

export function reconcileRemoteMutation(
  state: BoardState,
  envelope: BoardMutationEnvelope,
): ReconcilePatch {
  const { type, payload } = envelope;

  switch (type) {
    case 'card.moved': {
      const { cardId, listId, positionIdx } = payload;
      // A move frame with no target key is malformed/unplaceable — the backend
      // owns ordering, so resync rather than guessing a slot (falling back to
      // an empty key would silently drop the card at index 0).
      if (!cardId || !listId || positionIdx === undefined) {
        return { needsResync: true };
      }
      const card = state.cards[cardId];
      const target = state.lists.find((l) => l.id === listId);
      // We can't place a card we've never seen, or into a list we don't have.
      if (!card || !target) return { needsResync: true };

      // Rebuild every list's cardIds immutably: drop the card wherever it is,
      // then splice it into the target at its key-ordered position.
      const withoutCard = state.lists.map((l) => ({
        ...l,
        cardIds: l.cardIds.filter((id) => id !== cardId),
      }));
      const targetAfter = withoutCard.find((l) => l.id === listId);
      // Non-null: target existed above and filtering preserves list identity.
      const index = insertionIndexForKey(
        targetAfter!.cardIds,
        state.cards,
        positionIdx,
      );
      const lists = withoutCard.map((l) =>
        l.id === listId
          ? {
              ...l,
              cardIds: [
                ...l.cardIds.slice(0, index),
                cardId,
                ...l.cardIds.slice(index),
              ],
            }
          : l,
      );
      const cards = { ...state.cards, [cardId]: { ...card, positionIdx } };
      return { lists, cards };
    }

    case 'card.deleted': {
      const { cardId } = payload;
      if (!cardId || !state.cards[cardId]) return {};
      const lists = state.lists.map((l) =>
        l.cardIds.includes(cardId)
          ? { ...l, cardIds: l.cardIds.filter((id) => id !== cardId) }
          : l,
      );
      const cards = { ...state.cards };
      delete cards[cardId];
      return { lists, cards };
    }

    case 'list.deleted': {
      const { listId } = payload;
      if (!listId) return {};
      const removed = state.lists.find((l) => l.id === listId);
      if (!removed) return {};
      const lists = state.lists.filter((l) => l.id !== listId);
      // Drop the deleted list's cards so they don't linger as orphans.
      const cards = { ...state.cards };
      for (const id of removed.cardIds) delete cards[id];
      return { lists, cards };
    }

    // Content mutations: the delta lacks the title/body, so we can't render
    // them — ask the UI to refetch instead of showing a half-populated card.
    case 'card.created':
    case 'card.updated':
    case 'list.created':
    case 'list.updated':
      return { needsResync: true };

    default:
      return { needsResync: true };
  }
}
