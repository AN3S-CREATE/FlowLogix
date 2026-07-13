import { create } from 'zustand';

export type CardId = string;
export type ColumnId = string;

export interface KanbanCard {
  id: CardId;
  title: string;
  description?: string;
}

export interface KanbanColumn {
  id: ColumnId;
  title: string;
  cardIds: CardId[];
}

interface BoardState {
  columns: Record<ColumnId, KanbanColumn>;
  columnOrder: ColumnId[];
  cards: Record<CardId, KanbanCard>;
  addCard: (columnId: ColumnId, title: string) => void;
  moveCard: (cardId: CardId, from: ColumnId, to: ColumnId, index: number) => void;
}

const initialColumns: Record<ColumnId, KanbanColumn> = {
  todo: { id: 'todo', title: 'To Do', cardIds: [] },
  'in-progress': { id: 'in-progress', title: 'In Progress', cardIds: [] },
  done: { id: 'done', title: 'Done', cardIds: [] },
};

function createCardId(): CardId {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useBoardStore = create<BoardState>((set) => ({
  columns: initialColumns,
  columnOrder: ['todo', 'in-progress', 'done'],
  cards: {},

  addCard: (columnId, title) =>
    set((state) => {
      const column = state.columns[columnId];
      if (!column) return state;

      const id = createCardId();
      return {
        cards: { ...state.cards, [id]: { id, title } },
        columns: {
          ...state.columns,
          [columnId]: { ...column, cardIds: [...column.cardIds, id] },
        },
      };
    }),

  moveCard: (cardId, from, to, index) =>
    set((state) => {
      const fromColumn = state.columns[from];
      const toColumn = state.columns[to];
      if (!fromColumn || !toColumn) return state;

      const fromCardIds = fromColumn.cardIds.filter((id) => id !== cardId);
      const toCardIds = from === to ? fromCardIds : [...toColumn.cardIds];
      toCardIds.splice(index, 0, cardId);

      return {
        columns: {
          ...state.columns,
          [from]: { ...fromColumn, cardIds: fromCardIds },
          [to]: { ...toColumn, cardIds: toCardIds },
        },
      };
    }),
}));
