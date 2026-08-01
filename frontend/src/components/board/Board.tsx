import { useEffect } from 'react';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index';
import { useBoardStore } from '../../store/useBoardStore';
import { BoardColumn } from './BoardColumn';
import { isApiMode } from '../../api/config';
import {
  asCardDragData,
  asListDropData,
  isCardDragData,
  isListDropData,
} from './cardDnd';

/**
 * Top-level board surface. Owns the Atlaskit pragmatic-drag-and-drop monitor
 * and translates drops into optimistic store moves.
 */
export function Board() {
  const lists = useBoardStore((s) => s.lists);
  const moveCard = useBoardStore((s) => s.moveCard);
  const setDraggingCardId = useBoardStore((s) => s.setDraggingCardId);
  const moveError = useBoardStore((s) => s.moveError);
  const clearMoveError = useBoardStore((s) => s.clearMoveError);
  const needsResync = useBoardStore((s) => s.needsResync);
  const clearNeedsResync = useBoardStore((s) => s.clearNeedsResync);
  const refetchBoard = useBoardStore((s) => s.refetchBoard);
  const boardLoading = useBoardStore((s) => s.boardLoading);

  useEffect(() => {
    if (!needsResync || !isApiMode()) return;
    void refetchBoard();
  }, [needsResync, refetchBoard]);

  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => isCardDragData(source.data),
      onDragStart: ({ source }) => {
        const card = asCardDragData(source.data);
        if (card) setDraggingCardId(card.cardId);
      },
      onDrop: ({ source, location }) => {
        setDraggingCardId(null);
        const dragged = asCardDragData(source.data);
        if (!dragged) return;

        const targets = location.current.dropTargets;
        if (targets.length === 0) return;

        const { cardId, listId: fromListId, index: startIndex } = dragged;

        const cardTarget = targets.find((t) => isCardDragData(t.data));
        const listTarget = targets.find((t) => isListDropData(t.data));

        let toListId: string;
        let toIndex: number;

        const cardDrop = cardTarget ? asCardDragData(cardTarget.data) : null;
        if (cardDrop) {
          toListId = cardDrop.listId;
          const closestEdge = extractClosestEdge(cardTarget!.data);
          if (fromListId === toListId) {
            toIndex = getReorderDestinationIndex({
              startIndex,
              indexOfTarget: cardDrop.index,
              closestEdgeOfTarget: closestEdge,
              axis: 'vertical',
            });
          } else {
            const targetIndex = cardDrop.index;
            toIndex =
              closestEdge === 'bottom' ? targetIndex + 1 : targetIndex;
          }
        } else {
          const listDrop = listTarget ? asListDropData(listTarget.data) : null;
          if (!listDrop) return;
          toListId = listDrop.listId;
          const destList = lists.find((l) => l.id === toListId);
          toIndex = destList ? destList.cardIds.length : 0;
          if (fromListId === toListId && toIndex > 0) {
            toIndex = Math.max(0, toIndex - 1);
          }
        }

        if (fromListId === toListId && toIndex === startIndex) return;

        void moveCard(cardId, fromListId, toListId, toIndex);
      },
    });
  }, [lists, moveCard, setDraggingCardId]);

  const onRefreshClick = (): void => {
    if (isApiMode()) {
      void refetchBoard();
    } else {
      clearNeedsResync();
      window.location.reload();
    }
  };

  return (
    <>
      {needsResync && (
        <div
          role="status"
          className="mx-6 mb-3 flex items-center justify-between rounded-lg border border-veralogix-lime/40 bg-veralogix-lime/10 px-4 py-2 text-sm text-veralogix-charcoal animate-fade-in"
        >
          <span>
            <span className="font-semibold">Board updated.</span>{' '}
            {isApiMode()
              ? boardLoading
                ? 'Refreshing from the server…'
                : 'A teammate made a change — refreshing…'
              : 'A teammate made a change that needs a refresh to show.'}
          </span>
          <div className="ml-4 flex flex-none items-center gap-2">
            <button
              type="button"
              onClick={onRefreshClick}
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
    </>
  );
}
