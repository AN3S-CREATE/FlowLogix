import { apiRequest } from './http';

/** Wire shapes returned by the Nest boards/lists/cards/members APIs. */

export interface ApiBoard {
  id: string;
  title: string;
  description: string | null;
}

export interface ApiList {
  id: string;
  boardId: string;
  title: string;
  positionIdx: string;
  isArchived: boolean;
}

export interface ApiCard {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  positionIdx: string;
  isComplete: boolean;
  isArchived: boolean;
}

export interface ApiBoardMember {
  boardId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export function listBoards(): Promise<ApiBoard[]> {
  return apiRequest<ApiBoard[]>('/boards');
}

export function getBoard(boardId: string): Promise<ApiBoard> {
  return apiRequest<ApiBoard>(`/boards/${boardId}`);
}

export function listBoardLists(boardId: string): Promise<ApiList[]> {
  return apiRequest<ApiList[]>(`/boards/${boardId}/lists`);
}

export function listListCards(listId: string): Promise<ApiCard[]> {
  return apiRequest<ApiCard[]>(`/lists/${listId}/cards`);
}

export function listBoardMembers(boardId: string): Promise<ApiBoardMember[]> {
  return apiRequest<ApiBoardMember[]>(`/boards/${boardId}/members`);
}

export function createCard(
  listId: string,
  title: string,
): Promise<ApiCard> {
  return apiRequest<ApiCard>(`/lists/${listId}/cards`, {
    method: 'POST',
    body: { title },
  });
}

export interface MoveCardBody {
  listId: string;
  beforeCardId?: string;
  afterCardId?: string;
}

export function moveCard(cardId: string, body: MoveCardBody): Promise<ApiCard> {
  return apiRequest<ApiCard>(`/cards/${cardId}`, {
    method: 'PATCH',
    body,
  });
}
