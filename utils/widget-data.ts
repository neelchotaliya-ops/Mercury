/**
 * Data access for the home screen widgets.
 *
 * Widget rendering and clicks run in a headless JS task — no React tree, no
 * FinanceProvider — so this module talks to AsyncStorage directly through the
 * same key the app uses. The pure helpers are kept separate from the I/O so
 * the logging rules can be tested without a device.
 */

import { FinanceState, QuickPreset, Transaction } from '@/types/finance';
import { loadFinanceState, saveFinanceState, PersistedFinanceState } from '@/storage/storage';
import { getMonthlyTotals, getTotalBalance } from '@/utils/selectors';
import { toMonthKey } from '@/utils/date';
import { generateId } from '@/utils/id';

export interface WidgetSummary {
  currency: string;
  balance: number;
  spentThisMonth: number;
  presets: QuickPreset[];
  /** False before onboarding, when there is nothing meaningful to show. */
  ready: boolean;
}

/** Selectors expect the in-memory shape, which adds the load flag. */
function asFinanceState(persisted: PersistedFinanceState): FinanceState {
  return { ...persisted, quickPresets: persisted.quickPresets ?? [], isLoaded: true };
}

/**
 * Builds the transaction a preset represents, or null when it cannot be saved.
 *
 * Pure so the rules stay testable: a preset is only valid if it has a positive
 * amount and resolves to an account that still exists.
 */
export function buildPresetTransaction(
  state: FinanceState,
  preset: QuickPreset,
  now: Date = new Date()
): Transaction | null {
  if (!(preset.amount > 0)) return null;

  const live = state.accounts.filter(account => !account.archived);
  // A preset can outlive the account or category it was created against.
  const account = live.find(a => a.id === preset.accountId) ?? live[0];
  if (!account) return null;

  const categoryExists = state.categories.some(
    c => c.id === preset.categoryId && c.kind === preset.type
  );

  return {
    id: generateId(),
    type: preset.type,
    amount: preset.amount,
    accountId: account.id,
    categoryId: categoryExists ? preset.categoryId : undefined,
    date: now.toISOString(),
    note: preset.label,
    createdAt: now.toISOString(),
  };
}

/** Numbers the widget renders. Safe to call before any data exists. */
export async function getWidgetSummary(): Promise<WidgetSummary> {
  const persisted = await loadFinanceState();

  if (!persisted) {
    return { currency: 'INR', balance: 0, spentThisMonth: 0, presets: [], ready: false };
  }

  const state = asFinanceState(persisted);
  const { expense } = getMonthlyTotals(state, toMonthKey(new Date()));

  return {
    currency: state.settings.currency,
    balance: getTotalBalance(state),
    spentThisMonth: expense,
    presets: state.quickPresets,
    ready: state.settings.hasOnboarded,
  };
}

export type LogPresetResult =
  | { ok: true; transaction: Transaction; summary: WidgetSummary }
  | { ok: false; reason: 'no-data' | 'unknown-preset' | 'invalid' };

/**
 * Writes the transaction for a preset straight to storage. This is what makes
 * the widget's one-tap logging work without ever opening the app.
 */
export async function logPreset(presetId: string): Promise<LogPresetResult> {
  const persisted = await loadFinanceState();
  if (!persisted) return { ok: false, reason: 'no-data' };

  const state = asFinanceState(persisted);
  const preset = state.quickPresets.find(p => p.id === presetId);
  if (!preset) return { ok: false, reason: 'unknown-preset' };

  const transaction = buildPresetTransaction(state, preset);
  if (!transaction) return { ok: false, reason: 'invalid' };

  const next: FinanceState = { ...state, transactions: [...state.transactions, transaction] };
  const { isLoaded, ...persistable } = next;
  await saveFinanceState(persistable);

  const { expense } = getMonthlyTotals(next, toMonthKey(new Date()));

  return {
    ok: true,
    transaction,
    summary: {
      currency: next.settings.currency,
      balance: getTotalBalance(next),
      spentThisMonth: expense,
      presets: next.quickPresets,
      ready: true,
    },
  };
}
