/**
 * Card-move persistence. In API mode (`VITE_API_URL`) this PATCHes the Nest
 * cards endpoint with neighbor ids so the server mints the fractional key.
 * In demo mode it resolves after a short delay (optional failure injection).
 */
import { isApiMode } from '../api/config';
import { apiMoveCard } from '../api/boardLoader';

export interface PersistMovePayload {
  cardId: string;
  fromListId: string;
  toListId: string;
  toIndex: number;
  /** Neighbor immediately before the card after the optimistic reorder. */
  beforeCardId?: string;
  /** Neighbor immediately after the card after the optimistic reorder. */
  afterCardId?: string;
}

// Flip to a value in (0,1) to exercise the rollback path during manual QA (demo only).
let failureRate = 0;

export function setPersistFailureRate(rate: number): void {
  failureRate = Math.min(1, Math.max(0, rate));
}

export interface PersistMoveResult {
  /** Server-minted fractional key when API mode succeeds. */
  positionIdx?: string;
}

export async function persistCardMove(
  payload: PersistMovePayload,
): Promise<PersistMoveResult> {
  if (isApiMode()) {
    const body: {
      listId: string;
      beforeCardId?: string;
      afterCardId?: string;
    } = { listId: payload.toListId };
    if (payload.beforeCardId) body.beforeCardId = payload.beforeCardId;
    if (payload.afterCardId) body.afterCardId = payload.afterCardId;
    const saved = await apiMoveCard(payload.cardId, body);
    return { positionIdx: saved.positionIdx };
  }

  await new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < failureRate) {
        reject(new Error(`Failed to persist move of card ${payload.cardId}`));
      } else {
        resolve();
      }
    }, 350);
  });
  return {};
}
