import { create } from 'zustand';
import { BoardSummary, Card, Id, List, Member } from './types';
import { seedBoard, seedCards, seedLists, seedMembers } from './seed';
import { persistCardMove } from './persistence';

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
  setDraggingCardId: (id: Id | null) => void;
  clearMoveError: () => void;
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
  setDraggingCardId: (id) => set({ draggingCardId: id }),
  clearMoveError: () => set({ moveError: null }),

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

  moveCard: async (cardId, fromListId, toListId, toIndex) => {
    // Remember only where *this* card came from, so a failed persist reverts
    // just this move — a global snapshot would clobber other concurrent moves.
    const fromBefore = get().lists.find((l) => l.id === fromListId);
    const originalIndex = fromBefore ? fromBefore.cardIds.indexOf(cardId) : -1;
    if (originalIndex === -1) return;

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
      return { lists, moveError: null };
    });

    try {
      await persistCardMove({ cardId, fromListId, toListId, toIndex });
    } catch (err) {
      // Targeted rollback: pull the card back out of the target list and drop
      // it at its original index, leaving any other cards' moves untouched.
      set((state) => {
        const lists = state.lists.map((l) => ({ ...l, cardIds: [...l.cardIds] }));
        const from = lists.find((l) => l.id === fromListId);
        const to = lists.find((l) => l.id === toListId);
        if (!from || !to) return state;
        const currentIndex = to.cardIds.indexOf(cardId);
        if (currentIndex !== -1) {
          to.cardIds.splice(currentIndex, 1);
          from.cardIds.splice(originalIndex, 0, cardId);
        }
        return {
          lists,
          moveError: err instanceof Error ? err.message : 'Move failed',
        };
      });
    }
  },
}));
