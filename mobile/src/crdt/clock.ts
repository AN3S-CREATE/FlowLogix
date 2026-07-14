/**
 * High-precision, strictly-monotonic timestamp source for LWW conflict
 * resolution. Two edits made in the same millisecond on one device must still
 * get distinct, ordered timestamps, otherwise same-device edits could tie and
 * resolution would fall back to the (arbitrary) node tie-break.
 *
 * We derive epoch **microseconds** from `Date.now()` and guarantee the returned
 * value never repeats or goes backwards within this process (a wall-clock step
 * backwards — NTP correction, DST — is absorbed by continuing from the last
 * issued value). Cross-device ordering still uses the wall clock; the node id
 * carried alongside each stamp breaks genuine ties (see `lwwRegister`).
 */
export class HybridClock {
  private last = 0;

  /** Returns a strictly-increasing epoch timestamp in microseconds. */
  now(): number {
    const wall = Date.now() * 1000; // ms -> µs
    // Never emit a value <= the previous one, even if the wall clock stalls or
    // rewinds; step by 1µs so ordering (and thus LWW) stays total and stable.
    this.last = wall > this.last ? wall : this.last + 1;
    return this.last;
  }
}

/** Process-wide default clock. Injectable elsewhere for deterministic tests. */
export const defaultClock = new HybridClock();

/** Convenience: a strictly-increasing epoch-microsecond timestamp. */
export function nowMicros(): number {
  return defaultClock.now();
}
