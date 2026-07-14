import { LwwRegister, MergeOutcome } from './types';

/**
 * Merge two last-writer-wins registers. The later `updatedAt` wins; on an exact
 * timestamp tie the lexicographically-greater `nodeId` wins. Because that rule
 * is total and deterministic, every replica that sees the same two registers —
 * in any order — converges on the same result (the defining CRDT property).
 */
export function mergeRegister<T>(
  a: LwwRegister<T>,
  b: LwwRegister<T>,
): LwwRegister<T> {
  return pickLater(a, b) === 1 ? a : b;
}

/** True when `a` should win over `b` under the LWW rule. */
export function registerWins<T>(a: LwwRegister<T>, b: LwwRegister<T>): boolean {
  return pickLater(a, b) === 1;
}

/** Which register is newer: 1 = a, -1 = b. Never returns 0 (ties broken by node). */
function pickLater<T>(a: LwwRegister<T>, b: LwwRegister<T>): 1 | -1 {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? 1 : -1;
  // Equal stamps (e.g. two replicas edited "simultaneously"): break by node id.
  if (a.nodeId !== b.nodeId) return a.nodeId > b.nodeId ? 1 : -1;
  // Same node, same stamp — genuinely identical write; either is fine.
  return 1;
}

/** Compare two stamps (value + clock + node) without materialising registers. */
export function compareStamps(
  aClock: number,
  aNode: string,
  bClock: number,
  bNode: string,
): MergeOutcome {
  if (aClock !== bClock) return aClock > bClock ? 'local' : 'remote';
  if (aNode !== bNode) return aNode > bNode ? 'local' : 'remote';
  return 'equal';
}
