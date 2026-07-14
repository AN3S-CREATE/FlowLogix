import { VersionedRecord } from '../crdt/types';

/**
 * Hexagonal ports for the sync engine. The engine itself is pure orchestration
 * over these interfaces, so it can be exercised in Node with in-memory fakes
 * and backed by WatermelonDB + HTTP in the app — no test needs a device.
 */

/** Collections the mobile app syncs. */
export type CollectionName = 'boards' | 'lists' | 'cards';

/**
 * A record as held in local SQLite: the CRDT-versioned state plus a `pending`
 * flag marking locally-made edits that haven't been acknowledged by the server.
 */
export interface LocalRecord<F extends Record<string, unknown>>
  extends VersionedRecord<F> {
  /** True while this record carries local edits not yet pushed & accepted. */
  pending: boolean;
}

/** A record as it travels over the wire — identical CRDT shape, no local flags. */
export type RemoteChange<F extends Record<string, unknown>> = VersionedRecord<F>;

/** Local persistence port (implemented over WatermelonDB in the app). */
export interface LocalStore<F extends Record<string, unknown>> {
  getById(id: string): Promise<LocalRecord<F> | null>;
  /** Records with un-pushed local edits, oldest first. */
  getPending(): Promise<LocalRecord<F>[]>;
  /** Insert or replace a record atomically. */
  put(record: LocalRecord<F>): Promise<void>;
}

/** Remote sync port (implemented over the REST/edge API in the app). */
export interface SyncTransport<F extends Record<string, unknown>> {
  /** Everything changed on the server since `sinceCheckpoint` (0 = full pull). */
  pull(
    collection: CollectionName,
    sinceCheckpoint: number,
  ): Promise<PullResult<F>>;
  /** Push local changes; returns the ids the server accepted. */
  push(
    collection: CollectionName,
    changes: RemoteChange<F>[],
  ): Promise<PushResult>;
}

export interface PullResult<F extends Record<string, unknown>> {
  changes: RemoteChange<F>[];
  /** Server's high-precision clock at pull time — the next `sinceCheckpoint`. */
  checkpoint: number;
}

export interface PushResult {
  /** Ids the server committed; the engine clears their `pending` flag. */
  acceptedIds: string[];
}

/** Where the last-pulled checkpoint per collection is persisted. */
export interface CheckpointStore {
  get(collection: CollectionName): Promise<number>;
  set(collection: CollectionName, checkpoint: number): Promise<void>;
}

/** Coarse connectivity, shared by the sync engine and the upload queue. */
export type ConnectionType = 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';

export interface NetworkMonitor {
  isOnline(): boolean;
  connectionType(): ConnectionType;
  /** Subscribe to connectivity changes; returns an unsubscribe fn. */
  subscribe(listener: (online: boolean, type: ConnectionType) => void): () => void;
}
