/**
 * Redis key / Socket.io room naming for the real-time sync pipeline.
 *
 * The board is the unit of fan-out: every mutation to a board's lists or cards
 * is published to a single per-board Pub/Sub channel, and every socket that has
 * joined that board sits in the matching Socket.io room. Keeping the names in
 * one place guarantees the publisher (service layer) and subscriber (gateway)
 * never drift apart.
 */

/** Pub/Sub channel + Socket.io room for a board, per `.cursorrules` §4. */
export function boardRoom(boardId: string): string {
  return `board:room:${boardId}`;
}

/** Glob the gateway pattern-subscribes to so one subscription covers all boards. */
export const BOARD_ROOM_PATTERN = 'board:room:*';

/** Monotonic per-board sequence counter (INCR) that stamps every mutation. */
export function boardSequenceKey(boardId: string): string {
  return `board:seq:${boardId}`;
}

/**
 * Sorted set of recent mutation envelopes for a board, scored by sequence id.
 * A reconnecting client replays everything after its last processed id from
 * here (delta-sync), so it never has to refetch the whole board.
 */
export function boardReplayKey(boardId: string): string {
  return `board:events:${boardId}`;
}

/** Extract the boardId from a `board:room:{boardId}` channel name, or null. */
export function boardIdFromRoomChannel(channel: string): string | null {
  const prefix = 'board:room:';
  return channel.startsWith(prefix) ? channel.slice(prefix.length) : null;
}

/** How many recent mutations to retain per board for delta-sync replay. */
export const REPLAY_LOG_MAX_EVENTS = 500;

/** TTL (seconds) on a board's replay log; refreshed on every write. */
export const REPLAY_LOG_TTL_SECONDS = 60 * 60 * 24; // 24h

/** Socket.io event names exchanged with clients. */
export const WS_EVENTS = {
  /** Client -> server: join a board room (payload: BoardJoinRequest). */
  JOIN: 'board:join',
  /** Client -> server: leave a board room (payload: { boardId }). */
  LEAVE: 'board:leave',
  /** Client -> server: request missed events (payload: BoardSyncRequest). */
  SYNC: 'board:sync',
  /** Server -> client: successful join ack with the current head sequence. */
  JOINED: 'board:joined',
  /** Server -> client: delta-sync result (payload: BoardSyncResult). */
  SYNC_RESULT: 'board:sync:result',
  /** Server -> client: a single live mutation (payload: BoardMutationEnvelope). */
  MUTATION: 'board:mutation',
  /** Server -> client: an error the client should surface/handle. */
  ERROR: 'board:error',
} as const;
