/**
 * Stand-in for the real card-move mutation API. The Kanban store applies moves
 * optimistically (instant UI) and then awaits this; a rejection triggers a
 * rollback in the store. Swap this for a `fetch` to `PATCH /cards/:id` with
 * `Authorization: Bearer <jwt>` once the board is wired to the backend
 * (tenant comes from the JWT, not a client header).
 */
export interface PersistMovePayload {
  cardId: string;
  fromListId: string;
  toListId: string;
  toIndex: number;
}

// Flip to a value in (0,1) to exercise the rollback path during manual QA.
let failureRate = 0;

export function setPersistFailureRate(rate: number): void {
  failureRate = Math.min(1, Math.max(0, rate));
}

export function persistCardMove(payload: PersistMovePayload): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < failureRate) {
        reject(new Error(`Failed to persist move of card ${payload.cardId}`));
      } else {
        resolve();
      }
    }, 350);
  });
}
