/**
 * The state behind the root-mounted background-operation banner
 * (`components/ui/background-operation-banner.tsx`).
 *
 * Same external-store shape as `db/version.ts`: plain module state plus a
 * listener `Set`, consumed via `useSyncExternalStore`. That's deliberate —
 * it's what lets non-React code (`seedScaleData`, `applyImportChunks`,
 * `exportData`, `resetAllData`) push progress updates directly, with no
 * Context/Provider in scope, the same way those functions already call
 * `bumpDataVersion()` today.
 *
 * Only one operation is tracked at a time — the four call sites this backs
 * (fill test data, import, export, reset) are all things Settings/the fill
 * screen already gate behind a single `busy` flag, so a lone "current
 * operation" slot matches how the app actually uses this, and keeps the
 * banner simple (no queueing/stacking UI to design).
 */

export type BackgroundOperationId = 'import' | 'export' | 'fill-test-data' | 'reset';

export interface BackgroundOperation {
  id: BackgroundOperationId;
  label: string;
  /** 0-1, or null for indeterminate (no natural batch boundary to report against). */
  progress: number | null;
  /** e.g. "42,000 / 1,000,000" — shown under the label/progress bar. */
  detail?: string;
  cancellable: boolean;
}

export interface BackgroundOperationOutcome {
  ok: boolean;
  message: string;
}

/** Fired once, right when an operation transitions to its done state, carrying why. */
export interface BackgroundOperationCompletion {
  id: BackgroundOperationId;
  outcome: BackgroundOperationOutcome;
}

let active: BackgroundOperation | null = null;
const listeners = new Set<() => void>();
const completionListeners = new Set<(completion: BackgroundOperationCompletion) => void>();

/** A fresh cancel flag per operation id, so a stale cancel from a previous run of the same id can't leak into a new one. */
const cancelFlags = new Map<BackgroundOperationId, boolean>();

function notify(): void {
  for (const l of listeners) l();
}

export function startOperation(op: BackgroundOperation): void {
  cancelFlags.set(op.id, false);
  active = op;
  notify();
}

export function updateOperation(id: BackgroundOperationId, patch: Partial<BackgroundOperation>): void {
  if (!active || active.id !== id) return;
  active = { ...active, ...patch };
  notify();
}

export function finishOperation(id: BackgroundOperationId, outcome: BackgroundOperationOutcome): void {
  if (active?.id === id) {
    active = null;
    notify();
  }
  for (const l of completionListeners) l({ id, outcome });
}

/** Marks the operation cancelled; the caller's own `shouldCancel()` (reading `isCancelled`) is what actually stops the work. */
export function cancelOperation(id: BackgroundOperationId): void {
  cancelFlags.set(id, true);
}

export function isCancelled(id: BackgroundOperationId): boolean {
  return cancelFlags.get(id) === true;
}

export function subscribeOperations(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getActiveOperation(): BackgroundOperation | null {
  return active;
}

/** For the completion notification (Phase 3c) — fires after every finishOperation, regardless of who's currently mounted. */
export function subscribeOperationCompletions(
  fn: (completion: BackgroundOperationCompletion) => void
): () => void {
  completionListeners.add(fn);
  return () => completionListeners.delete(fn);
}
