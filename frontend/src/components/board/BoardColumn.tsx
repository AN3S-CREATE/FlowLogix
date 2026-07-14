import { useState } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Card, List } from '../../store/types';
import { useBoardStore } from '../../store/useBoardStore';
import { CardTile } from './CardTile';
import { VERALOGIX } from '../../brand/colors';

interface BoardColumnProps {
  list: List;
}

/** A list container (Cool Light Grey) holding its draggable cards. */
export function BoardColumn({ list }: BoardColumnProps) {
  const cards = useBoardStore((s) => s.cards);
  const addCard = useBoardStore((s) => s.addCard);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const submit = () => {
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

      <Droppable droppableId={list.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={
              'flex-1 space-y-2 overflow-y-auto rounded-lg px-2 py-2 transition-colors ' +
              (snapshot.isDraggingOver ? 'bg-veralogix-lime/5' : '')
            }
            // Active placeholder highlight: a 2px solid lime boundary on the
            // drop target while a card hovers over it.
            style={{
              border: snapshot.isDraggingOver
                ? `2px solid ${VERALOGIX.lime}`
                : '2px solid transparent',
            }}
          >
            {/*
              Draggable indices must be consecutive integers starting at 0, so
              drop any ids missing from the store *before* mapping to an index
              rather than returning null mid-map (which would leave gaps).
            */}
            {list.cardIds
              .map((cardId) => cards[cardId])
              .filter((card): card is Card => Boolean(card))
              .map((card, index) => (
                <Draggable key={card.id} draggableId={card.id} index={index}>
                  {(dp, ds) => (
                    <div
                      ref={dp.innerRef}
                      {...dp.draggableProps}
                      style={{
                        ...dp.draggableProps.style,
                        // Source card drops to 40% opacity while being dragged.
                        opacity: ds.isDragging ? 0.4 : 1,
                      }}
                      className={
                        'rounded-lg ' +
                        (ds.isDragging ? 'ring-2 ring-veralogix-lime' : '')
                      }
                    >
                      <CardTile
                        card={card}
                        isDragging={ds.isDragging}
                        dragHandleProps={dp.dragHandleProps}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      <div className="px-2 pb-3 pt-1">
        {adding ? (
          <div className="rounded-lg bg-white p-2 shadow-card">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  // Don't submit mid-IME composition (e.g. CJK input), where
                  // Enter confirms the candidate rather than the card.
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
