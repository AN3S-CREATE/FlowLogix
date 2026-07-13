import { useBoardStore } from '../store/useBoardStore';

interface ColumnProps {
  columnId: string;
}

export function Column({ columnId }: ColumnProps) {
  const column = useBoardStore((state) => state.columns[columnId]);
  const cards = useBoardStore((state) => state.cards);
  const addCard = useBoardStore((state) => state.addCard);

  if (!column) return null;

  return (
    <div className="w-72 shrink-0 rounded-lg bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium text-slate-700">{column.title}</h2>
        <span className="text-xs text-slate-400">{column.cardIds.length}</span>
      </div>

      <div className="space-y-2">
        {column.cardIds.map((cardId) => {
          const card = cards[cardId];
          if (!card) return null;
          return (
            <div
              key={cardId}
              className="rounded-md border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700"
            >
              {card.title}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => addCard(columnId, 'New card')}
        className="mt-3 w-full rounded-md border border-dashed border-slate-300 py-1.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700"
      >
        + Add card
      </button>
    </div>
  );
}
