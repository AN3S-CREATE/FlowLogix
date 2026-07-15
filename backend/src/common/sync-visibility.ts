/**
 * CRDT deletion visibility for the web read paths.
 *
 * The mobile `/sync` endpoint marks a record deleted with an LWW tombstone
 * (`sync_deleted_at`, epoch-µs) rather than removing the row, so the tombstone
 * can lose to a *later* field edit and the record resurrects. A record is
 * therefore currently deleted only when its tombstone is **at least as new as
 * its newest field write** — exactly the mobile `isDeleted` rule, kept in sync
 * so client and server agree on what's visible.
 *
 * This is applied in the web CRUD **read** endpoints only — never in
 * `TenantAccessService` (which the sync merge and mutations use and must still
 * see tombstoned rows to resurrect or update them).
 */
export interface SyncDeletable {
  syncDeletedAt: number | null;
  // Nullable/optional: the `sync_clocks` JSONB column can be null for rows that
  // predate the sync metadata, which is why the reads below guard with `?? {}`.
  syncClocks?: Record<string, number> | null;
}

/** True if the record's tombstone dominates its newest field write. */
export function isSyncDeleted(row: SyncDeletable): boolean {
  if (row.syncDeletedAt === null || row.syncDeletedAt === undefined) {
    return false;
  }
  // `sync_clocks` is JSONB, so a malformed value could be non-numeric. Keep only
  // finite numbers: a stray NaN in the spread would make `Math.max` return NaN,
  // every `>=` comparison false, and a genuinely-deleted row leak into reads.
  const clockValues = Object.values(row.syncClocks ?? {})
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const newestFieldWrite = Math.max(0, ...clockValues);
  return row.syncDeletedAt >= newestFieldWrite;
}

/** Drop the currently-deleted records from a read result. */
export function filterVisible<T extends SyncDeletable>(rows: T[]): T[] {
  return rows.filter((row) => !isSyncDeleted(row));
}
