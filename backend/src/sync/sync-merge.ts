/**
 * Server-side field-level Last-Write-Wins merge — the master half of the mobile
 * `mergeRecord` CRDT. For each field it compares the client's `<field>_updated_at`
 * clock with the server's stored clock; the later stamp wins, and an exact tie is
 * broken by the greater canonical-JSON value (a total, replica-independent order,
 * identical to the mobile client so both sides converge). Deletion is an LWW
 * tombstone (`deletedAt`) whose later stamp wins.
 *
 * Pure — no I/O — so it is exhaustively unit-testable and the persistence layer
 * (`SyncService`) stays a thin adapter over it.
 */

/** A record's synced state: field values keyed with their per-field LWW clocks. */
export interface RecordState {
  fields: Record<string, unknown>;
  /** epoch-µs clock per field (`sync_clocks` JSONB on the row). */
  clocks: Record<string, number>;
  /** Last writer's replica id (annotation only; never a merge input). */
  nodeId: string | null;
  /** LWW tombstone stamp (epoch-µs), or null when alive. */
  deletedAt: number | null;
}

export type FieldWinner = 'server' | 'client' | 'equal';

export interface ServerMergeResult {
  /** Authoritative merged state to persist on the server row. */
  merged: RecordState;
  /** Per-field winner, for diagnostics/tests. */
  report: Record<string, FieldWinner>;
  /** The merged state differs from the server's prior state → a write is needed. */
  serverChanged: boolean;
  /** The client contributed at least one winning field or a newer tombstone. */
  clientAccepted: boolean;
  /** The server holds a field/tombstone newer than the client's → echo it back. */
  serverAhead: boolean;
}

/**
 * Merge a client change into the server's current record state. `server` is the
 * master's view (from the DB row); `client` is the incoming change from the sync
 * log. The result is order-independent and idempotent, so replaying the same
 * change never diverges.
 */
export function mergeServerRecord(
  server: RecordState,
  client: RecordState,
): ServerMergeResult {
  const fields: Record<string, unknown> = {};
  const clocks: Record<string, number> = {};
  const report: Record<string, FieldWinner> = {};
  let serverChanged = false;
  let clientAccepted = false;

  const keys = new Set<string>([
    ...Object.keys(server.fields),
    ...Object.keys(client.fields),
  ]);

  for (const key of keys) {
    const sClock = server.clocks[key] ?? 0;
    const cClock = client.clocks[key] ?? 0;
    const winner = pickField(
      sClock,
      server.fields[key],
      cClock,
      client.fields[key],
    );
    report[key] = winner;

    if (winner === 'client') {
      fields[key] = client.fields[key];
      clocks[key] = cClock;
      serverChanged = true;
      clientAccepted = true;
    } else {
      // 'server' or 'equal' — keep the server's value and clock unchanged.
      fields[key] = server.fields[key];
      clocks[key] = sClock;
    }
  }

  const deletedAt = mergeTombstone(server.deletedAt, client.deletedAt);
  if (deletedAt !== server.deletedAt) serverChanged = true;
  if ((client.deletedAt ?? 0) > (server.deletedAt ?? 0)) clientAccepted = true;

  const nodeId = newestNode(server, client);
  const serverAhead = isServerAhead(server, client);

  return {
    merged: { fields, clocks, nodeId, deletedAt },
    report,
    serverChanged,
    clientAccepted,
    serverAhead,
  };
}

/** Whether a record is currently deleted: tombstone at least as new as its newest field write. */
export function isDeleted(record: RecordState): boolean {
  if (record.deletedAt === null) return false;
  const newest = Math.max(0, ...Object.values(record.clocks));
  return record.deletedAt >= newest;
}

/** Field winner by clock, then by a stable value comparison on an exact tie. */
function pickField(
  sClock: number,
  sValue: unknown,
  cClock: number,
  cValue: unknown,
): FieldWinner {
  if (sClock !== cClock) return sClock > cClock ? 'server' : 'client';
  const cmp = compareValues(sValue, cValue);
  if (cmp === 0) return 'equal';
  return cmp > 0 ? 'server' : 'client';
}

/** Total order over arbitrary field values via canonical JSON (matches the client). */
function compareValues(a: unknown, b: unknown): number {
  const sa = JSON.stringify(a ?? null) ?? 'null';
  const sb = JSON.stringify(b ?? null) ?? 'null';
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** LWW on the deletion register; a tie keeps whichever stamp is non-null. */
function mergeTombstone(
  server: number | null,
  client: number | null,
): number | null {
  const s = server ?? 0;
  const c = client ?? 0;
  if (s === c) return server ?? client ?? null;
  return s > c ? server : client;
}

/** Converge the annotation `nodeId` to the newest writer so both sides agree. */
function newestNode(server: RecordState, client: RecordState): string | null {
  const sMax = Math.max(0, ...Object.values(server.clocks));
  const cMax = Math.max(0, ...Object.values(client.clocks));
  if (sMax !== cMax) return sMax > cMax ? server.nodeId : client.nodeId;
  // Tie: prefer the lexicographically greater id, deterministically.
  return (server.nodeId ?? '') >= (client.nodeId ?? '')
    ? server.nodeId
    : client.nodeId;
}

/** True if the server has any field/tombstone strictly newer than the client's. */
function isServerAhead(server: RecordState, client: RecordState): boolean {
  for (const key of Object.keys(server.fields)) {
    if ((server.clocks[key] ?? 0) > (client.clocks[key] ?? 0)) return true;
  }
  return (server.deletedAt ?? 0) > (client.deletedAt ?? 0);
}
