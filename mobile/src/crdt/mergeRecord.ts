import { FieldClocks, VersionedRecord } from './types';

/** Per-field record of which side won, for logging and tests. */
export type FieldMergeReport<F extends Record<string, unknown>> = {
  [K in keyof F]: 'local' | 'remote' | 'equal';
};

export interface MergeResult<F extends Record<string, unknown>> {
  merged: VersionedRecord<F>;
  report: FieldMergeReport<F>;
  /** True if the merged record differs from `local` (i.e. a write is needed). */
  changed: boolean;
}

/**
 * Merge two versions of the same record field-by-field using their
 * `<field>_updated_at` clocks. For each field the value with the later clock is
 * kept; an exact clock tie is broken by the record's `nodeId` (deterministic,
 * so all replicas converge).
 *
 * Deletion is an LWW tombstone (`deletedAt`) that is itself merged by keeping
 * the later stamp, but *visibility* is derived by comparing that stamp against
 * the record's newest field write (see `isDeleted`). So a field edit newer than
 * the delete resurrects the record, and a delete newer than every field write
 * buries it — matching the "latest edit wins" rule end-to-end. (The tradeoff:
 * an offline edit to a card another device deleted will resurrect it; that's
 * the intended LWW semantics, not a bug.)
 *
 * This is intentionally pure — no I/O — so it can be unit-tested exhaustively
 * and reused on either side of the wire.
 */
export function mergeRecord<F extends Record<string, unknown>>(
  local: VersionedRecord<F>,
  remote: VersionedRecord<F>,
): MergeResult<F> {
  if (local.id !== remote.id) {
    throw new Error(
      `Cannot merge different records: ${local.id} vs ${remote.id}`,
    );
  }

  const fields = {} as F;
  const clocks = {} as FieldClocks<F>;
  const report = {} as FieldMergeReport<F>;
  let changed = false;

  const keys = new Set<keyof F>([
    ...(Object.keys(local.fields) as (keyof F)[]),
    ...(Object.keys(remote.fields) as (keyof F)[]),
  ]);

  for (const key of keys) {
    const lClock = local.clocks[key] ?? 0;
    const rClock = remote.clocks[key] ?? 0;
    const winner = pickSide(lClock, local.nodeId, rClock, remote.nodeId);
    report[key] = winner;

    if (winner === 'remote') {
      fields[key] = remote.fields[key];
      clocks[key] = rClock;
      changed = true;
    } else {
      fields[key] = local.fields[key];
      clocks[key] = lClock;
    }
  }

  // Deletion register: compare the two deletedAt stamps the same way.
  const deletedAt = mergeDeletion(local, remote);
  if (deletedAt !== local.deletedAt) changed = true;

  const merged: VersionedRecord<F> = {
    id: local.id,
    fields,
    clocks,
    // The surviving nodeId is whichever side supplied the newest field write;
    // if nothing changed we keep local's.
    nodeId: changed ? newestNode(local, remote) : local.nodeId,
    deletedAt,
  };

  return { merged, report, changed };
}

/** The newest field-write stamp on a record (0 if it has no clocks). */
export function maxFieldClock<F extends Record<string, unknown>>(
  record: VersionedRecord<F>,
): number {
  return Math.max(0, ...Object.values(record.clocks));
}

/**
 * Whether a record is currently deleted: it has a tombstone whose stamp is at
 * least as new as its newest field write. A later field edit therefore makes it
 * visible again; a later delete hides it. Pure derivation of merged state, so
 * all replicas agree.
 */
export function isDeleted<F extends Record<string, unknown>>(
  record: VersionedRecord<F>,
): boolean {
  return record.deletedAt !== null && record.deletedAt >= maxFieldClock(record);
}

/** LWW on the deletion register; null (alive) vs a stamp (deleted). */
function mergeDeletion<F extends Record<string, unknown>>(
  local: VersionedRecord<F>,
  remote: VersionedRecord<F>,
): number | null {
  const l = local.deletedAt ?? 0;
  const r = remote.deletedAt ?? 0;
  const winner = pickSide(l, local.nodeId, r, remote.nodeId);
  const chosen = winner === 'remote' ? remote.deletedAt : local.deletedAt;
  return chosen ?? null;
}

/** 'local' | 'remote' | 'equal' under the LWW + node tie-break rule. */
function pickSide(
  lClock: number,
  lNode: string,
  rClock: number,
  rNode: string,
): 'local' | 'remote' | 'equal' {
  if (lClock !== rClock) return lClock > rClock ? 'local' : 'remote';
  if (lNode !== rNode) return lNode > rNode ? 'local' : 'remote';
  return 'equal';
}

function newestNode<F extends Record<string, unknown>>(
  local: VersionedRecord<F>,
  remote: VersionedRecord<F>,
): string {
  const lMax = Math.max(0, ...Object.values(local.clocks));
  const rMax = Math.max(0, ...Object.values(remote.clocks));
  if (lMax !== rMax) return lMax > rMax ? local.nodeId : remote.nodeId;
  return local.nodeId > remote.nodeId ? local.nodeId : remote.nodeId;
}
