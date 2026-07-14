import { io, Socket } from 'socket.io-client';
import {
  BoardConnectionStatus,
  BoardJoinAck,
  BoardMutationEnvelope,
  BoardMutationPayload,
  BoardMutationType,
  BoardSyncResult,
  QueuedOutbound,
} from './types';

/** Socket.io event names — must match `backend/.../realtime.constants.ts`. */
const WS = {
  JOIN: 'board:join',
  LEAVE: 'board:leave',
  SYNC: 'board:sync',
  JOINED: 'board:joined',
  SYNC_RESULT: 'board:sync:result',
  MUTATION: 'board:mutation',
  ERROR: 'board:error',
} as const;

export interface BoardSocketOptions {
  /** Base server URL, e.g. `http://localhost:3000`. */
  url: string;
  boardId: string;
  /** Active tenant id, sent in the handshake and validated server-side. */
  orgId: string;
  /**
   * Replays a queued outbound mutation the user made while offline. Should
   * perform the real write (e.g. PATCH /cards/:id) and resolve on success;
   * rejecting keeps the item queued for the next attempt. Idempotent on `id`.
   */
  flushOutbound?: (item: QueuedOutbound) => Promise<void>;
  /** Injectable storage (defaults to localStorage, with an in-memory fallback). */
  storage?: KeyValueStore;
}

/** The tiny slice of the Web Storage API this manager needs. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type MutationListener = (envelope: BoardMutationEnvelope) => void;
type StatusListener = (status: BoardConnectionStatus) => void;

function resolveStorage(injected?: KeyValueStore): KeyValueStore {
  if (injected) return injected;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Access can throw (private mode / disabled cookies) — fall through.
  }
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
}

/**
 * Client half of the real-time pipeline. Responsibilities:
 *
 *  - Join the board room over Socket.io and apply live `board:mutation` frames
 *    to local state in strict sequence order.
 *  - Persist the highest applied sequence id (`lastSeq`) in localStorage so a
 *    reconnect can **delta-sync** — it sends that id and the server replays only
 *    the frames it missed, never the whole board.
 *  - Detect sequence gaps (a frame arriving ahead of `lastSeq + 1`) and trigger
 *    a resync rather than applying out of order.
 *  - Buffer the user's own mutations made while offline in localStorage and
 *    flush them on reconnect, giving true bi-directional recovery.
 *
 * It is framework-agnostic: wire `onMutation` into a Zustand action to reconcile
 * the optimistic board state.
 */
export class BoardSocketManager {
  private readonly opts: BoardSocketOptions;
  private readonly store: KeyValueStore;
  private socket: Socket | null = null;
  private readonly mutationListeners = new Set<MutationListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private flushing = false;

  constructor(opts: BoardSocketOptions) {
    this.opts = opts;
    this.store = resolveStorage(opts.storage);
  }

  // --- lifecycle ---------------------------------------------------------

