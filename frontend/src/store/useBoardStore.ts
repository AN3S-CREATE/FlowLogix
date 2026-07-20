import { create } from 'zustand';
import { BoardSummary, Card, Id, List, Member } from './types';
import { seedBoard, seedCards, seedLists, seedMembers } from './seed';
import { persistCardMove } from './persistence';
import { reconcileRemoteMutation } from './remoteMutations';
import { BoardConnectionStatus, BoardMutationEnvelope } from '../realtime/types';
import { BoardSnapshot } from '../api/mapBoard';
import { isApiMode } from '../api/config';
import { apiCreateCard, fetchBoardSnapshot } from '../api/boardLoader';
import { mapApiCard } from '../api/mapBoard';

interface BoardSlice {
  board: BoardSummary;
  lists: List[];
  cards: Record<Id, Card>;
  /**
   * Per-card monotonic move token. Each optimistic move — and each peer
   * `card.moved`/`card.deleted` — bumps it; a failed move only rolls back when
   * its token is still the latest, so concurrent moves of the same card (in the
   * same list or across lists) never clobber one another.
   */
  moveVersions: Record<Id, number>;
  /** Replace local board state from a REST snapshot (hydrate / resync). */
  hydrateBoard: (snapshot: BoardSnapshot) => void;
  /**
   * Re-fetch the active board from the API and clear `needsResync`.
   * No-op when API mode is off.
   */
  refetchBoard: () => Promise<void>;
  addCard: (listId: Id, title: string) => Promise<void>;
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
  /** True while the initial / targeted board fetch is in flight. */
  boardLoading: boolean;
  boardLoadError: string | null;
  setDraggingCardId: (id: Id | null) => void;
  clearMoveError: () => void;
  setConnectionStatus: (status: BoardConnectionStatus | 'idle') => void;
  markNeedsResync: () => void;
  clearNeedsResync: () => void;
  setBoardLoading: (loading: boolean) => void;
  setBoardLoadError: (message: string | null) => void;
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
  boardLoading: false,
  boardLoadError: null,
  setDraggingCardId: (id) => set({ draggingCardId: id }),
  clearMoveError: () => set({ moveError: null }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  markNeedsResync: () => set({ needsResync: true }),
  clearNeedsResync: () => set({ needsResync: false }),
  setBoardLoading: (boardLoading) => set({ boardLoading }),
  setBoardLoadError: (boardLoadError) => set({ boardLoadError }),

  // --- board slice ---
  board: seedBoard,
  lists: seedLists,
  cards: seedCards,
  moveVersions: {},

  hydrateBoard: (snapshot) =>
    set({
      board: snapshot.board,
      lists: snapshot.lists,
      cards: snapshot.cards,
      members: snapshot.members,
      moveVersions: {},
      needsResync: false,
      moveError: null,
      boardLoadError: null,
      boardLoading: false,
    }),

  refetchBoard: async () => {
    if (!isApiMode()) {
      set({ needsResync: false });
      return;
    }
    const boardId = get().board.id;
    set({ boardLoading: true, boardLoadError: null });
    try {
      const snapshot = await fetchBoardSnapshot(boardId);
      get().hydrateBoard(snapshot);
    } catch (err) {
      set({
        boardLoading: false,
        boardLoadError:
          err instanceof Error ? err.message : 'Failed to refresh board',
      });
    }
  },

  addCard: async (listId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (!get().lists.some((l) => l.id === listId)) return;

    if (!isApiMode()) {
      const id = createId();
      const card: Card = {
        id,
        title: trimmed,
        priority: 'medium',
        assigneeIds: [],
        checklist: [],
        isComplete: false,
      };
      set((state) => ({
        cards: { ...state.cards, [id]: card },
        lists: state.lists.map((l) =>
          l.id === listId ? { ...l, cardIds: [...l.cardIds, id] } : l,
        ),
      }));
      return;
    }

    const tempId = createId();
    const optimistic: Card = {
      id: tempId,
      title: trimmed,
      priority: 'medium',
      assigneeIds: [],
      checklist: [],
      isComplete: false,
    };
    set((state) => ({
      cards: { ...state.cards, [tempId]: optimistic },
      lists: state.lists.map((l) =>
        l.id === listId ? { ...l, cardIds: [...l.cardIds, tempId] } : l,
      ),
      moveError: null,
    }));

    try {
      const created = await apiCreateCard(listId, trimmed);
      const mapped = mapApiCard(created);
      set((state) => {
        const { [tempId]: _removed, ...rest } = state.cards;
        return {
          cards: { ...rest, [mapped.id]: mapped },
          lists: state.lists.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  cardIds: l.cardIds.map((id) =>
                    id === tempId ? mapped.id : id,
                  ),
                }
              : l,
          ),
        };
      });
    } catch (err) {
      set((state) => {
        const { [tempId]: _removed, ...rest } = state.cards;
        return {
          cards: rest,
          lists: state.lists.map((l) =>
            l.id === listId
              ? { ...l, cardIds: l.cardIds.filter((id) => id !== tempId) }
              : l,
          ),
          moveError:
            err instanceof Error ? err.message : 'Failed to create card',
        };
      });
    }
  },

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
    set((state) => {
      // Structural frames return a `{ lists, cards }` patch; content/unknown
      // frames return `{ needsResync: true }`. Zustand shallow-merges, so a
      // structural patch leaves any existing `needsResync` flag in place — it
      // stays sticky until the UI clears it.
      const patch = reconcileRemoteMutation(
        { lists: state.lists, cards: state.cards },
        envelope,
      );
      // A peer's card.moved/delete is authoritative — bump that card's move
      // version so any local move of it still in flight won't roll back over it.
      const cardId = envelope.payload.cardId;
      if (
        cardId &&
        (envelope.type === 'card.moved' || envelope.type === 'card.deleted')
      ) {
        return {
          ...patch,
          moveVersions: {
            ...state.moveVersions,
            [cardId]: (state.moveVersions[cardId] ?? 0) + 1,
          },
        };
      }
      return patch;
    }),

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
    // Tag this move with a per-card version. A later move of the same card
    // (local, or a peer's card.moved/delete) bumps it; on failure we only roll
    // back if ours is still the latest, so we never clobber a newer move —
    // whether it reorders within the same list or moves to another.
    const version = (get().moveVersions[cardId] ?? 0) + 1;
    set((state) => ({
      moveVersions: { ...state.moveVersions, [cardId]: version },
    }));

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

    const target = get().lists.find((l) => l.id === toListId);
    const idx = target ? target.cardIds.indexOf(cardId) : -1;
    const beforeCardId =
      idx > 0 && target ? target.cardIds[idx - 1] : undefined;
    const afterCardId =
      idx >= 0 && target && idx < target.cardIds.length - 1
        ? target.cardIds[idx + 1]
        : undefined;

    try {
      const result = await persistCardMove({
        cardId,
        fromListId,
        toListId,
        toIndex,
        beforeCardId,
        afterCardId,
      });
      // Stamp the server-minted key so later peer moves / local reorders have a
      // valid ordering reference (WS card.moved frames also re-key).
      if (result.positionIdx !== undefined) {
        set((state) => {
          const current = state.cards[cardId];
          if (!current || state.moveVersions[cardId] !== version) return state;
          return {
            cards: {
              ...state.cards,
              [cardId]: { ...current, positionIdx: result.positionIdx },
            },
          };
        });
      }
    } catch (err) {
      // Targeted rollback: pull the card back out of the target list and drop
      // it at its original index, leaving any other cards' moves untouched.
      set((state) => {
        const current = state.cards[cardId];
        // Only the latest move for this card may roll back. A newer local move
        // or a peer's card.moved/delete bumps the version; the card being gone
        // means a peer deleted it. In any of those cases this stale rollback is
        // skipped so it can't clobber the newer, authoritative state.
        if (!current || state.moveVersions[cardId] !== version) {
          return { moveError: err instanceof Error ? err.message : 'Move failed' };
        }
        const lists = state.lists.map((l) => ({ ...l, cardIds: [...l.cardIds] }));
        const from = lists.find((l) => l.id === fromListId);
        const to = lists.find((l) => l.id === toListId);
        if (!from || !to) {
          return { moveError: err instanceof Error ? err.message : 'Move failed' };
        }
        const currentIndex = to.cardIds.indexOf(cardId);
        if (currentIndex !== -1) {
          to.cardIds.splice(currentIndex, 1);
          from.cardIds.splice(originalIndex, 0, cardId);
        }
        // Restore the server key the optimistic move cleared, so the reverted
        // card stays a valid ordering reference for a later peer `card.moved`.
        const cards =
          originalPositionIdx !== undefined
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
