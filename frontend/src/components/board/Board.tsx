import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { useBoardStore } from '../../store/useBoardStore';
import { BoardColumn } from './BoardColumn';

/**
 * Top-level board surface. Owns the drag context and translates
 * `@hello-pangea/dnd` drop results into optimistic store moves.
 */
export function Board() {
  const lists = useBoardStore((s) => s.lists);
  const moveCard = useBoardStore((s) => s.moveCard);
  const setDraggingCardId = useBoardStore((s) => s.setDraggingCardId);
  const moveError = useBoardStore((s) => s.moveError);
  const clearMoveError = useBoardStore((s) => s.clearMoveError);

  const onDragStart = (start: { draggableId: string }): void => {
    setDraggingCardId(start.draggableId);
  };

  const onDragEnd = (result: DropResult): void => {
    setDraggingCardId(null);
    const { draggableId, source, destination } = result;
    if (!destination) return;
    // No-op when dropped back in the same slot.
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }
    void moveCard(
      draggableId,
      source.droppableId,
      destination.droppableId,
      destination.index,
    );
  };

  return (
    <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {moveError && (
        <div
          role="alert"
          className="mx-6 mb-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 animate-fade-in"
        >
          <span>
            <span className="font-semibold">Couldn’t move card.</span>{' '}
            {moveError} — the board was restored to its previous order.
          </span>
          <button
            type="button"
            onClick={clearMoveError}
            className="ml-4 flex-none rounded px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex h-full items-start gap-4 overflow-x-auto px-6 pb-6">
        {lists.map((list) => (
          <BoardColumn key={list.id} list={list} />
        ))}
      </div>
    </DragDropContext>
  );
}
