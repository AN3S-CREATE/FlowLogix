import { describe, expect, it } from 'vitest';
import { composeBoardSnapshot } from './mapBoard';
import type { ApiBoard, ApiBoardMember, ApiCard, ApiList } from './boardApi';

describe('composeBoardSnapshot', () => {
  const board: ApiBoard = {
    id: 'b1',
    title: 'Demo',
    description: null,
  };

  const lists: ApiList[] = [
    {
      id: 'l2',
      boardId: 'b1',
      title: 'Doing',
      positionIdx: 'a1',
      isArchived: false,
    },
    {
      id: 'l1',
      boardId: 'b1',
      title: 'Todo',
      positionIdx: 'a0',
      isArchived: false,
    },
  ];

  const cardsByList: Record<string, ApiCard[]> = {
    l1: [
      {
        id: 'c2',
        listId: 'l1',
        title: 'Second',
        description: null,
        positionIdx: 'a1',
        isComplete: false,
        isArchived: false,
      },
      {
        id: 'c1',
        listId: 'l1',
        title: 'First',
        description: 'hi',
        positionIdx: 'a0',
        isComplete: false,
        isArchived: false,
      },
    ],
    l2: [],
  };

  const members: ApiBoardMember[] = [
    {
      boardId: 'b1',
      userId: 'u1',
      role: 'owner',
      user: {
        id: 'u1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
      },
    },
  ];

  it('orders lists and cards by positionIdx and maps members', () => {
    const snap = composeBoardSnapshot(board, lists, cardsByList, members);
    expect(snap.lists.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(snap.lists[0].cardIds).toEqual(['c1', 'c2']);
    expect(snap.cards.c1.title).toBe('First');
    expect(snap.cards.c1.positionIdx).toBe('a0');
    expect(snap.board.memberIds).toEqual(['u1']);
    expect(snap.members.u1.firstName).toBe('Ada');
  });
});
