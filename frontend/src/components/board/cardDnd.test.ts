import { describe, expect, it } from 'vitest';
import {
  cardDragType,
  isCardDragData,
  isListDropData,
  listDropType,
} from './cardDnd';

describe('cardDnd type guards', () => {
  it('recognizes card drag payloads', () => {
    expect(
      isCardDragData({
        type: cardDragType,
        cardId: 'c1',
        listId: 'l1',
        index: 0,
      }),
    ).toBe(true);
    expect(isCardDragData({ type: 'other' })).toBe(false);
  });

  it('recognizes list drop payloads', () => {
    expect(isListDropData({ type: listDropType, listId: 'l1' })).toBe(true);
    expect(isListDropData({ type: cardDragType })).toBe(false);
  });
});
