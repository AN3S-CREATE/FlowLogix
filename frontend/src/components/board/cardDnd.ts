/** Shared drag payload for board cards (Atlaskit pragmatic-drag-and-drop). */

export const cardDragType = 'flowlogix-card' as const;

export interface CardDragData {
  type: typeof cardDragType;
  cardId: string;
  listId: string;
  index: number;
}

export const listDropType = 'flowlogix-list' as const;

export interface ListDropData {
  type: typeof listDropType;
  listId: string;
}

export function isCardDragData(
  data: Record<string | symbol, unknown>,
): boolean {
  return data.type === cardDragType;
}

export function isListDropData(
  data: Record<string | symbol, unknown>,
): boolean {
  return data.type === listDropType;
}

export function asCardDragData(
  data: Record<string | symbol, unknown>,
): CardDragData | null {
  if (!isCardDragData(data)) return null;
  return {
    type: cardDragType,
    cardId: String(data.cardId),
    listId: String(data.listId),
    index: Number(data.index),
  };
}

export function asListDropData(
  data: Record<string | symbol, unknown>,
): ListDropData | null {
  if (!isListDropData(data)) return null;
  return {
    type: listDropType,
    listId: String(data.listId),
  };
}
