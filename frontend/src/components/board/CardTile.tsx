import { useEffect, useRef, useState } from 'react';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { Card, CardPriority } from '../../store/types';
import { useBoardStore } from '../../store/useBoardStore';
import { AvatarStack } from './AvatarStack';
import { Checklist } from './Checklist';
import { ProgressBar } from '../ui/ProgressBar';
import { cardDragType, isCardDragData } from './cardDnd';

interface CardTileProps {
  card: Card;
  listId: string;
  index: number;
}

const PRIORITY_LABEL: Record<CardPriority, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

const priorityAccent = (p: CardPriority): string => {
  if (p === 'high') return 'bg-veralogix-lime';
  if (p === 'medium') return 'bg-veralogix-lime/50';
  return 'bg-veralogix-charcoal/15';
};

/** Draggable card surface (Clean White) with a lime priority rail on its left edge. */
export function CardTile({ card, listId, index }: CardTileProps) {
  const toggleChecklistItem = useBoardStore((s) => s.toggleChecklistItem);
  const cardRef = useRef<HTMLElement | null>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = cardRef.current;
    const handle = handleRef.current;
    if (!element || !handle) return;

    return combine(
      draggable({
        element,
        dragHandle: handle,
        getInitialData: (): Record<string | symbol, unknown> => ({
          type: cardDragType,
          cardId: card.id,
          listId,
          index,
        }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          isCardDragData(source.data) && source.data.cardId !== card.id,
        getData: ({ input }) =>
          attachClosestEdge(
            {
              type: cardDragType,
              cardId: card.id,
              listId,
              index,
            },
            { element, input, allowedEdges: ['top', 'bottom'] },
          ),
        onDragEnter: ({ self }) =>
          setClosestEdge(extractClosestEdge(self.data)),
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setClosestEdge(null),
        onDrop: () => setClosestEdge(null),
      }),
    );
  }, [card.id, listId, index]);

  const doneCount = card.checklist.filter((i) => i.done).length;
  const total = card.checklist.length;
  const progress = total > 0 ? doneCount / total : card.isComplete ? 1 : 0;

  return (
    <div className="relative">
      {closestEdge === 'top' && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -top-1 h-0.5 rounded-full bg-veralogix-lime"
        />
      )}
      <article
        ref={cardRef}
        className={
          'relative overflow-hidden rounded-lg bg-veralogix-white shadow-card ' +
          'ring-1 ring-veralogix-charcoal/5 transition-shadow ' +
          (isDragging
            ? 'opacity-40 shadow-card-drag ring-2 ring-veralogix-lime'
            : 'hover:shadow-md')
        }
      >
        <span
          aria-hidden="true"
          className={'absolute inset-y-0 left-0 w-1 ' + priorityAccent(card.priority)}
        />

        <div className="p-3 pl-4">
          <div className="flex items-start gap-2">
            <button
              ref={handleRef}
              type="button"
              aria-label={`Drag card, ${PRIORITY_LABEL[card.priority]}`}
              title={PRIORITY_LABEL[card.priority]}
              className="mt-0.5 flex-none cursor-grab text-veralogix-charcoal/30 transition-colors hover:text-veralogix-lime active:cursor-grabbing focus:outline-none focus-visible:text-veralogix-lime"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <g fill="currentColor">
                  <circle cx="6" cy="4" r="1.3" />
                  <circle cx="10" cy="4" r="1.3" />
                  <circle cx="6" cy="8" r="1.3" />
                  <circle cx="10" cy="8" r="1.3" />
                  <circle cx="6" cy="12" r="1.3" />
                  <circle cx="10" cy="12" r="1.3" />
                </g>
              </svg>
            </button>

            <h3 className="flex-1 text-sm font-medium leading-snug text-veralogix-charcoal">
              {card.title}
            </h3>
          </div>

          {total > 0 && (
            <div className="mt-3">
              <ProgressBar
                value={progress}
                label={`Checklist ${doneCount}/${total}`}
              />
              <Checklist
                items={card.checklist}
                onToggle={(itemId) => toggleChecklistItem(card.id, itemId)}
              />
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <AvatarStack memberIds={card.assigneeIds} size={26} />
            {card.isComplete && (
              <span className="rounded-full bg-veralogix-lime/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-veralogix-lime-hover">
                Done
              </span>
            )}
          </div>
        </div>
      </article>
      {closestEdge === 'bottom' && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-veralogix-lime"
        />
      )}
    </div>
  );
}
