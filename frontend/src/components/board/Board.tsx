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
  const needsResync = useBoardStore((s) => s.needsResync);
  const clearNeedsResync = useBoardStore((s) => s.clearNeedsResync);

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
      {needsResync && (
        <div
          role="status"
          className="mx-6 mb-3 flex items-center justify-between rounded-lg border border-veralogix-lime/40 bg-veralogix-lime/10 px-4 py-2 text-sm text-veralogix-charcoal animate-fade-in"
        >
          <span>
            <span className="font-semibold">Board updated.</span> A teammate
            made a change that needs a refresh to show.
          </span>
          <div className="ml-4 flex flex-none items-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded bg-veralogix-lime px-2.5 py-0.5 text-xs font-semibold text-veralogix-charcoal transition-colors hover:bg-veralogix-lime-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-veralogix-lime focus-visible:ring-offset-1"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={clearNeedsResync}
              className="rounded px-2 py-0.5 text-xs font-medium text-veralogix-charcoal/60 hover:bg-veralogix-charcoal/5"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

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
