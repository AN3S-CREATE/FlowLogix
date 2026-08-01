import { composeBoardSnapshot, BoardSnapshot } from './mapBoard';
import {
  createCard,
  getBoard,
  listBoardLists,
  listBoardMembers,
  listBoards,
  listListCards,
  moveCard as patchMoveCard,
  MoveCardBody,
  ApiCard,
} from './boardApi';
import { isApiMode } from './config';

/**
 * Load a full board (lists + cards + members) for hydration / resync.
 * Uses `boardId` when provided; otherwise the first org board.
 */
export async function fetchBoardSnapshot(
  boardId?: string,
): Promise<BoardSnapshot> {
  let id = boardId?.trim();
  if (!id) {
    const fromEnv = import.meta.env.VITE_BOARD_ID?.trim();
    if (fromEnv) id = fromEnv;
  }
  if (!id) {
    const boards = await listBoards();
    if (boards.length === 0) {
      throw new Error('No boards in this organization');
    }
    id = boards[0].id;
  }

  const [board, apiLists, apiMembers] = await Promise.all([
    getBoard(id),
    listBoardLists(id),
    listBoardMembers(id),
  ]);

  const cardEntries = await Promise.all(
    apiLists.map(async (list) => {
      const cards = await listListCards(list.id);
      return [list.id, cards] as const;
    }),
  );
  const cardsByList: Record<string, ApiCard[]> = Object.fromEntries(cardEntries);

  return composeBoardSnapshot(board, apiLists, cardsByList, apiMembers);
}

export async function apiCreateCard(
  listId: string,
  title: string,
): Promise<ApiCard> {
  return createCard(listId, title);
}

export async function apiMoveCard(
  cardId: string,
  body: MoveCardBody,
): Promise<ApiCard> {
  return patchMoveCard(cardId, body);
}

export { isApiMode };
