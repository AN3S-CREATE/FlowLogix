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

export const useBoardStore = create<BoardState>((set) => ({
  columns: initialColumns,
  columnOrder: ['todo', 'in-progress', 'done'],
  cards: {},

  addCard: (columnId, title) =>
    set((state) => {
      const id = crypto.randomUUID();
      return {
        cards: { ...state.cards, [id]: { id, title } },
        columns: {
          ...state.columns,
          [columnId]: {
            ...state.columns[columnId],
            cardIds: [...state.columns[columnId].cardIds, id],
          },
        },
      };
    }),

  moveCard: (cardId, from, to, index) =>
    set((state) => {
      const fromCardIds = state.columns[from].cardIds.filter((id) => id !== cardId);
      const toCardIds = [...state.columns[to].cardIds];
      toCardIds.splice(index, 0, cardId);

      return {
        columns: {
          ...state.columns,
          [from]: { ...state.columns[from], cardIds: fromCardIds },
          [to]: { ...state.columns[to], cardIds: toCardIds },
        },
      };
    }),
}));
