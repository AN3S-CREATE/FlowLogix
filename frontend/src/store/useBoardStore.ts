import { create } from 'zustand';
import { BoardSummary, Card, Id, List, Member } from './types';
import { seedBoard, seedCards, seedLists, seedMembers } from './seed';
import { persistCardMove } from './persistence';
import { reconcileRemoteMutation } from './remoteMutations';
import { BoardConnectionStatus, BoardMutationEnvelope } from '../realtime/types';

interface BoardSlice {
  board: BoardSummary;
  lists: List[];
  cards: Record<Id, Card>;
  addCard: (listId: Id, title: string) => void;
  toggleChecklistItem: (cardId: Id, itemId: Id) => void;
  /**
   * Moves a card optimistically (state updates before the network call) and
   * rolls the ordering back if persistence fails.
   */
  moveCard: (
    cardId: Id,
    fromListId: Id,
    toListId: Id,
    toIndex: number,
  ) => Promise<void>;
  /**
   * Reconcile a live board frame broadcast by a peer. Structural frames
   * (move/delete) apply directly; content frames the lightweight delta can't
   * hydrate flip `needsResync` so the UI can prompt a refetch.
   */
  applyRemoteMutation: (envelope: BoardMutationEnvelope) => void;
}

interface MembersSlice {
  members: Record<Id, Member>;
  memberList: () => Member[];
}

interface UiSlice {
  /** Card id currently being dragged, or null. Drives the 40%-opacity source. */
  draggingCardId: Id | null;
  /** Last move that failed to persist — surfaced as an inline banner. */
  moveError: string | null;
  /** Live connection state, driving the header status pill. */
  connectionStatus: BoardConnectionStatus | 'idle';
  /**
   * A peer made a change (a create/update, or a delta-sync gap) the client
   * can't reconstruct from the lightweight frame — the UI prompts a refetch.
   */
  needsResync: boolean;
  setDraggingCardId: (id: Id | null) => void;
  clearMoveError: () => void;
  setConnectionStatus: (status: BoardConnectionStatus | 'idle') => void;
  markNeedsResync: () => void;
  clearNeedsResync: () => void;
}

export type BoardStore = BoardSlice & MembersSlice & UiSlice;

const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useBoardStore = create<BoardStore>((set, get) => ({
  // --- members slice ---
  members: Object.fromEntries(seedMembers.map((m) => [m.id, m])),
  memberList: () => get().board.memberIds.map((id) => get().members[id]).filter(Boolean),

  // --- ui / drag slice ---
  draggingCardId: null,
  moveError: null,
  connectionStatus: 'idle',
  needsResync: false,
  setDraggingCardId: (id) => set({ draggingCardId: id }),
  clearMoveError: () => set({ moveError: null }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  markNeedsResync: () => set({ needsResync: true }),
  clearNeedsResync: () => set({ needsResync: false }),

  // --- board slice ---
  board: seedBoard,
  lists: seedLists,
  cards: seedCards,

  addCard: (listId, title) =>
    set((state) => {
      const trimmed = title.trim();
      if (!trimmed) return state;
      // Never orphan a card against a list that no longer exists.
      if (!state.lists.some((l) => l.id === listId)) return state;
      const id = createId();
      const card: Card = {
        id,
        title: trimmed,
        priority: 'medium',
        assigneeIds: [],
        checklist: [],
        isComplete: false,
      };
      return {
        cards: { ...state.cards, [id]: card },
        lists: state.lists.map((l) =>
          l.id === listId ? { ...l, cardIds: [...l.cardIds, id] } : l,
        ),
      };
    }),

  toggleChecklistItem: (cardId, itemId) =>
    set((state) => {
      const card = state.cards[cardId];
      if (!card) return state;
      const checklist = card.checklist.map((item) =>
        item.id === itemId ? { ...item, done: !item.done } : item,
      );
      return { cards: { ...state.cards, [cardId]: { ...card, checklist } } };
    }),

  applyRemoteMutation: (envelope) =>
    // Structural frames return a `{ lists, cards }` patch; content/unknown
    // frames return `{ needsResync: true }`. Zustand shallow-merges, so a
    // structural patch leaves any existing `needsResync` flag in place — it
    // stays sticky until the UI clears it.
    set((state) =>
      reconcileRemoteMutation(
        { lists: state.lists, cards: state.cards },
        envelope,
      ),
    ),

  moveCard: async (cardId, fromListId, toListId, toIndex) => {
    // Remember only where *this* card came from, so a failed persist reverts
    // just this move — a global snapshot would clobber other concurrent moves.
    const fromBefore = get().lists.find((l) => l.id === fromListId);
    const originalIndex = fromBefore ? fromBefore.cardIds.indexOf(cardId) : -1;
    if (originalIndex === -1) return;
    // Snapshot the server key too: the optimistic set clears it, and a failed
    // persist must restore it so the reverted card stays a valid ordering
    // reference for a later peer `card.moved`.
    const originalPositionIdx = get().cards[cardId]?.positionIdx;

    // Optimistic update — render the card in the target position immediately.
    set((state) => {
      const lists = state.lists.map((l) => ({ ...l, cardIds: [...l.cardIds] }));
      const from = lists.find((l) => l.id === fromListId);
      const to = lists.find((l) => l.id === toListId);
      if (!from || !to) return state;
      const currentIndex = from.cardIds.indexOf(cardId);
      if (currentIndex === -1) return state;
      from.cardIds.splice(currentIndex, 1);
      to.cardIds.splice(toIndex, 0, cardId);
      // Drop the card's stale server key: its new slot is defined by array order
      // until the backend echoes a fresh fractional key. Leaving the old key
      // could misplace a later peer `card.moved` that compares against it.
      const moved = state.cards[cardId];
      const cards =
        moved && moved.positionIdx !== undefined
          ? { ...state.cards, [cardId]: { ...moved, positionIdx: undefined } }
          : state.cards;
      return { lists, cards, moveError: null };
    });

    try {
      await persistCardMove({ cardId, fromListId, toListId, toIndex });
    } catch (err) {
      // Targeted rollback: pull the card back out of the target list and drop
      // it at its original index, leaving any other cards' moves untouched.
      set((state) => {
        // The optimistic move cleared this card's key. If it's re-keyed (or the
        // card is gone) by the time the persist rejects, a peer's `card.moved`
        // (or delete) landed while we were in flight — that's a confirmed,
        // authoritative change, so surface the error without clobbering it.
        const current = state.cards[cardId];
        if (!current || current.positionIdx !== undefined) {
          return { moveError: err instanceof Error ? err.message : 'Move failed' };
        }
        const lists = state.lists.map((l) => ({ ...l, cardIds: [...l.cardIds] }));
        const from = lists.find((l) => l.id === fromListId);
        const to = lists.find((l) => l.id === toListId);
        if (!from || !to) return state;
        const currentIndex = to.cardIds.indexOf(cardId);
        if (currentIndex !== -1) {
          to.cardIds.splice(currentIndex, 1);
          from.cardIds.splice(originalIndex, 0, cardId);
        }
        // Restore the server key the optimistic move cleared — but only when we
        // actually reverted the list position. If `currentIndex === -1` the card
        // was moved again before this persist failed, so restoring the old key
        // would clobber the newer in-flight move's cleared state.
        const cards =
          currentIndex !== -1 && originalPositionIdx !== undefined
            ? {
                ...state.cards,
                [cardId]: { ...current, positionIdx: originalPositionIdx },
              }
            : state.cards;
        return {
          lists,
          cards,
          moveError: err instanceof Error ? err.message : 'Move failed',
        };
      });
    }
  },
}));
