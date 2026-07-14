import { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { Card, CardPriority } from '../../store/types';
import { useBoardStore } from '../../store/useBoardStore';
import { AvatarStack } from './AvatarStack';
import { Checklist } from './Checklist';
import { ProgressBar } from '../ui/ProgressBar';

interface CardTileProps {
  card: Card;
  isDragging: boolean;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
}

const PRIORITY_LABEL: Record<CardPriority, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

// The lime accent flags high-priority work; lower priorities recede.
const priorityAccent = (p: CardPriority): string => {
  if (p === 'high') return 'bg-veralogix-lime';
  if (p === 'medium') return 'bg-veralogix-lime/50';
  return 'bg-veralogix-charcoal/15';
};

/** Draggable card surface (Clean White) with a lime priority rail on its left edge. */
export function CardTile({ card, isDragging, dragHandleProps }: CardTileProps) {
  const toggleChecklistItem = useBoardStore((s) => s.toggleChecklistItem);

  const doneCount = card.checklist.filter((i) => i.done).length;
  const total = card.checklist.length;
  const progress = total > 0 ? doneCount / total : card.isComplete ? 1 : 0;

  return (
    <article
      className={
        'relative overflow-hidden rounded-lg bg-veralogix-white shadow-card ' +
        'ring-1 ring-veralogix-charcoal/5 transition-shadow ' +
        (isDragging ? 'shadow-card-drag' : 'hover:shadow-md')
      }
    >
      {/* Priority rail */}
      <span
        aria-hidden="true"
        className={'absolute inset-y-0 left-0 w-1 ' + priorityAccent(card.priority)}
      />

      <div className="p-3 pl-4">
        <div className="flex items-start gap-2">
          {/* Drag handle — lime on hover/active, per brand spec. */}
          <button
            type="button"
            aria-label={`Drag card, ${PRIORITY_LABEL[card.priority]}`}
            title={PRIORITY_LABEL[card.priority]}
            className="mt-0.5 flex-none cursor-grab text-veralogix-charcoal/30 transition-colors hover:text-veralogix-lime active:cursor-grabbing focus:outline-none focus-visible:text-veralogix-lime"
            {...dragHandleProps}
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
            <ProgressBar value={progress} label={`Checklist ${doneCount}/${total}`} />
            <Checklist items={card.checklist} onToggle={(itemId) => toggleChecklistItem(card.id, itemId)} />
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
  );
}
