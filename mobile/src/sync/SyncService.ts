import { HybridClock } from '../crdt/clock';
import { mergeRecord } from '../crdt/mergeRecord';
import { FieldClocks, VersionedRecord } from '../crdt/types';
import {
  CheckpointStore,
  CollectionName,
  LocalRecord,
  LocalStore,
  NetworkMonitor,
  RemoteChange,
  SyncTransport,
} from './ports';

export interface SyncServiceConfig<F extends Record<string, unknown>> {
  /** This device's stable replica id — the LWW tie-break key. */
  nodeId: string;
  store: LocalStore<F>;
  transport: SyncTransport<F>;
  network: NetworkMonitor;
  checkpoints: CheckpointStore;
  /** Injectable for deterministic tests; defaults to a shared HybridClock. */
  clock?: HybridClock;
}

export interface SyncReport {
  collection: CollectionName;
  pulled: number;
  merged: number;
  pushed: number;
  /** True when the run was skipped because the device is offline. */
  skippedOffline: boolean;
}

/**
 * Offline-first sync engine for one collection.
 *
 * **Offline path** — every mutation goes straight to local SQLite. `mutate`
 * stamps each changed field's `<field>_updated_at` clock with a high-precision
 * timestamp and flags the record `pending`; the UI reads local state and never
 * blocks on the network.
 *
 * **Reconnect path** — `sync` pulls server changes since the last checkpoint and
 * merges them **field-by-field** with the local copy via `mergeRecord` (the
 * later per-field timestamp wins), then pushes everything still `pending`. Pull
 * and push both go through the same CRDT merge, so the two replicas converge no
 * matter which side edited which field, or in what order the messages arrive.
 */
export class SyncEngine<F extends Record<string, unknown>> {
  private readonly clock: HybridClock;

  constructor(
    private readonly collection: CollectionName,
    private readonly cfg: SyncServiceConfig<F>,
  ) {
    this.clock = cfg.clock ?? new HybridClock();
  }

  /**
   * Create a new record with its **complete** initial field set, offline-first.
   * Requiring the full `F` (rather than a partial patch) keeps the record
   * type-safe — no field is ever left `undefined` for the storage layer to
   * choke on. Every field is stamped with the same creation timestamp.
   */
  async create(id: string, fields: F): Promise<LocalRecord<F>> {
    const now = this.clock.now();
    const clocks = {} as FieldClocks<F>;
    for (const key of Object.keys(fields) as (keyof F)[]) clocks[key] = now;

    const record: LocalRecord<F> = {
      id,
      fields: { ...fields },
      clocks,
      nodeId: this.cfg.nodeId,
      deletedAt: null,
      pending: true,
    };
    await this.cfg.store.put(record);
    return record;
  }

  /**
   * Apply a partial field update to an existing record, offline-first. Only the
   * fields in `patch` are re-stamped; untouched fields keep their old clocks so
   * a later remote edit to them can still win. Throws if the record is unknown
   * (use `create` first) so a partial patch can never produce a half-populated
   * record.
   */
  async mutate(id: string, patch: Partial<F>): Promise<LocalRecord<F>> {
    const existing = await this.cfg.store.getById(id);
    if (!existing) {
      throw new Error(`mutate: record "${id}" does not exist — call create()`);
    }
    const now = this.clock.now();

    const fields = { ...existing.fields };
    const clocks = { ...existing.clocks };
    for (const key of Object.keys(patch) as (keyof F)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      fields[key] = value as F[keyof F];
      clocks[key] = now; // strictly-increasing, so re-stamps always advance
    }

    const updated: LocalRecord<F> = {
      ...existing,
      fields,
      clocks,
      nodeId: this.cfg.nodeId,
      pending: true,
    };
    await this.cfg.store.put(updated);
    return updated;
  }

  /** Soft-delete a record (LWW tombstone), offline-first. */
  async remove(id: string): Promise<void> {
    const existing = await this.cfg.store.getById(id);
    if (!existing) return;
    await this.cfg.store.put({
      ...existing,
      deletedAt: this.clock.now(),
      nodeId: this.cfg.nodeId,
      pending: true,
    });
  }

  /**
   * Two-way sync. No-op (but not an error) when offline — mutations simply stay
   * queued locally until the next reconnect.
   */
  async sync(): Promise<SyncReport> {
    if (!this.cfg.network.isOnline()) {
      return {
        collection: this.collection,
        pulled: 0,
        merged: 0,
        pushed: 0,
        skippedOffline: true,
      };
    }

    const merged = await this.pullAndMerge();
    const pushed = await this.pushPending();

    return {
      collection: this.collection,
      pulled: merged.pulled,
      merged: merged.applied,
      pushed,
      skippedOffline: false,
    };
  }

