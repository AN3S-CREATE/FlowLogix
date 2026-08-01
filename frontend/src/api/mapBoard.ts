import { BoardSummary, Card, Id, List, Member } from '../store/types';
import { ApiBoard, ApiBoardMember, ApiCard, ApiList } from './boardApi';

export interface BoardSnapshot {
  board: BoardSummary;
  lists: List[];
  cards: Record<Id, Card>;
  members: Record<Id, Member>;
}

function byPositionAsc(
  a: { positionIdx: string },
  b: { positionIdx: string },
): number {
  if (a.positionIdx < b.positionIdx) return -1;
  if (a.positionIdx > b.positionIdx) return 1;
  return 0;
}

export function mapApiCard(api: ApiCard): Card {
  return {
    id: api.id,
    title: api.title,
    description: api.description ?? undefined,
    priority: 'medium',
    assigneeIds: [],
    checklist: [],
    isComplete: api.isComplete,
    positionIdx: api.positionIdx,
  };
}

export function mapApiMembers(rows: ApiBoardMember[]): {
  members: Record<Id, Member>;
  memberIds: Id[];
} {
  const members: Record<Id, Member> = {};
  const memberIds: Id[] = [];
  for (const row of rows) {
    const id = row.userId;
    memberIds.push(id);
    const u = row.user;
    members[id] = {
      id,
      firstName: u?.firstName ?? 'Member',
      lastName: u?.lastName ?? '',
      role: row.role,
    };
  }
  return { members, memberIds };
}

/**
 * Compose a Zustand-ready board snapshot from REST payloads.
 * Lists and cards are ordered by server `positionIdx` (Base62).
 */
export function composeBoardSnapshot(
  board: ApiBoard,
  apiLists: ApiList[],
  cardsByList: Record<string, ApiCard[]>,
  apiMembers: ApiBoardMember[],
): BoardSnapshot {
  const { members, memberIds } = mapApiMembers(apiMembers);
  const sortedLists = [...apiLists]
    .filter((l) => !l.isArchived)
    .sort(byPositionAsc);

  const cards: Record<Id, Card> = {};
  const lists: List[] = sortedLists.map((list) => {
    const listCards = [...(cardsByList[list.id] ?? [])]
      .filter((c) => !c.isArchived)
      .sort(byPositionAsc);
    for (const c of listCards) {
      cards[c.id] = mapApiCard(c);
    }
    return {
      id: list.id,
      title: list.title,
      cardIds: listCards.map((c) => c.id),
    };
  });

  return {
    board: {
      id: board.id,
      title: board.title,
      memberIds,
    },
    lists,
    cards,
    members,
  };
}
