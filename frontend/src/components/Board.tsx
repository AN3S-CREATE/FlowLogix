import { useBoardStore } from '../store/useBoardStore';
import { Column } from './Column';

export function Board() {
  const columnOrder = useBoardStore((state) => state.columnOrder);

  return (
    <div className="flex gap-4 overflow-x-auto">
      {columnOrder.map((columnId) => (
        <Column key={columnId} columnId={columnId} />
      ))}
    </div>
  );
}