  private async pullAndMerge(): Promise<{ pulled: number; applied: number }> {
    const since = await this.cfg.checkpoints.get(this.collection);
    const { changes, checkpoint } = await this.cfg.transport.pull(
      this.collection,
      since,
    );

    let applied = 0;
    for (const remote of changes) {
      if (await this.applyRemote(remote)) applied++;
    }

    // Advance the checkpoint only after every change is safely persisted, so a
    // crash mid-pull just re-fetches the same window next time (idempotent).
    await this.cfg.checkpoints.set(this.collection, checkpoint);
    return { pulled: changes.length, applied };
  }

  /** Merge one remote change into local state; returns true if local changed. */
  private async applyRemote(remote: RemoteChange<F>): Promise<boolean> {
    const local = await this.cfg.store.getById(remote.id);
    if (!local) {
      // Unseen record — accept the server copy wholesale; nothing local to keep.
      await this.cfg.store.put({ ...remote, pending: false });
      return true;
    }

    const { merged, changed } = mergeRecord(local, remote as VersionedRecord<F>);

    // Keep pushing our own edits until the server has acknowledged them. If the
    // merge preserved any locally-won field, we're still ahead of the server.
    const stillPending = local.pending && this.localIsAhead(local, remote);

    // Nothing changed and the pending flag is unchanged -> the record is
    // byte-identical; skip the (expensive on mobile) redundant write.
    if (!changed && stillPending === local.pending) return false;

    await this.cfg.store.put({ ...merged, pending: stillPending });
    return changed;
  }

  /** True if any local field clock is newer than the remote's for that field. */
  private localIsAhead(
    local: LocalRecord<F>,
    remote: RemoteChange<F>,
  ): boolean {
    for (const key of Object.keys(local.clocks) as (keyof F)[]) {
      if ((local.clocks[key] ?? 0) > (remote.clocks[key] ?? 0)) return true;
    }
    return (local.deletedAt ?? 0) > (remote.deletedAt ?? 0);
  }

  private async pushPending(): Promise<number> {
    const pending = await this.cfg.store.getPending();
    if (pending.length === 0) return 0;

    const changes: RemoteChange<F>[] = pending.map((r) => ({
      id: r.id,
      fields: r.fields,
      clocks: r.clocks,
      nodeId: r.nodeId,
      deletedAt: r.deletedAt,
    }));

    const { acceptedIds } = await this.cfg.transport.push(
      this.collection,
      changes,
    );
    const accepted = new Set(acceptedIds);

    for (const record of pending) {
      if (!accepted.has(record.id)) continue;
      const current = await this.cfg.store.getById(record.id);
      if (!current) continue;
      // Only clear `pending` if nothing changed the record while the push was in
      // flight (its clocks would differ), so a concurrent edit isn't lost.
      if (this.sameClocks(current, record)) {
        await this.cfg.store.put({ ...current, pending: false });
      }
    }
    return accepted.size;
  }

  private sameClocks(a: LocalRecord<F>, b: LocalRecord<F>): boolean {
    if ((a.deletedAt ?? 0) !== (b.deletedAt ?? 0)) return false;
    const keys = new Set([
      ...Object.keys(a.clocks),
      ...Object.keys(b.clocks),
    ]) as Set<keyof F>;
    for (const key of keys) {
      if ((a.clocks[key] ?? 0) !== (b.clocks[key] ?? 0)) return false;
    }
    return true;
  }
}

/**
 * Coordinates the per-collection engines and drives a full sync when the device
 * comes back online. Wire `start()` once at app boot.
 */
export class SyncService {
  private readonly engines: Record<CollectionName, SyncEngine<never>>;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly network: NetworkMonitor,
    makeEngine: <F extends Record<string, unknown>>(
      c: CollectionName,
    ) => SyncEngine<F>,
  ) {
    this.engines = {
      boards: makeEngine('boards'),
      lists: makeEngine('lists'),
      cards: makeEngine('cards'),
    };
  }

  engine<F extends Record<string, unknown>>(c: CollectionName): SyncEngine<F> {
    return this.engines[c] as unknown as SyncEngine<F>;
  }

  /** Sync every collection once (order: boards -> lists -> cards for FK sanity). */
  async syncAll(): Promise<SyncReport[]> {
    const order: CollectionName[] = ['boards', 'lists', 'cards'];
    const reports: SyncReport[] = [];
    for (const c of order) {
      reports.push(await this.engines[c].sync());
    }
    return reports;
  }

  /** Auto-sync whenever connectivity is (re)gained. */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.network.subscribe((online) => {
      if (online) this.runSync();
    });
    if (this.network.isOnline()) this.runSync();
  }

  /** Fire a background sync, swallowing errors so they never become an
   * unhandled rejection (which crashes RN) — a failed sync just retries next
   * time connectivity changes. */
  private runSync(): void {
    this.syncAll().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('LogixFlow sync failed', err);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
