/**
 * The invalidation signal every query hook subscribes to.
 *
 * Deliberately one counter for the whole database rather than a per-table
 * version (transactions vs. accounts vs. settings): a write to any table can
 * affect a derived read on another (an account delete changes every balance
 * and budget figure that touches it), and getting that fan-out exactly right
 * per call site is easy to get wrong quietly. One counter, bumped after every
 * write, means every mounted query hook re-fetches on every mutation — coarser
 * than strictly necessary, but each re-fetch is a cheap indexed query against
 * the rollup/entities tables, not a re-scan of the ledger, so the cost of the
 * coarseness is small. Splitting this by table is a reasonable later
 * optimization if a specific screen's re-fetch rate is ever actually a
 * measured problem.
 */
let version = 0;
const listeners = new Set<() => void>();

export function bumpDataVersion(): void {
  version++;
  for (const l of listeners) l();
}

export function getDataVersion(): number {
  return version;
}

export function subscribeDataVersion(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
