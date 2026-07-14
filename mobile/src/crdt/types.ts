/**
 * Shared CRDT wire/merge types. Everything here is transport-agnostic: the same
 * shapes describe a locally-stamped edit and a record pulled from the server.
 */

/** A single last-writer-wins register: a value plus the stamp that wrote it. */
export interface LwwRegister<T> {
  value: T;
  /** High-precision epoch microseconds (see HybridClock). */
  updatedAt: number;
  /** Origin device/replica id — the deterministic tie-break on equal stamps. */
  nodeId: string;
}

/**
 * A record whose mutable fields each carry their own LWW clock. `fields` holds
 * the current values; `clocks` holds the matching `<field>_updated_at` stamp
 * for every field, so merges compare field-by-field rather than whole-record.
 */
export interface VersionedRecord<F extends Record<string, unknown>> {
  id: string;
  fields: F;
  /** `clocks[k]` is the epoch-µs stamp of the last write to `fields[k]`. */
  clocks: FieldClocks<F>;
  /** Replica that produced the most recent write (per-field origin is in meta). */
  nodeId: string;
  /**
   * Deletion is modelled as an LWW register too, so a delete and a concurrent
   * edit resolve by timestamp (a later edit resurrects; a later delete wins).
   */
  deletedAt: number | null;
}

export type FieldClocks<F extends Record<string, unknown>> = {
  [K in keyof F]: number;
};

/** Which side a field-level merge chose — surfaced for logging/telemetry. */
export type MergeOutcome = 'local' | 'remote' | 'equal';
