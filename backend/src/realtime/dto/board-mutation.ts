/**
 * Wire types for the real-time pipeline. Payloads are deliberately *lightweight
 * state mutations* — the minimum a peer needs to reconcile its optimistic UI —
 * never full entities, per `.cursorrules` §4.
 */
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

/** Kinds of board mutation broadcast to peers. */
export type BoardMutationType =
  | 'card.created'
  | 'card.moved'
  | 'card.updated'
  | 'card.deleted'
  | 'list.created'
  | 'list.updated'
  | 'list.deleted';

/**
 * The lightweight state delta. `cardId`/`listId`/`positionIdx` cover the card
 * movement case called out in the task; `listId` doubles as the target list on
 * a move. Absent fields simply don't apply to that mutation type.
 */
export interface BoardMutationPayload {
  cardId?: string;
  listId?: string;
  /** Fractional/positional index of the moved or reordered item. */
  positionIdx?: number;
}

/**
 * A sequenced, self-describing broadcast frame. `seq` is a per-board monotonic
 * id; a client stores the highest `seq` it has applied and asks for everything
 * after it on reconnect (delta-sync).
 */
export interface BoardMutationEnvelope {
  seq: number;
  boardId: string;
  type: BoardMutationType;
  payload: BoardMutationPayload;
  /** Epoch millis the mutation was published. */
  ts: number;
}

/**
 * Client -> server join request. Declared as a class with `class-validator`
 * decorators so the gateway's `ValidationPipe` actually validates it — an
 * `interface` has no runtime metadata and the pipe would silently no-op.
 */
export class BoardJoinRequest {
  @IsString()
  @IsNotEmpty()
  boardId!: string;
}

/** Server -> client join acknowledgement carrying the current head sequence. */
export interface BoardJoinAck {
  boardId: string;
  /** Highest sequence currently published for the board (0 if none yet). */
  headSeq: number;
}

/** Client -> server delta-sync request after a reconnect. */
export class BoardSyncRequest {
  @IsString()
  @IsNotEmpty()
  boardId!: string;

  /** Highest sequence the client has already applied. */
  @IsNumber()
  lastSeq!: number;
}

/** Server -> client delta-sync response: the ordered gap of missed frames. */
export interface BoardSyncResult {
  boardId: string;
  events: BoardMutationEnvelope[];
  /** Head sequence after replay, so the client can detect further gaps. */
  headSeq: number;
}
