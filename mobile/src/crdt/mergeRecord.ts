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
 * `<field>_updated_at` clocks. For each field the value with the later clock
 * wins; on an exact clock tie the winner is the **greater value** under a stable
 * comparison.
 *
 * The tie-break deliberately does NOT consult any record-level metadata (like a
 * mutable `nodeId`): since each device runs the merge with its own copy as
 * `local`, a tie-break that depended on a mutable, whole-record field could make
 * two replicas disagree on an old field whose origin differs from the record's
 * latest writer — breaking convergence. Comparing the values themselves is a
 * total, order-independent function of the two inputs alone, so every replica
 * converges regardless of merge order. `nodeId` is carried only as a
 * "last writer" annotation and never feeds the merge.
 *
 * Deletion is an LWW tombstone (`deletedAt`) merged by keeping the later stamp;
 * visibility is derived against the newest field write (see `isDeleted`), so a
 * later edit resurrects and a later delete buries.
 *
 * Pure — no I/O — so it can be unit-tested exhaustively and reused on either
 * side of the wire.
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
    const winner = pickField(
      lClock,
      local.fields[key],
      rClock,
      remote.fields[key],
    );
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

  // Deletion register: later stamp wins (a tie keeps whichever is non-null).
  const deletedAt = mergeDeletion(local, remote);
  if (deletedAt !== local.deletedAt) changed = true;

  // `nodeId` is annotation only (not a merge input). Converge it deterministically
  // to the newest writer's id so both replicas agree; flag a change if it moves.
  const nodeId = newestNode(local, remote);
  if (nodeId !== local.nodeId) changed = true;

  const merged: VersionedRecord<F> = { id: local.id, fields, clocks, nodeId, deletedAt };
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

/**
 * Field winner by clock, then by a stable value comparison on an exact tie.
 * `>= 0` keeps local, so both replicas (which swap local/remote) still pick the
 * lexicographically-greater value — a total, order-independent choice.
 */
function pickField(
  lClock: number,
  lValue: unknown,
  rClock: number,
  rValue: unknown,
): 'local' | 'remote' | 'equal' {
  if (lClock !== rClock) return lClock > rClock ? 'local' : 'remote';
  const cmp = compareValues(lValue, rValue);
  if (cmp === 0) return 'equal';
  return cmp > 0 ? 'local' : 'remote';
}

/** Total order over arbitrary field values via canonical JSON. */
function compareValues(a: unknown, b: unknown): number {
  const sa = JSON.stringify(a ?? null) ?? 'null';
  const sb = JSON.stringify(b ?? null) ?? 'null';
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** LWW on the deletion register; null (alive) vs a stamp (deleted). */
function mergeDeletion<F extends Record<string, unknown>>(
  local: VersionedRecord<F>,
  remote: VersionedRecord<F>,
): number | null {
  const l = local.deletedAt ?? 0;
  const r = remote.deletedAt ?? 0;
  if (l === r) return local.deletedAt ?? remote.deletedAt ?? null;
  return l > r ? local.deletedAt : remote.deletedAt;
}

function newestNode<F extends Record<string, unknown>>(
  local: VersionedRecord<F>,
  remote: VersionedRecord<F>,
): string {
  const lMax = maxFieldClock(local);
  const rMax = maxFieldClock(remote);
  if (lMax !== rMax) return lMax > rMax ? local.nodeId : remote.nodeId;
  return local.nodeId > remote.nodeId ? local.nodeId : remote.nodeId;
}