  connect(): void {
    if (this.socket) return;
    this.emitStatus('connecting');

    const socket = io(`${this.opts.url}/realtime`, {
      auth: { orgId: this.opts.orgId },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    this.socket = socket;

    // On every (re)connect: join, delta-sync the gap, then flush offline writes.
    socket.on('connect', () => {
      socket.emit(WS.JOIN, { boardId: this.opts.boardId });
    });

    socket.on(WS.JOINED, (ack: BoardJoinAck) => {
      this.emitStatus('connected');
      // If the server is ahead of us, pull the frames we missed while away.
      if (ack.headSeq > this.getLastSeq()) {
        this.requestSync();
      } else {
        this.emitStatus('synced');
      }
      void this.flushOutbox();
    });

    socket.on(WS.MUTATION, (envelope: BoardMutationEnvelope) => {
      this.handleIncoming(envelope);
    });

    socket.on(WS.SYNC_RESULT, (result: BoardSyncResult) => {
      // Frames are ordered; apply each exactly once and advance lastSeq.
      for (const envelope of result.events) {
        this.applyInOrder(envelope);
      }
      this.emitStatus(
        result.headSeq > this.getLastSeq() ? 'connected' : 'synced',
      );
    });

    socket.on('disconnect', () => this.emitStatus('disconnected'));
    socket.on('connect_error', () => this.emitStatus('disconnected'));
  }

  disconnect(): void {
    if (!this.socket) return;
    this.socket.emit(WS.LEAVE, { boardId: this.opts.boardId });
    this.socket.disconnect();
    this.socket = null;
    this.emitStatus('disconnected');
  }

  // --- subscriptions -----------------------------------------------------

  /** Apply an inbound, sequence-ordered mutation to local state. */
  onMutation(listener: MutationListener): () => void {
    this.mutationListeners.add(listener);
    return () => this.mutationListeners.delete(listener);
  }

  /** Observe connection/sync status (e.g. to toggle an offline banner). */
  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  // --- outbound (bi-directional) ----------------------------------------

  /**
   * Record a local change the user just made. If connected it flushes right
   * away; if offline it's persisted and replayed on reconnect. The write itself
   * still travels over the REST API (via `flushOutbound`) — the socket stays a
   * pure broadcast channel, matching the decoupled architecture.
   */
  enqueueOutbound(
    type: BoardMutationType,
    payload: BoardMutationPayload,
  ): void {
    const item: QueuedOutbound = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      payload,
      queuedAt: Date.now(),
    };
    const queue = this.readOutbox();
    queue.push(item);
    this.writeOutbox(queue);
    if (this.socket?.connected) void this.flushOutbox();
  }

  /** Number of outbound mutations still awaiting a successful flush. */
  pendingOutboundCount(): number {
    return this.readOutbox().length;
  }

  // --- internals ---------------------------------------------------------

  private handleIncoming(envelope: BoardMutationEnvelope): void {
    const lastSeq = this.getLastSeq();
    if (envelope.seq <= lastSeq) return; // already applied (duplicate)
    if (envelope.seq > lastSeq + 1) {
      // Gap: a frame is missing. Recover the whole run via delta-sync instead
      // of applying out of order.
      this.requestSync();
      return;
    }
    this.applyInOrder(envelope);
  }

  private applyInOrder(envelope: BoardMutationEnvelope): void {
    if (envelope.seq <= this.getLastSeq()) return;
    for (const listener of this.mutationListeners) listener(envelope);
    this.setLastSeq(envelope.seq);
  }

  private requestSync(): void {
    this.socket?.emit(WS.SYNC, {
      boardId: this.opts.boardId,
      lastSeq: this.getLastSeq(),
    });
  }

  private async flushOutbox(): Promise<void> {
    if (this.flushing || !this.opts.flushOutbound) return;
    if (!this.socket?.connected) return;
    this.flushing = true;
    try {
      // Drain in FIFO order; stop on the first failure so ordering is preserved.
      let queue = this.readOutbox();
      while (queue.length > 0 && this.socket?.connected) {
        const [next] = queue;
        try {
          await this.opts.flushOutbound(next);
        } catch {
          break; // leave `next` (and the rest) queued for the next attempt
        }
        queue = this.readOutbox().filter((item) => item.id !== next.id);
        this.writeOutbox(queue);
      }
    } finally {
      this.flushing = false;
    }
  }

  // --- persistence -------------------------------------------------------

  private get seqKey(): string {
    return `logixflow:lastSeq:${this.opts.boardId}`;
  }

  private get outboxKey(): string {
    return `logixflow:outbox:${this.opts.boardId}`;
  }

  getLastSeq(): number {
    const raw = this.store.getItem(this.seqKey);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  private setLastSeq(seq: number): void {
    this.store.setItem(this.seqKey, String(seq));
  }

  private readOutbox(): QueuedOutbound[] {
    const raw = this.store.getItem(this.outboxKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as QueuedOutbound[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeOutbox(queue: QueuedOutbound[]): void {
    if (queue.length === 0) {
      this.store.removeItem(this.outboxKey);
    } else {
      this.store.setItem(this.outboxKey, JSON.stringify(queue));
    }
  }

  private emitStatus(status: BoardConnectionStatus): void {
    for (const listener of this.statusListeners) listener(status);
  }
}
