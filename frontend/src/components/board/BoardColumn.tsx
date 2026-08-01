import { useEffect, useRef, useState } from 'react';
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Card, List } from '../../store/types';
import { useBoardStore } from '../../store/useBoardStore';
import { CardTile } from './CardTile';
import { isCardDragData, listDropType } from './cardDnd';

interface BoardColumnProps {
  list: List;
}

/** A list container (Cool Light Grey) holding its draggable cards. */
export function BoardColumn({ list }: BoardColumnProps) {
  const cards = useBoardStore((s) => s.cards);
  const addCard = useBoardStore((s) => s.addCard);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = dropRef.current;
    if (!element) return;

    return dropTargetForElements({
      element,
      getData: (): Record<string | symbol, unknown> => ({
        type: listDropType,
        listId: list.id,
      }),
      canDrop: ({ source }) => isCardDragData(source.data),
      onDragEnter: () => setIsDraggingOver(true),
      onDrag: () => setIsDraggingOver(true),
      onDragLeave: () => setIsDraggingOver(false),
      onDrop: () => setIsDraggingOver(false),
    });
  }, [list.id]);

  const submit = (): void => {
    if (draft.trim()) addCard(list.id, draft);
    setDraft('');
    setAdding(false);
  };

  return (
    <section className="flex max-h-full w-72 flex-none flex-col rounded-xl bg-veralogix-grey">
      <header className="flex items-center justify-between px-3 pb-2 pt-3">
        <h2 className="text-sm font-semibold text-veralogix-charcoal">
          {list.title}
        </h2>
        <span className="rounded-full bg-veralogix-charcoal/10 px-2 py-0.5 text-xs font-medium text-veralogix-charcoal/70">
          {list.cardIds.length}
        </span>
      </header>

      <div
        ref={dropRef}
        className={
          'flex-1 space-y-2 overflow-y-auto rounded-lg border-2 px-2 py-2 transition-colors ' +
          (isDraggingOver
            ? 'border-veralogix-lime bg-veralogix-lime/5'
            : 'border-transparent')
        }
      >
        {list.cardIds
          .map((cardId) => cards[cardId])
          .filter((card): card is Card => Boolean(card))
          .map((card, index) => (
            <CardTile
              key={card.id}
              card={card}
              listId={list.id}
              index={index}
            />
          ))}
      </div>

      <div className="px-2 pb-3 pt-1">
        {adding ? (
          <div className="rounded-lg bg-white p-2 shadow-card">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  if (e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  submit();
                }
                if (e.key === 'Escape') {
                  setDraft('');
                  setAdding(false);
                }
              }}
              rows={2}
              placeholder="Card title…"
              aria-label="Card title"
              className="w-full resize-none rounded-md border border-veralogix-charcoal/10 p-2 text-sm text-veralogix-charcoal placeholder:text-veralogix-charcoal/40 focus:border-veralogix-lime focus:outline-none focus:ring-2 focus:ring-veralogix-lime/40"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={submit}
                className="rounded-md bg-veralogix-lime px-3 py-1 text-xs font-semibold text-veralogix-charcoal transition-colors hover:bg-veralogix-lime-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-veralogix-lime focus-visible:ring-offset-1"
              >
                Add card
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft('');
                  setAdding(false);
                }}
                className="text-xs font-medium text-veralogix-charcoal/50 hover:text-veralogix-charcoal"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full rounded-lg border border-dashed border-veralogix-charcoal/20 py-2 text-xs font-medium text-veralogix-charcoal/50 transition-colors hover:border-veralogix-lime hover:text-veralogix-lime-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-veralogix-lime"
          >
            + Add a card
          </button>
        )}
      </div>
    </section>
  );
}
