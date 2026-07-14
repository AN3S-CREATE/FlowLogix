/**
 * Client mirror of the backend real-time wire types
 * (`backend/src/realtime/dto/board-mutation.ts`). Kept deliberately minimal —
 * the server only ever sends lightweight state deltas, never full entities.
 */

export type BoardMutationType =
  | 'card.created'
  | 'card.moved'
  | 'card.updated'
  | 'card.deleted'
  | 'list.created'
  | 'list.updated'
  | 'list.deleted';

export interface BoardMutationPayload {
  cardId?: string;
  listId?: string;
  positionIdx?: number;
}

export interface BoardMutationEnvelope {
  seq: number;
  boardId: string;
  type: BoardMutationType;
  payload: BoardMutationPayload;
  ts: number;
}

export interface BoardJoinAck {
  boardId: string;
  headSeq: number;
}

export interface BoardSyncResult {
  boardId: string;
  events: BoardMutationEnvelope[];
  headSeq: number;
}

/** Connection lifecycle surfaced to the UI (e.g. an "offline" banner). */
export type BoardConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'synced'
  | 'disconnected';

/** A local change the user made, queued for replay if made while offline. */
export interface QueuedOutbound {
  /** Client-generated id so a flush handler can dedupe idempotently. */
  id: string;
  type: BoardMutationType;
  payload: BoardMutationPayload;
  queuedAt: number;
}
